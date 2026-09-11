import type { RuleId, RuleSeverity } from './catalog.ts';

export interface AddedLine {
  readonly line: number;
  readonly text: string;
}

export interface RuleViolation {
  readonly ruleId: RuleId;
  readonly severity: RuleSeverity;
  readonly message: string;
  readonly line: number;
}

export function addedLines(
  previous: string | undefined,
  next: string,
): AddedLine[] {
  const nextLines = next.split('\n');
  const added: AddedLine[] = [];
  const remaining = new Map<string, number>();

  if (previous !== undefined) {
    for (const text of previous.split('\n')) {
      const key = text.trim();
      if (key.length === 0) {
        continue;
      }
      remaining.set(key, (remaining.get(key) ?? 0) + 1);
    }
  }

  for (let index = 0; index < nextLines.length; index += 1) {
    const text = nextLines[index] ?? '';
    const key = text.trim();
    if (key.length === 0) {
      continue;
    }
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
      continue;
    }
    added.push({ line: index + 1, text });
  }

  return added;
}

export function formatBlockReason(
  path: string,
  violations: readonly RuleViolation[],
): string {
  return [
    `Blocked ${path}: sideroom rules violated.`,
    ...violations.map((item) => `- ${item.message}`),
    'Fix the flagged lines and retry the mutation.',
  ].join('\n');
}

export function formatWarnings(
  path: string,
  violations: readonly RuleViolation[],
): string {
  return [
    `Sideroom rules flagged ${path}:`,
    ...violations.map((item) => `- ${item.message}`),
  ].join('\n');
}
