import {
  type ExtensionAPI,
  type ExtensionContext,
  isBashToolResult,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
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

export function registerDoneGuard(
  pi: ExtensionAPI,
  state: DoneState,
  resolveCommand: ResolveCommand,
  resolveTestSetup: ResolveTestSetup,
): void {
  const checkRuns = new Set<string>();
  const mutationPaths = new Map<string, string>();

  pi.on('turn_start', () => {
    state.steeredThisTurn = false;
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
      state.mutated = true;
      state.checksGreen = false;
      recordMutationPath(state, path);
      return;
    }
    if (isBashToolResult(event)) {
      const wasCheck = checkRuns.delete(event.toolCallId);
      if (wasCheck && !event.isError) {
        state.checksGreen = true;
      }
    }
  });

  pi.on('turn_end', (_event, ctx) => {
    const check = resolveCommand(ctx);
    if (check !== undefined && shouldSteerDone(state, true)) {
      state.steeredThisTurn = true;
      state.steerCount += 1;
      pi.sendMessage(
        {
          customType: DONE_GATE_TYPE,
          content: formatDoneSteer(check.display),
          display: false,
        },
        { triggerTurn: true, deliverAs: 'steer' },
      );
      return;
    }

    if (!shouldNoticeMissingTest(state, resolveTestSetup(ctx))) {
      return;
    }
    state.noticedMissingTest = true;
    state.steerCount += 1;
    pi.sendMessage(
      {
        customType: MISSING_TEST_NOTICE_TYPE,
        content: formatMissingTestNotice(),
        display: false,
      },
      { triggerTurn: true, deliverAs: 'steer' },
    );
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
