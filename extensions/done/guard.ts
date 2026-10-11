import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  registerSettleGuard,
  SETTLE_PRIORITY,
  withHiddenSteer,
} from '../shared/settle.ts';
import { type CheckCommand, commandMatches } from './detect.ts';
import {
  DONE_GATE_TYPE,
  type DoneState,
  formatDoneSteer,
  formatMissingTestNotice,
  isSourcePath,
  isTestPath,
  MISSING_TEST_NOTICE_TYPE,
  shouldNoticeMissingTest,
  shouldSteerDone,
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
      state.mutated = true;
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

  registerSettleGuard(pi, {
    priority: SETTLE_PRIORITY.done,
    pending: (ctx) =>
      shouldSteerDone(state, resolveCommand(ctx) !== undefined) ||
      shouldNoticeMissingTest(state, resolveTestSetup(ctx)),
    handle: (event, ctx) => {
      const check = resolveCommand(ctx);
      if (check !== undefined && shouldSteerDone(state, true)) {
        state.steerCount += 1;
        return withHiddenSteer({
          event,
          customType: DONE_GATE_TYPE,
          content: formatDoneSteer(check.display),
        });
      }
      if (!shouldNoticeMissingTest(state, resolveTestSetup(ctx))) {
        return;
      }
      state.noticedMissingTest = true;
      state.steerCount += 1;
      return withHiddenSteer({
        event,
        customType: MISSING_TEST_NOTICE_TYPE,
        content: formatMissingTestNotice(),
      });
    },
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
