import { LANGUAGE, languageForPath } from '../rules/catalog.ts';
import { type AddedLine, addedLines } from '../rules/model.ts';

export type { AddedLine } from '../rules/model.ts';

export const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';

// A noul answer carries a probability and no confidence, so this cutoff is the
// only brake. Below it Jev is saying it has nothing to go on, which would be
// noise on every edit.
export const VIOLATION_PROBABILITY = 0.8;

// TypeSafe documents 32k tokens for state plus the longest question and 64k
// for the full request. JSON UTF-8 bytes are a deliberately conservative
// upper bound; no third-party tokenizer can promise the model's exact count.
export const MAX_STATE_BYTES = 32_000;
export const MAX_REQUEST_BYTES = 64_000;

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

// Questions must only use evidence in the file and the selected direct neighbours.
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
        'In `change.addedLines`, does a function return a value while changing a parameter, shared state or an external resource, or does a getter/query cause such a side effect? Ignore changes to local collections created inside the function to build its result.',
      criteria: {
        true: 'A function returns data while changing caller-visible state, or a getter/query mutates that state',
        false:
          'Local accumulation and read-only file access do not change caller-visible state',
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
        'Does `change.addedLines` repeat a required, type or range check that is visibly performed at the input boundary in `file.body` or `context.files`? Do not infer unseen validation.',
      criteria: {
        true: 'The same check is visible both at the boundary and in the added lines',
        false:
          'The boundary check is not visible, or the added lines do not repeat it',
      },
    },
  },
  {
    id: 'single-responsibility',
    question: {
      type: NOUL_TYPE,
      instructions:
        'Do the added lines give the changed function or class two unrelated reasons to change, visible in its body? Do not flag a function merely for coordinating focused collaborators.',
      criteria: {
        true: 'The changed unit itself performs two unrelated responsibilities with visible evidence',
        false:
          'The unit has one responsibility or only coordinates separate focused units',
      },
    },
  },
  {
    id: 'dependency-direction',
    question: {
      type: NOUL_TYPE,
      instructions:
        'Do the added lines introduce an import from business/domain code to infrastructure, HTTP, or a framework? Use paths and bodies in `context.files` as evidence; never infer a layer from an unavailable file.',
      criteria: {
        true: 'A new inward-to-outward dependency is visible in the import and its related file',
        false:
          'No such dependency is visible, or the roles of the files are unclear',
      },
    },
  },
  {
    id: 'comments',
    question: {
      type: NOUL_TYPE,
      instructions:
        'Does a comment in `change.addedLines` merely narrate obvious code instead of explaining non-obvious intent, a trade-off or a hazard?',
      criteria: {
        true: 'A newly added comment repeats what the adjacent code already says',
        false: 'No comment was added, or it explains non-obvious intent',
      },
    },
  },
];

export interface JevRelatedFile {
  readonly path: string;
  readonly body: string;
  readonly relation: 'imported' | 'consumer';
}

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
  readonly context: {
    readonly files: readonly JevRelatedFile[];
    readonly partial: boolean;
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
  relatedFiles: readonly JevRelatedFile[] = [],
  partial = false,
): JevFileState {
  return {
    file: { path, language: languageForPath(path), body },
    change: { kind, addedLines: lines.map((line) => line.text) },
    context: { files: relatedFiles, partial },
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

// Questions are about code structure; a README or a lockfile has no useful state.
export function isReviewablePath(path: string): boolean {
  return languageForPath(path) !== LANGUAGE.generic;
}

export function stateFitsBudget(state: JevFileState): boolean {
  const request = buildRequestBody(state);
  const longestQuestion = Object.values(request.questions).reduce(
    (longest, question) =>
      Math.max(longest, Buffer.byteLength(JSON.stringify(question))),
    0,
  );
  return (
    Buffer.byteLength(JSON.stringify(state)) + longestQuestion <=
      MAX_STATE_BYTES &&
    Buffer.byteLength(JSON.stringify(request)) <= MAX_REQUEST_BYTES
  );
}

export function buildRequestBody(file: JevFileState): JevRequestBody {
  const questions: Record<string, JevNoulQuestion> = {};
  const hasImportedFile = file.context.files.some(
    (related) => related.relation === 'imported',
  );
  const addedText = file.change.addedLines.join('\n');
  for (const rule of JEV_RULES) {
    if (rule.id === 'dependency-direction' && !hasImportedFile) {
      continue;
    }
    if (rule.id === 'comments' && !/(?:\/\/|\/\*|#)/u.test(addedText)) {
      continue;
    }
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
  askedRuleIds: ReadonlySet<string> = new Set(JEV_RULES.map((rule) => rule.id)),
): readonly JevFinding[] {
  const answers = envelope.answers;
  if (answers === undefined) {
    return [];
  }
  const findings: JevFinding[] = [];
  for (const rule of JEV_RULES) {
    if (!askedRuleIds.has(rule.id)) {
      continue;
    }
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
