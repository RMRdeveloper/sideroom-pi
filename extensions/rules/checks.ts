import {
  LANGUAGE,
  type LanguageId,
  RULE_SEVERITY,
  type RuleId,
  supportsBracedConditionals,
} from './catalog.ts';
import { maskNonCode } from './lexer.ts';
import type { AddedLine, RuleViolation } from './model.ts';

const BANNED_ALTERNATION = 'data|info|temp|tmp|result|obj|val|x';
const CONTROL_HEADER = /\b(?:if|else\s+if|for|while)\s*\(/g;
const ELSE_KEYWORD = /\belse\b/g;
const PYTHON_INLINE_SUITE =
  /^\s*(?:if|elif|else|for|while|with|try|except|finally|def|class)\b.*:\s*(?:return|pass|raise|break|continue|yield|assert|del|import|from|global|nonlocal|print|await|lambda)\b/;

const EMPTY_CATCH =
  /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)?\}/g;
const SWALLOW_RETURN =
  /\bcatch\s*(?:\([^)]*\))?\s*\{\s*return\s+(?:null|undefined|void\s+0)\s*;?\s*\}/g;
const PYTHON_SWALLOW =
  /^[ \t]*except\b[^:\n]*:[ \t]*(?:pass|\.\.\.)[ \t]*(?:#[^\n]*)?$/gm;
const PYTHON_SWALLOW_BLOCK =
  /^[ \t]*except\b[^:\n]*:[ \t]*\n[ \t]*(?:pass|\.\.\.)[ \t]*(?:#[^\n]*)?$/gm;

const TODO_COMMENT = /(?:\/\/|#|\/\*)[^\n]*\b(?:TODO|FIXME|XXX|HACK)\b/;
const COMMENTED_CODE =
  /^\s*(?:\/\/|#)\s*(?:if|for|while|return|const|let|var|function|class|def|import|from|print|console|await|async)\b/;
const CODE_LIKE_COMMENT = /^\s*(?:\/\/|#).*[;{}]\s*$/;

const DEBUG_PATTERNS: readonly RegExp[] = [
  /\bconsole\.(?:log|debug)\s*\(/,
  /\bdebugger\b/,
  /^\s*print\s*\(/,
  /\bvar_dump\s*\(/,
  /\bdd\s*\(/,
  /\bdump\s*\(/,
  /\bdbg!\s*\(/,
];

const FUNCTION_PARAMS: readonly RegExp[] = [
  /\bfunction\s+\w*\s*\(([^()]*)\)/g,
  /\bdef\s+\w+\s*\(([^()]*)\)/g,
  /\bfn\s+\w+\s*\(([^()]*)\)/g,
  /\(([^()]*)\)\s*=>/g,
];

export function evaluateAddedLines(
  language: LanguageId,
  lines: readonly AddedLine[],
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const joined = lines.map((added) => added.text).join('\n');
  const code = maskNonCode(joined, language);
  const codeLines = code.split('\n');
  const usesBracedConditionals = supportsBracedConditionals(language);

  if (usesBracedConditionals) {
    collectBracedConditionals(code, lines, violations);
  }

  for (let index = 0; index < lines.length; index += 1) {
    const added = lines[index];
    if (added === undefined) {
      continue;
    }
    const codeLine: AddedLine = {
      line: added.line,
      text: codeLines[index] ?? '',
    };
    if (language === LANGUAGE.python) {
      collectPythonSuite(codeLine, violations);
    }
    collectClearNames(codeLine, violations);
    collectComments(added, violations);
    collectDebugArtifacts(codeLine, violations);
  }

  collectErrorHandling(language, code, lines, violations);
  return dedupe(violations);
}

function violation(
  ruleId: RuleId,
  message: string,
  line: number,
): RuleViolation {
  return { ruleId, severity: RULE_SEVERITY[ruleId], message, line };
}

function collectBracedConditionals(
  code: string,
  lines: readonly AddedLine[],
  violations: RuleViolation[],
): void {
  const controlMatcher = new RegExp(
    CONTROL_HEADER.source,
    CONTROL_HEADER.flags,
  );
  const controlMatches = code.matchAll(controlMatcher);
  for (const match of controlMatches) {
    const matchOffset = match.index ?? 0;
    const openingOffset = code.indexOf('(', matchOffset);
    if (openingOffset < 0) {
      continue;
    }
    const closingOffset = closingParenthesisOffset(code, openingOffset);
    if (closingOffset === undefined) {
      continue;
    }
    const bodyOffset = nextCodeOffset(code, closingOffset + 1);
    if (bodyOffset === undefined) {
      continue;
    }
    const hasBlockBody = code[bodyOffset] === '{';
    if (hasBlockBody) {
      continue;
    }
    violations.push(
      violation(
        'braced-conditionals',
        '[braced-conditionals] Wrap the conditional body in braces.',
        lineForOffset(code, lines, matchOffset),
      ),
    );
  }

  const elseMatcher = new RegExp(ELSE_KEYWORD.source, ELSE_KEYWORD.flags);
  const elseMatches = code.matchAll(elseMatcher);
  for (const match of elseMatches) {
    const matchOffset = match.index ?? 0;
    const bodyOffset = nextCodeOffset(code, matchOffset + match[0].length);
    if (bodyOffset === undefined) {
      continue;
    }
    const hasBlockBody = code[bodyOffset] === '{';
    const hasNestedIf = startsWithWord(code, bodyOffset, 'if');
    if (hasBlockBody || hasNestedIf) {
      continue;
    }
    violations.push(
      violation(
        'braced-conditionals',
        '[braced-conditionals] Wrap the conditional body in braces.',
        lineForOffset(code, lines, matchOffset),
      ),
    );
  }
}

function collectPythonSuite(
  added: AddedLine,
  violations: RuleViolation[],
): void {
  if (PYTHON_INLINE_SUITE.test(added.text)) {
    violations.push(
      violation(
        'braced-conditionals',
        '[braced-conditionals] Put the suite on its own indented line.',
        added.line,
      ),
    );
  }
}

function collectErrorHandling(
  language: LanguageId,
  code: string,
  lines: readonly AddedLine[],
  violations: RuleViolation[],
): void {
  if (language === LANGUAGE.python) {
    collectPattern(PYTHON_SWALLOW, code, lines, violations);
    collectPattern(PYTHON_SWALLOW_BLOCK, code, lines, violations);
    return;
  }
  if (language === LANGUAGE.generic) {
    return;
  }
  collectPattern(EMPTY_CATCH, code, lines, violations);
  collectPattern(SWALLOW_RETURN, code, lines, violations);
}

function collectPattern(
  pattern: RegExp,
  joined: string,
  lines: readonly AddedLine[],
  violations: RuleViolation[],
): void {
  const matcher = new RegExp(pattern.source, pattern.flags);
  for (const match of joined.matchAll(matcher)) {
    const offset = match.index ?? 0;
    violations.push(
      violation(
        'explicit-error-handling',
        '[explicit-error-handling] Do not swallow errors; rethrow with context or let them propagate.',
        lineForOffset(joined, lines, offset),
      ),
    );
  }
}

function collectClearNames(
  added: AddedLine,
  violations: RuleViolation[],
): void {
  const declaration = new RegExp(
    `\\b(?:const|let|var|val|auto|final)\\s+(${BANNED_ALTERNATION})\\b`,
  );
  const assignment = new RegExp(`^\\s*(${BANNED_ALTERNATION})\\s*(?::=|=)`);
  const match = declaration.exec(added.text) ?? assignment.exec(added.text);
  if (match !== null) {
    pushClearName(added.line, match[1], violations);
    return;
  }

  for (const pattern of FUNCTION_PARAMS) {
    const params = new RegExp(pattern.source, pattern.flags);
    for (const paramMatch of added.text.matchAll(params)) {
      const banned = new RegExp(`\\b(${BANNED_ALTERNATION})\\b`).exec(
        paramMatch[1] ?? '',
      );
      if (banned !== null) {
        pushClearName(added.line, banned[1], violations);
        return;
      }
    }
  }
}

function pushClearName(
  line: number,
  name: string | undefined,
  violations: RuleViolation[],
): void {
  const label = name ?? 'identifier';
  violations.push(
    violation(
      'clear-names',
      `[clear-names] Rename '${label}' to a name that reveals its role.`,
      line,
    ),
  );
}

function collectComments(added: AddedLine, violations: RuleViolation[]): void {
  if (
    TODO_COMMENT.test(added.text) ||
    COMMENTED_CODE.test(added.text) ||
    CODE_LIKE_COMMENT.test(added.text)
  ) {
    violations.push(
      violation(
        'comments',
        '[comments] Remove stale TODO/FIXME or commented-out code; keep only non-obvious intent.',
        added.line,
      ),
    );
  }
}

function collectDebugArtifacts(
  added: AddedLine,
  violations: RuleViolation[],
): void {
  if (DEBUG_PATTERNS.some((pattern) => pattern.test(added.text))) {
    violations.push(
      violation(
        'debug-artifacts',
        '[debug-artifacts] Remove debug output before finishing.',
        added.line,
      ),
    );
  }
}

function closingParenthesisOffset(
  code: string,
  openingOffset: number,
): number | undefined {
  let depth = 0;
  for (let index = openingOffset; index < code.length; index += 1) {
    const character = code[index];
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') {
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }
  return undefined;
}

function nextCodeOffset(code: string, offset: number): number | undefined {
  for (let index = offset; index < code.length; index += 1) {
    const character = code[index] ?? '';
    const isWhitespace = /\s/.test(character);
    if (!isWhitespace) {
      return index;
    }
  }
  return undefined;
}

function startsWithWord(code: string, offset: number, word: string): boolean {
  const startsAtOffset = code.startsWith(word, offset);
  if (!startsAtOffset) {
    return false;
  }
  const following = code[offset + word.length] ?? '';
  const isWordCharacter = /[A-Za-z0-9_$]/.test(following);
  return following.length === 0 || !isWordCharacter;
}

function lineForOffset(
  joined: string,
  lines: readonly AddedLine[],
  offset: number,
): number {
  let lineIndex = 0;
  for (let index = 0; index < offset; index += 1) {
    if (joined.charCodeAt(index) === 10) {
      lineIndex += 1;
    }
  }
  return lines[lineIndex]?.line ?? lines.at(-1)?.line ?? 0;
}

function dedupe(violations: readonly RuleViolation[]): RuleViolation[] {
  const seen = new Set<string>();
  const deduped: RuleViolation[] = [];
  for (const item of violations) {
    const key = `${item.ruleId}:${String(item.line)}:${item.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}
