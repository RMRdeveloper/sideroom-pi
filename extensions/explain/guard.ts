import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  acceptsSettleSteer,
  startsUserTurn,
  withHiddenSteer,
} from '../shared/settle.ts';
import {
  applyOfferDecision,
  decideOffer,
  EXPLAIN_DECISION,
  EXPLAIN_OFFER,
  EXPLAIN_OFFER_TYPE,
  type ExplainState,
  mutationPathKey,
  recordMutation,
  resetExplainTurn,
} from './model.ts';

interface FileToolInput {
  readonly path: string;
}

export function registerExplainGuard(
  pi: ExtensionAPI,
  state: ExplainState,
): void {
  pi.on('input', (event) => {
    if (!startsUserTurn(event)) {
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
    recordMutation(state, pathKey);
  });

  // agent_before_settle runs after retries and compaction recovery, so the
  // walkthrough is never offered over reworked work, and its continuation
  // stays inside the same run instead of starting a second one.
  pi.on('agent_before_settle', (event, ctx) => {
    if (!acceptsSettleSteer(event)) {
      return;
    }
    const decision = decideOffer(state, ctx.mode);
    applyOfferDecision(state, decision);
    if (decision !== EXPLAIN_DECISION.send) {
      return;
    }
    return withHiddenSteer(event, EXPLAIN_OFFER_TYPE, EXPLAIN_OFFER);
  });
}
