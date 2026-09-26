import { LANGUAGE, languageForPath } from '../rules/catalog.ts';
import { type AddedLine, addedLines } from '../rules/model.ts';

export type { AddedLine } from '../rules/model.ts';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';

// A noul answer carries a probability and no confidence, so this cutoff is the
// only brake. Below it Jev is saying it has nothing to go on, which would be
// noise on every edit.
export const VIOLATION_PROBABILITY = 0.8;

// The serialized state must stay well under the two documented budgets (64k
// tokens for the whole request, 32k for the state plus the longest question). A
// new file travels twice, as the body and as its added lines. A state that does
// not fit is skipped, never truncated: half a file reads as a distorted picture
// and Jev answers it with the same confidence.
export const MAX_STATE_CHARACTERS = 60_000;

const NOUL_TYPE = 'noul';

export interface JevNoulQuestion {
  readonly type: typeof NOUL_TYPE;
  readonly instructions: string;
  readonly criteria: { readonly true: string; readonly false: string };
}

export interface JevRule {
  readonly id: string;
  readonly question: JevNoulQuestion;
}

// The six guide rules that a single file can answer and that no mechanical
// check covers. Rules 11, 12, 15, 16, 17 and 18 need the module's neighbours.
export const JEV_RULES: readonly JevRule[] = [
  {
    id: 'guard-clauses',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, is the control flow nested so the main path is buried, instead of validating and exiting early?',
      criteria: {
        true: 'Conditionals nest two or more levels deep, or the main path sits inside a condition that could have returned early',
        false:
          'Each condition is handled with an early return or a flat sequence',
      },
    },
  },
  {
    id: 'fail-fast',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, is an invalid or impossible state papered over with a silent fallback instead of failing immediately?',
      criteria: {
        true: 'A default value or a silent coercion hides a broken dependency or a state that should never happen',
        false:
          'An impossible or invalid case throws with a clear message, or no such case appears',
      },
    },
  },
  {
    id: 'command-query',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, does a function both change state and return a value, or does something that reads like a query have a side effect?',
      criteria: {
        true: 'A function that returns data also mutates state, or a getter mutates',
        false: 'Functions either change state or return data, never both',
      },
    },
  },
  {
    id: 'null-handling',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, is the same empty value reused to mean several different states, or are `null` and `undefined` mixed for one meaning?',
      criteria: {
        true: 'One empty value carries more than one business meaning, or null and undefined stand for the same thing in different places',
        false:
          'One convention is used and each distinct state has its own value',
      },
    },
  },
  {
    id: 'immutability',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, is an object or array received as a parameter modified in place?',
      criteria: {
        true: 'A parameter is pushed, assigned or deleted into, or a transform writes to state outside itself',
        false: 'New values are returned instead of changing the inputs',
      },
    },
  },
  {
    id: 'validate-once',
    question: {
      type: NOUL_TYPE,
      instructions:
        'In `change.addedLines`, is the same required, type or range check repeated after a boundary already owns that input?',
      criteria: {
        true: 'A rule already validated at the boundary is checked again deeper in the code',
        false: 'Validation happens once, at the boundary that owns the input',
      },
    },
  },
];

export interface JevFileState {
  readonly file: {
    readonly path: string;
    readonly language: string;
    readonly body: string;
  };
  readonly change: {
    readonly kind: string;
    readonly addedLines: readonly string[];
  };
}

export interface JevRequestBody {
  readonly model: string;
  readonly state: JevFileState;
  readonly questions: Readonly<Record<string, JevNoulQuestion>>;
}

export interface JevNoulAnswer {
  readonly noul: number;
}

export interface JevResponseEnvelope {
  readonly model: string | undefined;
  readonly answers: Readonly<Record<string, JevNoulAnswer>> | undefined;
}

export interface JevFinding {
  readonly ruleId: string;
  readonly probability: number;
}

export function buildFileState(
  path: string,
  body: string,
  kind: string,
  lines: readonly AddedLine[],
): JevFileState {
  return {
    file: { path, language: languageForPath(path), body },
    change: { kind, addedLines: lines.map((line) => line.text) },
  };
}

export function addedLinesForWrite(
  previous: string | undefined,
  next: string,
): AddedLine[] {
  return addedLines(previous, next);
}

export function addedLinesForEdit(
  edits: readonly { readonly oldText: string; readonly newText: string }[],
): AddedLine[] {
  return edits.flatMap((edit) => addedLines(edit.oldText, edit.newText));
}

// The six questions are about code structure; a README or a lockfile would
// spend a call on answers that mean nothing.
export function isReviewablePath(path: string): boolean {
  return languageForPath(path) !== LANGUAGE.generic;
}

export function stateFitsBudget(state: JevFileState): boolean {
  return JSON.stringify(state).length <= MAX_STATE_CHARACTERS;
}

export function buildRequestBody(file: JevFileState): JevRequestBody {
  const questions: Record<string, JevNoulQuestion> = {};
  for (const rule of JEV_RULES) {
    questions[rule.id] = rule.question;
  }
  return { model: JEV_MODEL, state: file, questions };
}

export function parseEnvelope(text: string): JevResponseEnvelope | undefined {
  const payload = parseJsonObject(text);
  if (payload === undefined) {
    return undefined;
  }
  const model = typeof payload.model === 'string' ? payload.model : undefined;
  return { model, answers: readAnswers(payload.answers) };
}

export function readFindings(
  envelope: JevResponseEnvelope,
): readonly JevFinding[] {
  const answers = envelope.answers;
  if (answers === undefined) {
    return [];
  }
  const findings: JevFinding[] = [];
  for (const rule of JEV_RULES) {
    const answer = answers[rule.id];
    if (answer === undefined || answer.noul < VIOLATION_PROBABILITY) {
      continue;
    }
    findings.push({ ruleId: rule.id, probability: answer.noul });
  }
  return findings;
}

export function findingKey(path: string, ruleId: string): string {
  return `${path}#${ruleId}`;
}

export function formatFindings(
  path: string,
  findings: readonly JevFinding[],
): string {
  return [
    `Sideroom Jev review flagged ${path}:`,
    ...findings.map(
      (finding) =>
        `- [${finding.ruleId}] Jev scored ${finding.probability.toFixed(2)} probability that the added lines break this rule. Verify against the loaded guide before changing anything.`,
    ),
  ].join('\n');
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  return parsed as Record<string, unknown>;
}

function readAnswers(
  value: unknown,
): Record<string, JevNoulAnswer> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const answers: Record<string, JevNoulAnswer> = {};
  for (const [id, entry] of Object.entries(value)) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { noul } = entry as { noul?: unknown };
    if (typeof noul === 'number') {
      answers[id] = { noul };
    }
  }
  return answers;
}
