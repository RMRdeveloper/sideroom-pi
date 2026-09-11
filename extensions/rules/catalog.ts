export const LANGUAGE = {
  typescript: 'typescript',
  javascript: 'javascript',
  go: 'go',
  java: 'java',
  php: 'php',
  python: 'python',
  rust: 'rust',
  generic: 'generic',
} as const;

export const SEVERITY = {
  block: 'block',
  warn: 'warn',
} as const;

export type LanguageId = (typeof LANGUAGE)[keyof typeof LANGUAGE];

export type RuleId =
  | 'braced-conditionals'
  | 'explicit-error-handling'
  | 'clear-names'
  | 'comments'
  | 'debug-artifacts';

export type RuleSeverity = (typeof SEVERITY)[keyof typeof SEVERITY];

export const RULE_SEVERITY: Readonly<Record<RuleId, RuleSeverity>> = {
  'braced-conditionals': SEVERITY.block,
  'explicit-error-handling': SEVERITY.block,
  'clear-names': SEVERITY.warn,
  comments: SEVERITY.warn,
  'debug-artifacts': SEVERITY.warn,
};

export function languageForPath(path: string): LanguageId {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  const separator = normalized.lastIndexOf('/');
  const fileName = normalized.slice(separator + 1);
  if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
    return LANGUAGE.typescript;
  }
  if (
    fileName.endsWith('.js') ||
    fileName.endsWith('.jsx') ||
    fileName.endsWith('.mjs') ||
    fileName.endsWith('.cjs')
  ) {
    return LANGUAGE.javascript;
  }
  if (fileName.endsWith('.go')) {
    return LANGUAGE.go;
  }
  if (fileName.endsWith('.java')) {
    return LANGUAGE.java;
  }
  if (fileName.endsWith('.php')) {
    return LANGUAGE.php;
  }
  if (fileName.endsWith('.py')) {
    return LANGUAGE.python;
  }
  if (fileName.endsWith('.rs')) {
    return LANGUAGE.rust;
  }
  return LANGUAGE.generic;
}

export function supportsBracedConditionals(language: LanguageId): boolean {
  return language !== LANGUAGE.python && language !== LANGUAGE.generic;
}
