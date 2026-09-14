import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  EXPLAIN_OFFER,
  EXPLAIN_OFFER_TYPE,
  type ExplainState,
  resetExplainRun,
  shouldOfferExplanation,
} from './model.ts';

export function registerExplainGuard(
  pi: ExtensionAPI,
  state: ExplainState,
): void {
  pi.on('input', (event) => {
    if (event.source !== 'interactive' && event.source !== 'rpc') {
      return;
    }
    resetExplainRun(state);
  });

  pi.on('tool_result', (event) => {
    if (event.isError) {
      return;
    }
    if (!isEditToolResult(event) && !isWriteToolResult(event)) {
      return;
    }
    state.mutatedSincePrompt = true;
  });

  // agent_settled is the only point with no retry, compaction, or queued
  // continuation left, so the walkthrough is never offered over reworked work.
  pi.on('agent_settled', (_event, ctx) => {
    if (!shouldOfferExplanation(state, ctx.mode)) {
      return;
    }
    state.offeredThisRun = true;
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
