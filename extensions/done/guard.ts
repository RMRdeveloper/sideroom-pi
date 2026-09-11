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
  shouldSteerDone,
} from './model.ts';

export type ResolveCommand = (
  ctx: Pick<ExtensionContext, 'cwd'>,
) => CheckCommand | undefined;

export function registerDoneGuard(
  pi: ExtensionAPI,
  state: DoneState,
  resolveCommand: ResolveCommand,
): void {
  const checkRuns = new Set<string>();

  pi.on('turn_start', () => {
    state.steeredThisTurn = false;
  });

  pi.on('tool_call', (event, ctx) => {
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
      if (!event.isError) {
        state.mutated = true;
        state.checksGreen = false;
      }
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
    if (check === undefined || !shouldSteerDone(state, true)) {
      return;
    }
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
  });
}
