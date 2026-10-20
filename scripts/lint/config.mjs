export function createLintConfig({ js, tseslint, stylistic, noComments, globals, jsonc, files, jsonFiles }) {
  const sharedRules = {
    'curly': ['error', 'all'],
    'no-comments/disallowComments': ['error', { allow: ['(?!)'] }],
    '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/comma-dangle': ['error', 'always-multiline'],
    '@stylistic/no-trailing-spaces': 'error',
    '@stylistic/eol-last': ['error', 'always'],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
  };
  const typedRules = Object.assign({}, ...tseslint.configs.recommended.map((config) => config.rules));
  return [
    { ignores: ['**/node_modules/**', '**/dist/**', '**/.astro/**', '**/coverage/**', '**/package-lock.json'] },
    {
      files,
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } },
      plugins: { '@stylistic': stylistic, 'no-comments': noComments },
      linterOptions: { noInlineConfig: true },
      rules: { ...js.configs.recommended.rules, ...sharedRules, 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] },
    },
    {
      files: files.filter((pattern) => pattern.includes('.ts')),
      languageOptions: { parser: tseslint.parser },
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: { ...typedRules, '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] },
    },
    ...jsonc.configs['flat/recommended-with-json'].map((config) => ({ ...config, files: jsonFiles })),
    { files: jsonFiles, rules: { 'jsonc/indent': ['error', 2], 'jsonc/key-spacing': 'error', 'jsonc/comma-dangle': ['error', 'never'] } },
  ];
}
