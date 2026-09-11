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
  if (previous === undefined) {
    return nonBlankLines(nextLines);
  }

  const previousLines = previous.split('\n');
  const insertedIndices = insertedLineIndices(previousLines, nextLines);
  const availableAdditions = additionCounts(previousLines, nextLines);
  const added: AddedLine[] = [];
  const orderedIndices = [...insertedIndices].sort(
    (left, right) => left - right,
  );

  for (const index of orderedIndices) {
    const text = nextLines[index] ?? '';
    const key = text.trim();
    if (key.length === 0) {
      continue;
    }
    const count = availableAdditions.get(key) ?? 0;
    if (count === 0) {
      continue;
    }
    availableAdditions.set(key, count - 1);
    added.push({ line: index + 1, text });
  }

  return added;
}

function nonBlankLines(lines: readonly string[]): AddedLine[] {
  const added: AddedLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? '';
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
      continue;
    }
    added.push({ line: index + 1, text });
  }
  return added;
}

function insertedLineIndices(
  previousLines: readonly string[],
  nextLines: readonly string[],
): number[] {
  const previousKeys = previousLines.map((line) => line.trim());
  const nextKeys = nextLines.map((line) => line.trim());
  const trace: Map<number, number>[] = [];
  const frontier = new Map<number, number>([[1, 0]]);
  const maximumDistance = previousLines.length + nextLines.length;

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const down = frontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
      const right =
        (frontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) + 1;
      let previousIndex: number;
      const shouldMoveDown =
        diagonal === -distance || (diagonal !== distance && down > right);
      if (shouldMoveDown) {
        previousIndex = down;
      } else {
        previousIndex = right;
      }
      const hasFiniteIndex = Number.isFinite(previousIndex);
      if (!hasFiniteIndex) {
        previousIndex = 0;
      }

      let nextIndex = previousIndex - diagonal;
      while (
        previousIndex < previousKeys.length &&
        nextIndex < nextKeys.length &&
        previousKeys[previousIndex] === nextKeys[nextIndex]
      ) {
        previousIndex += 1;
        nextIndex += 1;
      }
      frontier.set(diagonal, previousIndex);

      if (
        previousIndex >= previousKeys.length &&
        nextIndex >= nextKeys.length
      ) {
        trace.push(new Map(frontier));
        return backtrackInsertedIndices(
          trace,
          distance,
          previousKeys,
          nextKeys,
        );
      }
    }
    trace.push(new Map(frontier));
  }

  throw new Error('Failed to compute the line diff.');
}

function backtrackInsertedIndices(
  trace: readonly Map<number, number>[],
  distance: number,
  previousKeys: readonly string[],
  nextKeys: readonly string[],
): number[] {
  let previousIndex = previousKeys.length;
  let nextIndex = nextKeys.length;
  const insertedIndices: number[] = [];

  for (
    let currentDistance = distance;
    currentDistance > 0;
    currentDistance -= 1
  ) {
    const previousFrontier = trace[currentDistance - 1];
    if (previousFrontier === undefined) {
      throw new Error('Line diff trace is incomplete.');
    }

    const diagonal = previousIndex - nextIndex;
    const down = previousFrontier.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY;
    const right =
      (previousFrontier.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) + 1;
    const shouldMoveDown =
      diagonal === -currentDistance ||
      (diagonal !== currentDistance && down > right);
    const previousDiagonal = shouldMoveDown ? diagonal + 1 : diagonal - 1;
    const previousOldIndex = previousFrontier.get(previousDiagonal);
    if (previousOldIndex === undefined) {
      throw new Error('Line diff trace has an invalid diagonal.');
    }
    const previousNextIndex = previousOldIndex - previousDiagonal;

    while (
      previousIndex > previousOldIndex &&
      nextIndex > previousNextIndex &&
      previousKeys[previousIndex - 1] === nextKeys[nextIndex - 1]
    ) {
      previousIndex -= 1;
      nextIndex -= 1;
    }

    if (previousIndex === previousOldIndex) {
      nextIndex -= 1;
      insertedIndices.push(nextIndex);
    } else {
      previousIndex -= 1;
    }
  }

  return insertedIndices;
}

function additionCounts(
  previousLines: readonly string[],
  nextLines: readonly string[],
): Map<string, number> {
  const previousCounts = countLineKeys(previousLines);
  const nextCounts = countLineKeys(nextLines);
  const additions = new Map<string, number>();

  for (const [key, nextCount] of nextCounts) {
    const previousCount = previousCounts.get(key) ?? 0;
    additions.set(key, Math.max(nextCount - previousCount, 0));
  }
  return additions;
}

function countLineKeys(lines: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = line.trim();
    if (key.length === 0) {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
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
