import { type AskParams, parseAskParams } from '../ask/model.ts';
import {
  parseTodoParams,
  TODO_STATUS,
  type TodoItem,
  type TodoToolParameters,
} from '../todo/model.ts';
import {
  JEV_MODEL,
  type JevFileState,
  type JevNoulQuestion,
  type JevRequestBody,
  requestFitsBudget,
} from './model.ts';

const MAX_EVIDENCE_FILES = 4;

type ChangedFileEvidence = Pick<JevFileState, 'file' | 'change'>;

export interface WorkflowEvidence {
  readonly files: Map<string, ChangedFileEvidence>;
  readonly completed: Map<string, string>;
  partial: boolean;
  checks: 'unknown' | 'passed' | 'failed' | 'stale';
}

export function createWorkflowEvidence(): WorkflowEvidence {
  return {
    files: new Map(),
    completed: new Map(),
    partial: false,
    checks: 'unknown',
  };
}

export function resetWorkflowEvidence(evidence: WorkflowEvidence): void {
  evidence.files.clear();
  evidence.completed.clear();
  evidence.partial = false;
  evidence.checks = 'unknown';
}

export function recordFileEvidence(
  evidence: WorkflowEvidence,
  file: JevFileState,
): void {
  evidence.checks = 'stale';
  evidence.files.delete(file.file.path);
  evidence.files.set(file.file.path, { file: file.file, change: file.change });
  if (evidence.files.size > MAX_EVIDENCE_FILES) {
    const oldest = evidence.files.keys().next().value;
    if (oldest !== undefined) {
      evidence.files.delete(oldest);
    }
    evidence.partial = true;
  }
}

function question(instructions: string, violation: string): JevNoulQuestion {
  return {
    type: 'noul',
    instructions,
    criteria: {
      true: violation,
      false:
        'No concrete contradiction is visible, or the supplied evidence is insufficient',
    },
  };
}

export function buildAskReview(input: unknown): JevRequestBody | undefined {
  const parsed = parseAskParams(input as AskParams);
  if (!parsed.ok) {
    return undefined;
  }
  const request: JevRequestBody = {
    model: JEV_MODEL,
    state: { kind: 'questionnaire', questions: parsed.questions },
    questions: {
      'question-options': question(
        'Do the supplied questions contain overlapping single-selection options or bundle independent decisions so no option can express a reasonable combination? Multiple selections may intentionally overlap. Judge only the question text, not unseen requirements.',
        'The wording visibly prevents a clear independent choice',
      ),
      'question-recommendation': question(
        'Does a recommended option claim factual certainty or decisive cost/performance figures without support in the supplied question, or contradict its stated constraints? A preference alone need not include proof. Do not assume unseen project evidence is absent; flag only a demonstrably unsupported assertion or contradiction in the wording.',
        'The recommendation visibly contradicts stated constraints or asserts an unsupported decisive fact',
      ),
    },
  };
  return requestFitsBudget(request) ? request : undefined;
}

export function completedItems(
  details: unknown,
): readonly TodoItem[] | undefined {
  if (typeof details !== 'object' || details === null || 'error' in details) {
    return undefined;
  }
  const parsed = parseTodoParams({
    action: 'propose',
    items: 'items' in details ? details.items : undefined,
  } as TodoToolParameters);
  if (!parsed.ok || parsed.params.action !== 'propose') {
    return undefined;
  }
  return parsed.params.items.filter(
    (item) => item.status === TODO_STATUS.completed,
  );
}

export function buildBoardReview({
  items,
  evidence,
  changedIds,
}: {
  readonly items: readonly TodoItem[];
  readonly evidence: WorkflowEvidence;
  readonly changedIds?: ReadonlySet<string>;
}): JevRequestBody | undefined {
  const newlyCompleted = items.filter(
    (item) =>
      (changedIds === undefined || changedIds.has(item.id)) &&
      evidence.completed.get(item.id) !== item.content,
  );
  evidence.completed.clear();
  for (const item of items) {
    evidence.completed.set(item.id, item.content);
  }
  if (
    newlyCompleted.length === 0 ||
    (evidence.files.size === 0 &&
      evidence.checks !== 'passed' &&
      evidence.checks !== 'failed')
  ) {
    return undefined;
  }
  const files: ChangedFileEvidence[] = [];
  const state = {
    kind: 'completion',
    items: newlyCompleted,
    evidence: { files, checks: evidence.checks, partial: evidence.partial },
  };
  const request: JevRequestBody = {
    model: JEV_MODEL,
    state,
    questions: {
      'board-completion': question(
        'Do the newly completed tasks make a concrete claim contradicted by the supplied code changes or check status? Check status concerns only the detected project check in this user turn and becomes stale after a mutation. Missing evidence, unknown/stale checks and partial files do not prove unfinished work. Do not require every task to involve code or tests. Flag only an explicit mismatch, such as claiming checks passed when the observed latest checks failed.',
        'A completed task claims behavior or a check result demonstrably contradicted by visible evidence',
      ),
    },
  };
  for (const file of evidence.files.values()) {
    files.push(file);
    if (!requestFitsBudget(request)) {
      files.pop();
      state.evidence.partial = true;
    }
  }
  return (files.length > 0 ||
    evidence.checks === 'passed' ||
    evidence.checks === 'failed') &&
    requestFitsBudget(request)
    ? request
    : undefined;
}

export function completionIds(input: unknown): ReadonlySet<string> {
  const parsed = parseTodoParams(input as TodoToolParameters);
  if (!parsed.ok) {
    return new Set();
  }
  if (parsed.params.action === 'propose') {
    return new Set(
      parsed.params.items
        .filter((item) => item.status === TODO_STATUS.completed)
        .map((item) => item.id),
    );
  }
  return new Set(
    parsed.params.patches
      .filter(
        (patch) =>
          patch.status === TODO_STATUS.completed || patch.content !== undefined,
      )
      .map((patch) => patch.id),
  );
}
