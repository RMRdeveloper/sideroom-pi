import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LANGUAGE_GUIDE_DIRECTORY = join(
  PACKAGE_ROOT,
  'skills/sideroom-guidelines/references/languages',
);

export const GUIDELINE_SKILL_PATH = join(
  PACKAGE_ROOT,
  'skills/sideroom-guidelines/SKILL.md',
);

export interface LanguageGuide {
  readonly extensions: readonly string[];
  readonly fileName: string;
  readonly path: string;
}

export const LANGUAGE_GUIDES: readonly LanguageGuide[] = [
  languageGuide('go.md', ['.go']),
  languageGuide('java.md', ['.java']),
  languageGuide('javascript.md', ['.js', '.jsx', '.mjs', '.cjs']),
  languageGuide('php-laravel.md', ['.php']),
  languageGuide('python.md', ['.py']),
  languageGuide('rust.md', ['.rs']),
  languageGuide('typescript.md', ['.ts', '.tsx']),
];

export const LANGUAGE_GUIDE_FILES: readonly string[] = LANGUAGE_GUIDES.map(
  ({ fileName }) => fileName,
);

export const LANGUAGE_TARGET_LABELS: readonly string[] = LANGUAGE_GUIDES.map(
  ({ extensions }) => extensions.join('/'),
);

function languageGuide(
  fileName: string,
  extensions: readonly string[],
): LanguageGuide {
  return {
    extensions,
    fileName,
    path: join(LANGUAGE_GUIDE_DIRECTORY, fileName),
  };
}
