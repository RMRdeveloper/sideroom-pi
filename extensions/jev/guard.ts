import {
  type ExtensionAPI,
  type ExtensionContext,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import {
  projectRelativePath,
  resolveFileToolPath,
} from '../shared/file-path.ts';
import { readFileIfExists } from '../shared/read-file.ts';
import { REVIEW_NOTE_EVENT, type ReviewNote } from '../shared/review-note.ts';
import { startsUserTurn } from '../shared/settle.ts';
import {
  askJev,
  JEV_FAILURE,
  type JevFailure,
  type JevTransport,
} from './client.ts';
import {
  type AddedLine,
  addedLinesForEdit,
  addedLinesForWrite,
  buildFileState,
  findingKey,
  formatFindings,
  isReviewablePath,
  type JevFinding,
  stateFitsBudget,
} from './model.ts';

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
    pending: new Map(),
    notedThisTurn: new Set(),
  };
}

// The F10 screen calls this after the user stores a key or asks to retry.
export function resetJevGuard(state: JevGuardState): void {
  state.halted = undefined;
  state.transientFailures = 0;
  state.rateLimitedThisTurn = false;
}

// Usage and per-turn memory belong to the active session: a new session starts
// counting from zero. The breaker stays, because it tracks the key.
export function resetJevSession(state: JevGuardState): void {
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
  pi.on('input', (event) => {
    if (!startsUserTurn(event)) {
      return;
    }
    state.notedThisTurn.clear();
    state.rateLimitedThisTurn = false;
  });

  // A call another extension blocks in tool_call never reaches tool_result,
  // and every result of a turn lands before its turn_end.
  pi.on('turn_end', () => {
    state.pending.clear();
  });

  // The added lines are read before the mutation lands, because after a write
  // the previous content is gone. The body is read after, from disk.
  pi.on('tool_call', (event, ctx) => {
    const mutation = extractMutation(event, ctx.cwd);
    if (mutation === undefined || !isWorthAsking(mutation)) {
      return undefined;
    }
    state.pending.set(event.toolCallId, mutation);
    return undefined;
  });

  pi.on('tool_result', async (event, ctx) => {
    const pending = state.pending.get(event.toolCallId);
    state.pending.delete(event.toolCallId);
    if (pending === undefined || event.isError) {
      return undefined;
    }
    if (!isWriteToolResult(event) && !isEditToolResult(event)) {
      return undefined;
    }

    const apiKey = dependencies.apiKey();
    if (apiKey === undefined) {
      dependencies.report(JEV_STATUS.noKey, ctx);
      return undefined;
    }
    if (!shouldCallJev(state)) {
      dependencies.report(guardStatus(state), ctx);
      return undefined;
    }

    const body = readFileIfExists(pending.absolutePath);
    if (body === undefined) {
      return undefined;
    }
    const fileState = buildFileState(
      pending.relativePath,
      body,
      pending.kind,
      pending.lines,
    );
    if (!stateFitsBudget(fileState) || ctx.signal?.aborted === true) {
      return undefined;
    }

    state.calls += 1;
    const attempt = await askJev(
      dependencies.transport,
      apiKey,
      fileState,
      ctx.signal,
    );
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
      isUnnoted(state, pending.relativePath, finding),
    );
    if (fresh.length === 0) {
      return undefined;
    }
    markNoted(state, pending.relativePath, fresh);
    const note: ReviewNote = {
      text: formatFindings(pending.relativePath, fresh),
    };
    pi.events.emit(REVIEW_NOTE_EVENT, note);
    return undefined;
  });
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

// A user abort says nothing about the service, and a rate limit clears on its
// own, so neither may count toward switching Jev off.
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

// A deletion-only edit leaves nothing for the six questions to read, and only
// the project-relative path of a supported language may leave the machine.
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
