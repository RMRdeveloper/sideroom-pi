import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  CHECK_OUTCOME,
  type CheckOutcome,
  registerCheckStatus,
} from '../shared/check-status.ts';
import { registerSettleSupplement, startsUserTurn } from '../shared/settle.ts';
import {
  CHECK_RESOLUTION,
  type CheckResolution,
  commandMatches,
  invalidateProjectDetection,
  isDirectDetectionFile,
} from './detect.ts';
import {
  type DoneState,
  formatMissingTestNotice,
  isSourcePath,
  isTestPath,
  MISSING_TEST_NOTICE_TYPE,
  shouldNoticeMissingTest,
} from './model.ts';

export type ResolveCommand = (
  ctx: Pick<ExtensionContext, 'cwd'>,
) => CheckResolution;

interface StartedCheck {
  readonly cwd: string;
  readonly version: number;
}

interface DirectoryCheck {
  green: boolean;
  outcome: CheckOutcome;
  version: number;
}

export type ResolveTestSetup = (ctx: Pick<ExtensionContext, 'cwd'>) => boolean;

interface DoneGuardOptions {
  readonly pi: ExtensionAPI;
  readonly state: DoneState;
  readonly resolveCommand: ResolveCommand;
  readonly resolveTestSetup: ResolveTestSetup;
}

export function registerDoneGuard({
  pi,
  state,
  resolveCommand,
  resolveTestSetup,
}: DoneGuardOptions): void {
  const startedChecks = new Map<string, StartedCheck>();
  const directories = new Map<string, DirectoryCheck>();
  const mutationPaths = new Map<string, string>();

  registerCheckStatus(pi, (ctx) => {
    const resolved = resolveCommand(ctx);
    if (resolved.kind === CHECK_RESOLUTION.unknown) {
      return {
        command: undefined,
        green: false,
        outcome: CHECK_OUTCOME.unknown,
      };
    }
    if (resolved.kind === CHECK_RESOLUTION.absent) {
      return undefined;
    }
    const observed = ensureDirectoryCheck(directories, ctx.cwd);
    return {
      command: resolved.command.display,
      green: observed.green,
      outcome: observed.outcome,
    };
  });

  pi.on('input', (event) => {
    if (!startsUserTurn(event)) {
      return;
    }
    startedChecks.clear();
    directories.clear();
  });

  pi.on('session_start', () => {
    startedChecks.clear();
    directories.clear();
  });

  pi.on('tool_call', (event, ctx) => {
    if (
      isToolCallEventType('write', event) ||
      isToolCallEventType('edit', event)
    ) {
      mutationPaths.set(event.toolCallId, event.input.path);
      return undefined;
    }
    if (!isToolCallEventType('bash', event)) {
      return undefined;
    }
    const resolved = resolveCommand(ctx);
    if (
      resolved.kind === CHECK_RESOLUTION.detected &&
      commandMatches(event.input.command, resolved.command)
    ) {
      startedChecks.set(event.toolCallId, {
        cwd: ctx.cwd,
        version: ensureDirectoryCheck(directories, ctx.cwd).version,
      });
    }
    return undefined;
  });

  pi.on('tool_result', (event, ctx) => {
    if (isWriteToolResult(event) || isEditToolResult(event)) {
      const recordedPath = mutationPaths.get(event.toolCallId);
      mutationPaths.delete(event.toolCallId);
      const inputPath = typeof event.input?.path === 'string'
        ? event.input.path
        : undefined;
      const path = recordedPath ?? inputPath;
      if (event.isError) {
        return;
      }
      noteMutation(directories, state, ctx.cwd);
      recordMutationPath(state, path);
      if (path !== undefined && isDirectDetectionFile(ctx.cwd, path)) {
        invalidateProjectDetection(ctx.cwd);
      }
      return;
    }
    if (!isBashToolResult(event)) {
      return;
    }
    const started = startedChecks.get(event.toolCallId);
    startedChecks.delete(event.toolCallId);
    if (started === undefined || started.cwd !== ctx.cwd) {
      return;
    }
    const observed = ensureDirectoryCheck(directories, started.cwd);
    if (event.isError) {
      observed.green = false;
      observed.outcome = CHECK_OUTCOME.failed;
      syncSessionCheck(state, observed);
      return;
    }
    if (started.version !== observed.version) {
      return;
    }
    observed.green = true;
    observed.outcome = CHECK_OUTCOME.passed;
    syncSessionCheck(state, observed);
  });

  registerSettleSupplement(pi, (ctx) => {
    if (!shouldNoticeMissingTest(state, resolveTestSetup(ctx))) {
      return undefined;
    }
    state.noticedMissingTest = true;
    return {
      customType: MISSING_TEST_NOTICE_TYPE,
      content: formatMissingTestNotice(),
    };
  });
}

function ensureDirectoryCheck(
  directories: Map<string, DirectoryCheck>,
  cwd: string,
): DirectoryCheck {
  const existing = directories.get(cwd);
  if (existing !== undefined) {
    return existing;
  }
  const created: DirectoryCheck = {
    green: false,
    outcome: CHECK_OUTCOME.notRun,
    version: 0,
  };
  directories.set(cwd, created);
  return created;
}

function noteMutation(
  directories: Map<string, DirectoryCheck>,
  state: DoneState,
  cwd: string,
): void {
  const observed = ensureDirectoryCheck(directories, cwd);
  observed.version += 1;
  observed.green = false;
  if (observed.outcome === CHECK_OUTCOME.passed) {
    observed.outcome = CHECK_OUTCOME.stale;
  }
  syncSessionCheck(state, observed);
}

function syncSessionCheck(state: DoneState, observed: DirectoryCheck): void {
  state.checksGreen = observed.green;
  state.checkOutcome = observed.outcome;
}

function recordMutationPath(state: DoneState, path: string | undefined): void {
  if (path === undefined) {
    return;
  }
  if (isTestPath(path)) {
    state.mutatedTest = true;
    return;
  }
  if (isSourcePath(path)) {
    state.mutatedSource = true;
  }
}
