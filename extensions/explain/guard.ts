import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { registerSettleSupplement, startsUserTurn } from '../shared/settle.ts';
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

    const input = event.input as unknown as FileToolInput;
    const pathKey = mutationPathKey(ctx.cwd, input.path);
    if (pathKey === undefined) {
      return;
    }
    recordMutation(state, pathKey);
  });

  registerSettleSupplement(pi, (ctx) => {
    if (decideOffer(state, ctx.mode) !== EXPLAIN_DECISION.send) {
      return undefined;
    }
    applyOfferDecision(state, EXPLAIN_DECISION.send);
    return {
      customType: EXPLAIN_OFFER_TYPE,
      content: `After finishing the requested work, review, and checks: ${EXPLAIN_OFFER}`,
    };
  });
}
