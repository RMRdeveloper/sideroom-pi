import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from '@babel/parser';
import type {
  ExtensionAPI,
  ExtensionToolContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { configureSource } from './configure.ts';
import { discoverProjects, inspectProject } from './projects.ts';
import {
  prepareSetup,
  registerVisualSetup,
  VISUAL_SETUP_TOOL,
} from './setup.ts';

test('discovers independent child projects, inherits workspace managers, and excludes ignored or linked projects', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-projects-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@10.0.0', workspaces: ['apps/*'] }),
  );
  writeFileSync(join(root, '.gitignore'), 'ignored/\n');
  for (const project of [
    'apps/shop',
    'apps/admin',
    'ignored',
    'node_modules/example',
    '.hidden',
  ]) {
    mkdirSync(join(root, project), { recursive: true });
    writeFileSync(
      join(root, project, 'package.json'),
      JSON.stringify({ name: project }),
    );
    writeFileSync(join(root, project, 'vite.config.ts'), 'export default {};');
  }
  symlinkSync(join(root, 'apps/shop'), join(root, 'linked'));
  const discovery = discoverProjects(root);
  assert.deepEqual(
    discovery.projects.map((project) => project.path),
    ['.', 'apps/admin', 'apps/shop'],
  );
  assert.equal(inspectProject(root, 'apps/shop').manager, 'pnpm');
  assert.equal(discovery.truncated, false);
  assert.throws(() => prepareSetup(root, '../outside'));
  assert.throws(() => prepareSetup(root, 'linked'));
});

test('prepare returns a complete edit and install command without mutating the project', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-prepare-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'shop'));
  writeFileSync(
    join(root, 'shop/package.json'),
    JSON.stringify({
      packageManager: 'bun@1.3.0',
      scripts: { check: 'tsc', build: 'vite build' },
    }),
  );
  const original =
    "import { defineConfig } from 'vite';\nexport default defineConfig({ plugins: [react()], server: { port: 7501 } });";
  writeFileSync(join(root, 'shop/vite.config.ts'), original);
  const plan = prepareSetup(root, 'shop');
  assert.equal(plan.edit.oldText, original);
  assert.equal(
    readFileSync(join(root, 'shop/vite.config.ts'), 'utf8'),
    original,
  );
  assert.deepEqual(plan.install, {
    cwd: join(root, 'shop'),
    command: 'bun',
    args: ['add', '--dev', '@code-inspector/core@2.0.9'],
  });
  assert.match(plan.edit.newText, /plugins: \[sideroomSourceLocations/u);
  assert.match(plan.edit.newText, /react\(\)/u);
  assert.match(plan.edit.newText, /server: \{ port: 7501 \}/u);
  assert.match(plan.edit.newText, /apply: 'serve'/u);
  assert.match(plan.edit.newText, /pathType: 'absolute'/u);
  assert.doesNotMatch(plan.edit.newText, /dev: true/u);
  assert.deepEqual(plan.checkScripts, ['check', 'build']);
  assert.throws(
    () => configureSource({ source: plan.edit.newText, kind: 'vite' }),
    /already exists/u,
  );
});

for (const fixture of [
  {
    kind: 'vite',
    source:
      "import {defineConfig} from 'vite'; export default defineConfig(() => ({plugins: [react(), /* retain */], base: '/shop'}));",
  },
  {
    kind: 'astro',
    source:
      "import {defineConfig} from 'astro/config'; export default defineConfig({site: 'https://example.com', vite: {plugins: []}});",
  },
  {
    kind: 'nuxt',
    source:
      'export default defineNuxtConfig({ modules: [], vite: { server: {} } });',
  },
  {
    kind: 'webpack',
    source:
      "'use strict'; module.exports = { plugins: [existing], mode: 'development' };",
    commonjs: true,
  },
  { kind: 'rspack', source: 'export default {plugins: []};' },
  {
    kind: 'next',
    source:
      'const config = {reactStrictMode: true} satisfies NextConfig; export default config;',
    nextMajor: 16,
  },
] as const) {
  test(`${fixture.kind}: adds compiler metadata without replacing existing settings`, () => {
    const configured = configureSource(fixture);
    parse(configured.source, {
      sourceType: 'unambiguous',
      plugins: ['typescript'],
    });
    assert.match(configured.source, /sideroomSourceLocations/u);
    assert.match(configured.source, /pathType: 'absolute'/u);
    assert.doesNotMatch(
      configured.source,
      /inject-loader|codeInspectorPlugin/u,
    );
  });
}

test('configuration plans reject mutations and multiple exports instead of preparing a silently overwritten integration', () => {
  for (const source of [
    'const config = {}; module.exports = config; config.plugins = [existing];',
    'const config = {}; config.plugins = [existing]; module.exports = config;',
    'module.exports = {}; module.exports = { plugins: [existing] };',
    'module.exports = {}; export default {};',
    'const config = {}; const ignored = Object.assign(config, { plugins: [existing] }); module.exports = config;',
    'const config = {}; const ignored = (config.plugins = [existing]); module.exports = config;',
    'const config = {}; export const ignored = mutate(config); export default config;',
    'const config = {}; module.exports = config; if (dev) { config.plugins = [existing]; }',
    'const config = {}; module.exports = config; for (const plugin of plugins) { config.plugins = [plugin]; }',
    'const config = {}; module.exports = config; try { config.plugins = [existing]; } catch (error) { throw error; }',
  ]) {
    assert.throws(
      () => configureSource({ source, kind: 'webpack', commonjs: true }),
      /manual integration/u,
    );
  }
});

test('configuration plans preserve runtime behavior and defer unsupported custom logic', () => {
  const original =
    "'use strict'; module.exports = { plugins: [existing], mode: 'development' };";
  const sandbox = {
    module: {
      exports: undefined as unknown as {
        plugins: (
          | {
            apply(compiler: {
              options: { mode: string; module?: { rules?: unknown[] } };
            }): void;
          }
          | string
        )[];
        mode: string;
      },
    },
    existing: 'existing',
    require: { resolve: (path: string) => path },
  };
  runInNewContext(
    configureSource({ source: original, kind: 'webpack', commonjs: true })
      .source,
    sandbox,
  );
  assert.equal(sandbox.module.exports.mode, 'development');
  assert.equal(sandbox.module.exports.plugins[1], 'existing');
  const plugin = sandbox.module.exports.plugins[0];
  assert.ok(plugin && typeof plugin !== 'string');
  const compiler = {
    options: { mode: 'development', module: { rules: [] as unknown[] } },
  };
  plugin.apply(compiler);
  assert.equal(compiler.options.module.rules.length, 1);
  assert.match(
    JSON.stringify(compiler.options.module.rules),
    /@code-inspector\/webpack\/dist\/loader.js/u,
  );
  const production = {
    options: { mode: 'production', module: { rules: [] as unknown[] } },
  };
  plugin.apply(production);
  assert.deepEqual(production.options.module.rules, []);
  for (const source of [
    'export default mergeConfig(base, custom);',
    'export default { ...base, plugins: [] };',
    'export default { plugins: dynamicPlugins };',
    'export default defineConfig(({mode}) => mode === "dev" ? {} : {});',
  ]) {
    assert.throws(() => configureSource({ source, kind: 'vite' }));
  }
  assert.throws(
    () =>
      configureSource({
        source: 'export default {};',
        kind: 'next',
        nextMajor: 15,
      }),
    /requires Next 16/u,
  );
});

test('setup tool enforces trust and explicit project selection without executing installations', async () => {
  let tool: ToolDefinition | undefined;
  const bindings: unknown[] = [];
  registerVisualSetup(
    {
      registerTool: (definition: ToolDefinition) => {
        tool = definition;
      },
    } as ExtensionAPI,
    (binding) => {
      bindings.push(binding);
    },
  );
  assert.ok(tool);
  assert.equal(tool.name, VISUAL_SETUP_TOOL);
  const untrusted = { isProjectTrusted: () => false } as ExtensionToolContext;
  await assert.rejects(
    tool.execute(
      'call',
      { action: 'discover' },
      undefined,
      undefined,
      untrusted,
    ),
    /Trust/u,
  );
  const trusted = {
    cwd: '/workspace',
    isProjectTrusted: () => true,
  } as ExtensionToolContext;
  await assert.rejects(
    tool.execute('call', { action: 'prepare' }, undefined, undefined, trusted),
    /explicit project/u,
  );
  await assert.rejects(
    tool.execute(
      'call',
      { action: 'bind', project: 'shop' },
      undefined,
      undefined,
      trusted,
    ),
    /browser page/u,
  );
  await tool.execute(
    'call',
    { action: 'bind', project: 'shop', page: 'http://localhost:5173' },
    undefined,
    undefined,
    trusted,
  );
  assert.deepEqual(bindings, [
    { project: 'shop', page: 'http://localhost:5173', cwd: '/workspace' },
  ]);
});

test('Next CommonJS setup resolves the metadata loader and excludes production rules', () => {
  const configured = configureSource({
    kind: 'next',
    source: 'module.exports = { reactStrictMode: true };',
    nextMajor: 16,
  });
  const sandbox = {
    module: {
      exports: undefined as unknown as {
        turbopack: { rules: Record<string, unknown> };
        webpack(
          config: { plugins: unknown[] },
          options: { dev: boolean },
        ): unknown;
      },
    },
    process: { env: { NODE_ENV: 'development' } },
    require: { resolve: (path: string) => path },
  };
  runInNewContext(configured.source, sandbox);
  assert.equal(Object.keys(sandbox.module.exports.turbopack.rules).length, 1);
  const development = { plugins: [] as unknown[] };
  sandbox.module.exports.webpack(development, { dev: true });
  assert.equal(development.plugins.length, 1);
  sandbox.process.env.NODE_ENV = 'production';
  runInNewContext(configured.source, sandbox);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.module.exports.turbopack.rules)),
    {},
  );
  const production = { plugins: [] as unknown[] };
  sandbox.module.exports.webpack(production, { dev: false });
  assert.deepEqual(production.plugins, []);
});
