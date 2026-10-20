import { parse } from '@babel/parser';
import {
  COMPILER_IDENTIFIER,
  CORE_PACKAGE,
  type ConfigKind,
  compilerIntegration,
  INSPECTOR_PACKAGE,
  LOADER_PACKAGE,
  METADATA_LOADER,
} from './compiler-config.ts';

type Expression = ReturnType<typeof import('@babel/parser').parseExpression>;
type ConfigObject = Extract<Expression, { type: 'ObjectExpression' }>;
type ConfigArray = Extract<Expression, { type: 'ArrayExpression' }>;
type Document = ReturnType<typeof parse>;
interface ConfigurationExport {
  readonly statement: Document['program']['body'][number];
  readonly expression: unknown;
}
interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}
interface ConfigureSourceInput {
  readonly source: string;
  readonly kind: ConfigKind;
  readonly commonjs?: boolean;
  readonly nextMajor?: number;
  readonly typescript?: boolean;
}
interface NestedConfigurationInput {
  readonly object: ConfigObject;
  readonly key: string;
  readonly member: string;
}

function keyName(
  property: ConfigObject['properties'][number],
): string | undefined {
  if (property.type === 'SpreadElement' || property.computed) {
    return undefined;
  }
  if (property.key.type === 'Identifier') {
    return property.key.name;
  }
  if (property.key.type === 'StringLiteral') {
    return property.key.value;
  }
  return undefined;
}

function referencesIdentifier(expression: unknown, name: string): boolean {
  if (!expression || typeof expression !== 'object') {
    return false;
  }
  if (Array.isArray(expression)) {
    return expression.some((child) => referencesIdentifier(child, name));
  }
  const node = expression as Record<string, unknown>;
  if (node.type === 'Identifier') {
    return node.name === name;
  }
  return Object.values(node).some((child) => referencesIdentifier(child, name));
}

function staticObject(expression: unknown, document: Document): ConfigObject {
  if (
    !expression ||
    typeof expression !== 'object' ||
    !('type' in expression)
  ) {
    throw new Error(
      'The exported configuration must resolve to one static object.',
    );
  }
  const node = expression as Expression;
  if (node.type === 'ObjectExpression') {
    return node;
  }
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return staticObject(node.expression, document);
  }
  if (node.type === 'Identifier') {
    for (const statement of document.program.body) {
      if (statement.type !== 'VariableDeclaration') {
        continue;
      }
      const declaration = statement.declarations.find(
        (item) => item.id.type === 'Identifier' && item.id.name === node.name,
      );
      if (declaration?.init?.type === 'Identifier') {
        throw new Error('Configuration aliases need a manual integration.');
      }
      if (declaration?.init) {
        const otherInitializers = document.program.body.flatMap((entry) => {
          const statement =
            entry.type === 'ExportNamedDeclaration' ? entry.declaration : entry;
          return statement?.type === 'VariableDeclaration'
            ? statement.declarations.flatMap((item) =>
              item === declaration ? [] : [item.init],
            )
            : [];
        });
        if (
          otherInitializers.some((initializer) =>
            referencesIdentifier(initializer, node.name),
          )
        ) {
          throw new Error(
            'Configuration references in other initializers need a manual integration.',
          );
        }
        return staticObject(declaration.init, document);
      }
    }
  }
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    ['defineConfig', 'defineNuxtConfig'].includes(node.callee.name) &&
    node.arguments.length === 1
  ) {
    return staticObject(node.arguments[0], document);
  }
  if (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) {
    if (node.body.type !== 'BlockStatement') {
      return staticObject(node.body, document);
    }
    if (
      node.body.body.length === 1 &&
      node.body.body[0]?.type === 'ReturnStatement'
    ) {
      return staticObject(node.body.body[0].argument, document);
    }
  }
  throw new Error(
    'Custom configuration logic needs a manual integration; no files were changed.',
  );
}

function exportedObject(document: Document): ConfigObject {
  const exports = document.program.body.flatMap<ConfigurationExport>(
    (statement) => {
      if (statement.type === 'ExportDefaultDeclaration') {
        return [{ statement, expression: statement.declaration }];
      }
      if (
        statement.type !== 'ExpressionStatement' ||
        statement.expression.type !== 'AssignmentExpression'
      ) {
        return [];
      }
      const { left, right, operator } = statement.expression;
      if (
        operator === '=' &&
        left.type === 'MemberExpression' &&
        !left.computed &&
        left.object.type === 'Identifier' &&
        left.object.name === 'module' &&
        left.property.type === 'Identifier' &&
        left.property.name === 'exports'
      ) {
        return [{ statement, expression: right }];
      }
      return [];
    },
  );
  const exported = exports[0];
  if (!exported) {
    throw new Error(
      'No supported configuration export was found; no files were changed.',
    );
  }
  if (exports.length !== 1) {
    throw new Error(
      'Multiple configuration exports need a manual integration.',
    );
  }
  if (
    document.program.body.some(
      (statement) =>
        statement !== exported.statement &&
        ![
          'ImportDeclaration',
          'VariableDeclaration',
          'FunctionDeclaration',
          'ClassDeclaration',
          'ExportNamedDeclaration',
          'ExportAllDeclaration',
          'TSInterfaceDeclaration',
          'TSTypeAliasDeclaration',
          'EmptyStatement',
        ].includes(statement.type),
    )
  ) {
    throw new Error(
      'Configuration mutations or executable statements need a manual integration.',
    );
  }
  return staticObject(exported.expression, document);
}

function propertyValue(
  object: ConfigObject,
  name: string,
): Expression | undefined {
  if (
    object.properties.some(
      (property) =>
        property.type === 'SpreadElement' ||
        ('computed' in property && property.computed),
    )
  ) {
    throw new Error(
      'Configuration spreads or computed keys need a manual integration.',
    );
  }
  const properties = object.properties.filter(
    (property) => keyName(property) === name,
  );
  if (properties.length > 1) {
    throw new Error(`Duplicate configuration key: ${name}`);
  }
  const property = properties[0];
  if (!property) {
    return undefined;
  }
  if (property.type !== 'ObjectProperty') {
    throw new Error(`Custom ${name} configuration needs a manual integration.`);
  }
  return property.value as Expression;
}

export function configureSource({
  source,
  kind,
  commonjs = false,
  nextMajor,
  typescript = false,
}: ConfigureSourceInput): { readonly source: string } {
  const document = parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript'],
    attachComment: false,
  });
  const existing =
    document.program.body.some(
      (statement) =>
        statement.type === 'ImportDeclaration' &&
        [INSPECTOR_PACKAGE, CORE_PACKAGE, LOADER_PACKAGE].includes(
          statement.source.value,
        ),
    ) ||
    [INSPECTOR_PACKAGE, CORE_PACKAGE, LOADER_PACKAGE].some(
      (name) =>
        source.includes(`require('${name}')`) ||
        source.includes(`require("${name}")`),
    );
  if (existing) {
    throw new Error(
      'An inspector integration already exists. Preserve it and verify native-element markers and development-only behavior before binding the page.',
    );
  }
  if (
    new RegExp(
      `\\b${COMPILER_IDENTIFIER}\\b|\\bsideroom(?:Transform|ReadFile|Require|CreateRequire)\\b`,
      'u',
    ).test(source)
  ) {
    throw new Error(
      'A Sideroom compiler integration identifier is already in use.',
    );
  }
  const root = exportedObject(document);
  const imports = document.program.body.filter(
    (statement) => statement.type === 'ImportDeclaration',
  );
  const useRequire =
    commonjs || (!imports.length && source.includes('module.exports'));
  const replacements: Replacement[] = [];
  function append(container: ConfigObject | ConfigArray, member: string): void {
    if (
      container.start === null ||
      container.start === undefined ||
      container.end === null ||
      container.end === undefined
    ) {
      throw new Error('Configuration locations are unavailable.');
    }
    const members =
      container.type === 'ObjectExpression'
        ? container.properties
        : container.elements;
    const last = members.at(-1);
    const tail = source.slice(
      last?.end ?? container.start + 1,
      container.end - 1,
    );
    const insertion = container.end - 1;
    const previous = replacements.find(
      (replacement) => replacement.start === insertion,
    );
    if (previous) {
      replacements.splice(replacements.indexOf(previous), 1, {
        ...previous,
        text: `${previous.text}${member},\n`,
      });
      return;
    }
    const punctuation = tail.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, '');
    const comma = members.length > 0 && !/^\s*,/u.test(punctuation) ? ',' : '';
    replacements.push({
      start: container.end - 1,
      end: container.end - 1,
      text: `${comma}\n${member},\n`,
    });
  }
  function plugins(object: ConfigObject): void {
    const call = `${COMPILER_IDENTIFIER}()`;
    const value = propertyValue(object, 'plugins');
    if (!value) {
      append(object, `plugins: [${call}]`);
      return;
    }
    if (value.type !== 'ArrayExpression') {
      throw new Error(
        'The plugins configuration must be an array for automatic integration.',
      );
    }
    if (value.start === null || value.start === undefined) {
      throw new Error('The plugin array location is unavailable.');
    }

    replacements.push({
      start: value.start + 1,
      end: value.start + 1,
      text: `${call},\n`,
    });
  }
  function nested({ object, key, member }: NestedConfigurationInput): void {
    const value = propertyValue(object, key);
    if (!value) {
      append(object, `${key}: { ${member} }`);
      return;
    }
    if (value.type !== 'ObjectExpression') {
      throw new Error(`The ${key} configuration must be a static object.`);
    }
    append(value, member);
  }
  if (kind === 'astro' || kind === 'nuxt') {
    const vite = propertyValue(root, 'vite');
    if (!vite) {
      nested({
        object: root,
        key: 'vite',
        member: `plugins: [${COMPILER_IDENTIFIER}()]`,
      });
    } else if (vite.type === 'ObjectExpression') {
      plugins(vite);
    } else {
      throw new Error('The vite configuration must be a static object.');
    }
  } else if (kind === 'next') {
    if (nextMajor === undefined || nextMajor < 16) {
      throw new Error(
        'Automatic Next.js setup currently requires Next 16 or later; older versions need their documented bundler-specific integration.',
      );
    }
    if (propertyValue(root, 'webpack') || propertyValue(root, 'turbopack')) {
      throw new Error(
        'Existing Next.js bundler configuration needs a manual integration.',
      );
    }
    append(
      root,
      `webpack(${typescript ? 'config: { plugins: unknown[] }, { dev }: { dev: boolean }' : 'config, { dev }'}) {\nif (dev) {\nconfig.plugins.unshift(${COMPILER_IDENTIFIER}());\n}\nreturn config;\n}`,
    );
    append(
      root,
      `turbopack: { rules: process.env.NODE_ENV === 'development' ? { '**/*.{jsx,tsx,js,ts,mjs,mts}': { loaders: [{ loader: ${useRequire ? 'require' : 'sideroomRequire'}.resolve('${METADATA_LOADER}'), options: { pathType: 'absolute' } }] } } : {} }`,
    );
  } else {
    plugins(root);
  }
  const position =
    imports.at(-1)?.end ??
    document.program.directives.at(-1)?.end ??
    document.program.interpreter?.end ??
    0;
  const declaration = compilerIntegration({
    kind,
    commonjs: useRequire,
    typescript,
  });
  replacements.push({
    start: position,
    end: position,
    text: `\n${declaration}\n`,
  });
  let configured = source;
  for (const replacement of replacements.sort(
    (left, right) => right.start - left.start,
  )) {
    configured =
      configured.slice(0, replacement.start) +
      replacement.text +
      configured.slice(replacement.end);
  }

  parse(configured, { sourceType: 'unambiguous', plugins: ['typescript'] });
  return { source: configured };
}
