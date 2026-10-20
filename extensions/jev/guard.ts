import {
  type ExtensionAPI,
  type ExtensionContext,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import { commandMatches, detectCheckCommand } from '../done/detect.ts';
import {
  projectRelativePath,
  resolveFileToolPath,
} from '../shared/file-path.ts';
import { readFileIfExists } from '../shared/read-file.ts';
import { REVIEW_NOTE_EVENT, type ReviewNote } from '../shared/review-note.ts';
import { registerSettleWait, startsUserTurn } from '../shared/settle.ts';
import { JevReviewQueue } from './queue.ts';
import {
  askJevRequest,
  JEV_FAILURE,
  type JevFailure,
  type JevTransport,
} from './client.ts';
import { buildContextualState } from './context.ts';
import {
  type AddedLine,
  addedLinesForEdit,
  addedLinesForWrite,
  buildRequestBody,
  findingKey,
  formatFindings,
  isReviewablePath,
  type JevFinding,
  type JevRequestBody,
} from './model.ts';

import {
  buildAskReview,
  buildBoardReview,
  completedItems,
  completionIds,
  createWorkflowEvidence,
  recordFileEvidence,
  resetWorkflowEvidence,
  type WorkflowEvidence,
} from './workflow.ts';

export const JEV_TRANSIENT_FAILURE_LIMIT = 3;

const MUTATION_KIND = {
  write: 'write',
  edit: 'edit',
} as const;

export const JEV_STATUS = {
  ready: 'ready',
  noKey: 'noKey',
  quota: 'quota',
  auth: 'auth',
  rateLimited: 'rateLimited',
  unavailable: 'unavailable',
} as const;

export type JevStatus = (typeof JEV_STATUS)[keyof typeof JEV_STATUS];

interface MutationTarget {
  readonly absolutePath: string;
  readonly relativePath: string;
}

interface PendingMutation extends MutationTarget {
  readonly kind: string;
  readonly lines: readonly AddedLine[];
}

export interface JevGuardState {
  halted: JevStatus | undefined;
  transientFailures: number;
  rateLimitedThisTurn: boolean;
  lastModel: string | undefined;
  calls: number;
  readonly queue: JevReviewQueue;
  readonly evidence: WorkflowEvidence;
  readonly pending: Map<string, PendingMutation>;
  readonly notedThisTurn: Set<string>;
}

export interface JevGuardDependencies {
  readonly apiKey: () => string | undefined;
  readonly transport: JevTransport;
  readonly report: (status: JevStatus, ctx: ExtensionContext) => void;
}

export function createJevGuardState(): JevGuardState {
  return {
    halted: undefined,
    transientFailures: 0,
    rateLimitedThisTurn: false,
    lastModel: undefined,
    calls: 0,
    queue: new JevReviewQueue(),
    evidence: createWorkflowEvidence(),
    pending: new Map(),
    notedThisTurn: new Set(),
  };
}

export function resetJevGuard(state: JevGuardState): void {
  state.queue.cancel();
  resetWorkflowEvidence(state.evidence);
  state.halted = undefined;
  state.transientFailures = 0;
  state.rateLimitedThisTurn = false;
}

export function resetJevSession(state: JevGuardState): void {
  state.queue.cancel();
  resetWorkflowEvidence(state.evidence);
  state.calls = 0;
  state.rateLimitedThisTurn = false;
  state.pending.clear();
  state.notedThisTurn.clear();
}

export function guardStatus(state: JevGuardState): JevStatus {
  if (state.halted !== undefined) {
    return state.halted;
  }
  if (state.rateLimitedThisTurn) {
    return JEV_STATUS.rateLimited;
  }
  return state.transientFailures > 0
    ? JEV_STATUS.unavailable
    : JEV_STATUS.ready;
}

export function shouldCallJev(state: JevGuardState): boolean {
  return (
    state.halted === undefined &&
    !state.rateLimitedThisTurn &&
    state.transientFailures < JEV_TRANSIENT_FAILURE_LIMIT
  );
}

export function registerJevGuard(
  pi: ExtensionAPI,
  state: JevGuardState,
  dependencies: JevGuardDependencies,
): void {
  registerSettleWait(pi, () => state.queue.drain());
  pi.on('session_shutdown', () => state.queue.cancel());

  pi.on('input', (event) => {
    if (!startsUserTurn(event)) {
      return;
    }
    state.queue.cancel();
    resetWorkflowEvidence(state.evidence);
    state.notedThisTurn.clear();
    state.rateLimitedThisTurn = false;
  });

  pi.on('turn_end', () => {
    state.pending.clear();
  });

  pi.on('tool_call', (event, ctx) => {
    const mutation = extractMutation(event, ctx.cwd);
    if (mutation === undefined || !isReviewablePath(mutation.relativePath)) {
      return undefined;
    }
    state.pending.set(event.toolCallId, mutation);
    return undefined;
  });

  pi.on('tool_result', (event, ctx) => {
    const pending = state.pending.get(event.toolCallId);
    state.pending.delete(event.toolCallId);
    if (!event.isError && pending !== undefined) {
      state.queue.invalidate(pending.relativePath);
      state.queue.invalidate('sideroom_todo');
    }
    const apiKey = dependencies.apiKey();
    if (
      apiKey === undefined ||
      !shouldCallJev(state) ||
      ctx.signal?.aborted === true
    ) {
      if (!event.isError && pending !== undefined && isWorthAsking(pending)) {
        dependencies.report(
          apiKey === undefined ? JEV_STATUS.noKey : guardStatus(state),
          ctx,
        );
      }
      return undefined;
    }
    if (event.isError) {
      if (
        event.toolName === 'bash' &&
        typeof event.input.command === 'string'
      ) {
        const check = detectCheckCommand(ctx.cwd);
        if (check !== undefined && commandMatches(event.input.command, check)) {
          state.evidence.checks = 'failed';
          state.queue.invalidate('sideroom_todo');
        }
      }
      return undefined;
    }
    if (event.toolName === 'bash' && typeof event.input.command === 'string') {
      const check = detectCheckCommand(ctx.cwd);
      if (check !== undefined && commandMatches(event.input.command, check)) {
        state.evidence.checks = 'passed';
        state.queue.invalidate('sideroom_todo');
      }
      return undefined;
    }
    let requestBody: JevRequestBody | undefined;
    let subject: string;
    let sourcePaths: readonly string[] = [];
    if (event.toolName === 'sideroom_ask') {
      if (
        typeof event.details !== 'object' ||
        event.details === null ||
        !('cancelled' in event.details) ||
        event.details.cancelled !== false
      ) {
        return undefined;
      }
      requestBody = buildAskReview(event.input);
      subject = 'sideroom_ask';
    } else if (event.toolName === 'sideroom_todo') {
      const items = completedItems(event.details);
      if (items === undefined) {
        return undefined;
      }
      requestBody = buildBoardReview({
        items,
        evidence: state.evidence,
        changedIds: completionIds(event.input),
      });
      subject = 'sideroom_todo';
      sourcePaths = [...state.evidence.files.keys()];
    } else {
      if (
        pending === undefined ||
        (!isWriteToolResult(event) && !isEditToolResult(event))
      ) {
        return undefined;
      }
      subject = pending.relativePath;
      state.evidence.checks = 'stale';
      const previous = state.evidence.files.get(subject);
      state.evidence.files.delete(subject);
      if (!isWorthAsking(pending)) {
        state.evidence.partial = true;
        return undefined;
      }
      const body = readFileIfExists(pending.absolutePath);
      if (body === undefined) {
        state.evidence.partial = true;
        return undefined;
      }
      const fileState = buildContextualState(
        ctx.cwd,
        subject,
        body,
        pending.kind,
        mergeReviewLines({ previous: previous?.change.addedLines ?? [], added: pending.lines, body }),
      );
      if (fileState === undefined) {
        state.evidence.partial = true;
        return undefined;
      }
      recordFileEvidence(state.evidence, fileState);
      requestBody = buildRequestBody(fileState);
      sourcePaths = [subject, ...fileState.context.files.map((file) => file.path)];
    }
    if (requestBody === undefined) {
      return undefined;
    }

    const body = requestBody;
    return state.queue.enqueue({
      key: subject,
      dependencies: sourcePaths,
      signal: ctx.signal,
      run: async (signal) => {
        if (!shouldCallJev(state) || dependencies.apiKey() !== apiKey || signal.aborted) {
          return;
        }
        state.calls += 1;
        const attempt = await askJevRequest({
          transport: dependencies.transport,
          apiKey,
          requestBody: body,
          signal,
        });
        if (signal.aborted || dependencies.apiKey() !== apiKey) {
          return;
        }
        if (attempt.failure !== undefined) {
          registerFailure(state, attempt.failure);
          dependencies.report(guardStatus(state), ctx);
          return undefined;
        }

        registerSuccess(state);
        if (attempt.model !== undefined) {
          state.lastModel = attempt.model;
        }
        dependencies.report(JEV_STATUS.ready, ctx);

        const findings = attempt.findings ?? [];
        const fresh = findings.filter((finding) =>
          isUnnoted(state, subject, finding),
        );
        if (fresh.length === 0) {
          return undefined;
        }
        markNoted(state, subject, fresh);
        const note: ReviewNote = {
          text: formatFindings(subject, fresh),
        };
        pi.events.emit(REVIEW_NOTE_EVENT, note);
        return undefined;
      },
    });
  });
}

interface ReviewLinesInput {
  readonly previous: readonly string[];
  readonly added: readonly AddedLine[];
  readonly body: string;
}

function mergeReviewLines({ previous, added, body }: ReviewLinesInput): readonly AddedLine[] {
  const changed = new Set([...previous, ...added.map((line) => line.text)].map((text) => text.trim()));
  return body.split('\n').flatMap((text, index) =>
    changed.has(text.trim()) ? [{ line: index + 1, text }] : [],
  );
}

function isUnnoted(
  state: JevGuardState,
  path: string,
  finding: JevFinding,
): boolean {
  return !state.notedThisTurn.has(findingKey(path, finding.ruleId));
}

function markNoted(
  state: JevGuardState,
  path: string,
  findings: readonly JevFinding[],
): void {
  for (const finding of findings) {
    state.notedThisTurn.add(findingKey(path, finding.ruleId));
  }
}

function registerFailure(state: JevGuardState, failure: JevFailure): void {
  if (failure === JEV_FAILURE.cancelled) {
    return;
  }
  if (failure === JEV_FAILURE.rateLimited) {
    state.rateLimitedThisTurn = true;
    return;
  }
  if (failure === JEV_FAILURE.quota) {
    state.halted = JEV_STATUS.quota;
    return;
  }
  if (failure === JEV_FAILURE.auth) {
    state.halted = JEV_STATUS.auth;
    return;
  }
  state.transientFailures += 1;
  if (state.transientFailures >= JEV_TRANSIENT_FAILURE_LIMIT) {
    state.halted = JEV_STATUS.unavailable;
  }
}

function registerSuccess(state: JevGuardState): void {
  state.halted = undefined;
  state.transientFailures = 0;
}

function isWorthAsking(mutation: PendingMutation): boolean {
  return mutation.lines.length > 0 && isReviewablePath(mutation.relativePath);
}

function extractMutation(
  event: ToolCallEvent,
  cwd: string,
): PendingMutation | undefined {
  if (isToolCallEventType('write', event)) {
    const target = resolveTarget(cwd, event.input.path);
    if (target === undefined) {
      return undefined;
    }
    return {
      ...target,
      kind: MUTATION_KIND.write,
      lines: addedLinesForWrite(
        readFileIfExists(target.absolutePath),
        event.input.content,
      ),
    };
  }
  if (isToolCallEventType('edit', event)) {
    const target = resolveTarget(cwd, event.input.path);
    if (target === undefined) {
      return undefined;
    }
    return {
      ...target,
      kind: MUTATION_KIND.edit,
      lines: addedLinesForEdit(event.input.edits),
    };
  }
  return undefined;
}

function resolveTarget(cwd: string, path: string): MutationTarget | undefined {
  const absolutePath = resolveFileToolPath(cwd, path);
  if (absolutePath === undefined) {
    return undefined;
  }
  const relativePath = projectRelativePath(cwd, absolutePath);
  if (relativePath === undefined) {
    return undefined;
  }
  return { absolutePath, relativePath };
}
