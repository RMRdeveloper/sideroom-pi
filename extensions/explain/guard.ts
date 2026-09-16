import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  EXPLAIN_OFFER,
  EXPLAIN_OFFER_TYPE,
  type ExplainState,
  mutationPathKey,
  resetExplainTurn,
  shouldOfferExplanation,
} from './model.ts';

interface FileToolInput {
  readonly path: string;
}

export function registerExplainGuard(
  pi: ExtensionAPI,
  state: ExplainState,
): void {
  pi.on('input', (event) => {
    if (event.source !== 'interactive' && event.source !== 'rpc') {
      return;
    }
    resetExplainTurn(state);
  });

  pi.on('tool_result', (event, ctx) => {
    if (event.isError) {
      return;
    }
    if (!isEditToolResult(event) && !isWriteToolResult(event)) {
      return;
    }
    // SAFETY: Pi validates built-in file-tool inputs before emitting tool_result.
    const input = event.input as unknown as FileToolInput;
    const pathKey = mutationPathKey(ctx.cwd, input.path);
    if (pathKey === undefined) {
      return;
    }
    state.mutatedFilesThisTurn.add(pathKey);
  });

  // agent_settled is the only point with no retry, compaction, or queued
  // continuation left, so the walkthrough is never offered over reworked work.
  pi.on('agent_settled', (_event, ctx) => {
    if (!shouldOfferExplanation(state, ctx.mode)) {
      return;
    }
    state.offeredThisTurn = true;
    pi.sendMessage(
      {
        customType: EXPLAIN_OFFER_TYPE,
        content: EXPLAIN_OFFER,
        display: false,
      },
      { triggerTurn: true, deliverAs: 'steer' },
    );
  });
}
