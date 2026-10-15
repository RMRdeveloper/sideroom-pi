export const CONFIG_KINDS = [
  'astro',
  'nuxt',
  'next',
  'vite',
  'webpack',
  'rspack',
] as const;
export type ConfigKind = (typeof CONFIG_KINDS)[number];
export const INSPECTOR_PACKAGE = 'code-inspector-plugin';
export const INSPECTOR_VERSION = '2.0.9';

export const COMPILER_IDENTIFIER = 'sideroomSourceLocations';
export const CORE_PACKAGE = '@code-inspector/core';
export const LOADER_PACKAGE = '@code-inspector/webpack';
export const METADATA_LOADER = `${LOADER_PACKAGE}/dist/loader.js`;

export function compilerPackage(kind: ConfigKind): string {
  return kind === 'vite' || kind === 'astro' || kind === 'nuxt'
    ? CORE_PACKAGE
    : LOADER_PACKAGE;
}

interface CompilerIntegrationInput {
  readonly kind: ConfigKind;
  readonly commonjs: boolean;
  readonly typescript: boolean;
}

export function compilerIntegration({
  kind,
  commonjs,
  typescript,
}: CompilerIntegrationInput): string {
  const importBinding = (binding: string, packageName: string): string =>
    commonjs
      ? `const { ${binding.replaceAll(' as ', ': ')} } = require('${packageName}');`
      : `import { ${binding} } from '${packageName}';`;
  if (compilerPackage(kind) === CORE_PACKAGE) {
    const positionTypes = typescript
      ? 'source: string, id: string'
      : 'source, id';
    const constant = typescript ? ' as const' : '';
    const astroLoad =
      kind === 'astro'
        ? `
async load(${typescript ? 'id: string' : 'id'}) {
  if (!id.endsWith('.astro') || id.includes('/node_modules/')) {
    return;
  }
  return sideroomTransform({ content: await sideroomReadFile(id, 'utf8'), filePath: id, fileType: 'astro', escapeTags: [/^[A-Z]/, /[.:-]/], pathType: 'absolute' });
},`
        : '';
    return `${importBinding('transformCode as sideroomTransform', CORE_PACKAGE)}
${kind === 'astro' ? importBinding('readFile as sideroomReadFile', 'node:fs/promises') : ''}

function ${COMPILER_IDENTIFIER}() {
  return {
    name: 'sideroom-source-locations',
    enforce: 'pre'${constant},
    apply: 'serve'${constant},
    async transform(${positionTypes}) {
      const [file, query] = id.split('?');
      if (!file || query || file.includes('/node_modules/')) {
        return;
      }
      const fileType = /\\.(jsx|tsx|js|ts|mjs|mts)$/.test(file) ? 'jsx' : file.endsWith('.vue') ? 'vue' : file.endsWith('.svelte') ? 'svelte' : undefined;
      if (!fileType) {
        return;
      }
      return sideroomTransform({ content: source, filePath: file, fileType, escapeTags: [/^[A-Z]/, /[.:-]/], pathType: 'absolute' });
    },${astroLoad}
  };
}
`;
  }
  const imports = commonjs
    ? ''
    : `${importBinding('createRequire as sideroomCreateRequire', 'node:module')}
const sideroomRequire = sideroomCreateRequire(import.meta.url);`;
  const compilerType = typescript
    ? 'compiler: { options: { mode?: string; module?: { rules?: unknown[] } } }'
    : 'compiler';
  return `${imports}
function ${COMPILER_IDENTIFIER}() {
  return {
    apply(${compilerType}) {
      if (compiler.options.mode !== 'development') {
        return;
      }
      compiler.options.module ??= {};
      compiler.options.module.rules ??= [];
      compiler.options.module.rules.unshift({
        test: /\\.(jsx|tsx|js|ts|mjs|mts|vue|svelte)$/,
        exclude: /node_modules/,
        enforce: 'pre',
        use: [{ loader: ${commonjs ? 'require' : 'sideroomRequire'}.resolve('${METADATA_LOADER}'), options: { pathType: 'absolute' } }],
      });
    },
  };
}
`;
}
