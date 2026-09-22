import {
  type ExtensionAPI,
  type ExtensionContext,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import { resolveFileToolPath } from '../shared/file-path.ts';
import { readFileIfExists } from '../shared/read-file.ts';
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
  unavailable: 'unavailable',
} as const;

export type JevStatus = (typeof JEV_STATUS)[keyof typeof JEV_STATUS];

interface PendingMutation {
  readonly path: string;
  readonly kind: string;
  readonly lines: readonly AddedLine[];
}

export interface JevGuardState {
  halted: JevStatus | undefined;
  transientFailures: number;
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
}

// Usage belongs to the active session: a new session starts counting from zero.
export function resetJevUsage(state: JevGuardState): void {
  state.calls = 0;
}

export function guardStatus(state: JevGuardState): JevStatus {
  if (state.halted !== undefined) {
    return state.halted;
  }
  return state.transientFailures > 0
    ? JEV_STATUS.unavailable
    : JEV_STATUS.ready;
}

export function shouldCallJev(state: JevGuardState): boolean {
  return (
    state.halted === undefined &&
    state.transientFailures < JEV_TRANSIENT_FAILURE_LIMIT
  );
}

export function registerJevGuard(
  pi: ExtensionAPI,
  state: JevGuardState,
  dependencies: JevGuardDependencies,
): void {
  pi.on('input', (event) => {
    if (event.source !== 'interactive' && event.source !== 'rpc') {
      return;
    }
    state.notedThisTurn.clear();
  });

  // The added lines are read before the mutation lands, because after a write
  // the previous content is gone. The body is read after, from disk.
  pi.on('tool_call', (event, ctx) => {
    const mutation = extractMutation(event, ctx.cwd);
    if (mutation === undefined) {
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

    const body = readMutationBody(ctx.cwd, pending.path);
    if (body === undefined || !stateFitsBudget(body)) {
      return undefined;
    }

    state.calls += 1;
    const attempt = await askJev(
      dependencies.transport,
      apiKey,
      buildFileState(pending.path, body, pending.kind, pending.lines),
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
      isUnnoted(state, pending.path, finding),
    );
    if (fresh.length === 0) {
      return undefined;
    }
    markNoted(state, pending.path, fresh);
    return {
      content: [
        ...event.content,
        { type: 'text' as const, text: formatFindings(pending.path, fresh) },
      ],
    };
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

function registerFailure(state: JevGuardState, failure: JevFailure): void {
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

function extractMutation(
  event: ToolCallEvent,
  cwd: string,
): PendingMutation | undefined {
  if (isToolCallEventType('write', event)) {
    const absolutePath = resolveFileToolPath(cwd, event.input.path);
    return {
      path: event.input.path,
      kind: MUTATION_KIND.write,
      lines: addedLinesForWrite(
        absolutePath === undefined ? undefined : readFileIfExists(absolutePath),
        event.input.content,
      ),
    };
  }
  if (isToolCallEventType('edit', event)) {
    return {
      path: event.input.path,
      kind: MUTATION_KIND.edit,
      lines: addedLinesForEdit(event.input.edits),
    };
  }
  return undefined;
}

function readMutationBody(cwd: string, path: string): string | undefined {
  const absolutePath = resolveFileToolPath(cwd, path);
  if (absolutePath === undefined) {
    return undefined;
  }
  return readFileIfExists(absolutePath);
}
