import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { registerCheckStatus } from '../shared/check-status.ts';
import { registerSettleSupplement } from '../shared/settle.ts';
import { type CheckCommand, commandMatches } from './detect.ts';
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
) => CheckCommand | undefined;

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
  const checkRuns = new Set<string>();
  const mutationPaths = new Map<string, string>();

  registerCheckStatus(pi, (ctx) => {
    const check = resolveCommand(ctx);
    return check === undefined
      ? undefined
      : { command: check.display, green: state.checksGreen };
  });

  pi.on('tool_call', (event, ctx) => {
    if (
      isToolCallEventType('write', event) ||
      isToolCallEventType('edit', event)
    ) {
      mutationPaths.set(event.toolCallId, event.input.path);
      return;
    }
    if (!isToolCallEventType('bash', event)) {
      return;
    }
    const check = resolveCommand(ctx);
    if (check === undefined) {
      return;
    }
    if (commandMatches(event.input.command, check)) {
      checkRuns.add(event.toolCallId);
    }
  });

  pi.on('tool_result', (event) => {
    if (isWriteToolResult(event) || isEditToolResult(event)) {
      const path = mutationPaths.get(event.toolCallId);
      mutationPaths.delete(event.toolCallId);
      if (event.isError) {
        return;
      }
      state.checksGreen = false;
      recordMutationPath(state, path);
      return;
    }
    if (isBashToolResult(event)) {
      const wasCheck = checkRuns.delete(event.toolCallId);
      if (wasCheck) {
        state.checksGreen = !event.isError;
      }
    }
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
