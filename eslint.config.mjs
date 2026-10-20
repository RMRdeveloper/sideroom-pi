import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import noComments from 'eslint-plugin-no-comments';
import jsonc from 'eslint-plugin-jsonc';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { createLintConfig } from './scripts/lint/config.mjs';

const config = createLintConfig({ js, tseslint, stylistic, noComments, jsonc, globals,
  files: ['extensions/**/*.ts', 'assets/visual-context/browser/**/*.js', 'scripts/**/*.mjs', 'commitlint.config.mjs', 'eslint.config.mjs'],
  jsonFiles: ['package.json', 'tsconfig.json', '.changeset/config.json'],
});

export default [...config, { files: ['assets/visual-context/browser/background.js'], languageOptions: { globals: { ...globals.serviceworker, createDestinations: 'readonly' } } }];
