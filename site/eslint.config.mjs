import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import noComments from 'eslint-plugin-no-comments';
import jsonc from 'eslint-plugin-jsonc';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { createLintConfig } from '../scripts/lint/config.mjs';

export default createLintConfig({ js, tseslint, stylistic, noComments, jsonc, globals,
  files: ['src/**/*.ts', 'scripts/**/*.mjs', '*.mjs'],
  jsonFiles: ['package.json', 'tsconfig.json'],
});
