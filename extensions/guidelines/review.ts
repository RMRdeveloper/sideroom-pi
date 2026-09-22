import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';

export const REVIEW_STEER_TYPE = 'sideroom-guidelines-review';

export const REVIEW_STEER =
  'Review every file this run changed against the loaded Sideroom language guide: fix any mechanical, structural, or architectural rule violations in those files, then run the relevant formatter, linter, type checks, and tests. If the guide is no longer in context, re-read it in full first.';

export interface ReviewState {
  mutated: boolean;
  steeredThisTurn: boolean;
}

export function createReviewState(): ReviewState {
  return { mutated: false, steeredThisTurn: false };
}

export function resetReviewTurn(state: ReviewState): void {
  state.mutated = false;
  state.steeredThisTurn = false;
}

export function shouldReview(state: ReviewState): boolean {
  return state.mutated && !state.steeredThisTurn;
}

export function registerReviewGuard(
  pi: ExtensionAPI,
  state: ReviewState,
): void {
  pi.on('input', (event) => {
    if (event.source !== 'interactive' && event.source !== 'rpc') {
      return;
    }
    resetReviewTurn(state);
  });

  pi.on('tool_result', (event) => {
    if (event.isError) {
      return;
    }
    if (!isEditToolResult(event) && !isWriteToolResult(event)) {
      return;
    }
    state.mutated = true;
  });

  // agent_settled is the only point with no retry, compaction, or queued
  // continuation left, so the review never lands on work a retry is about to
  // redo. Mark the flag before sending so the continuation this steer starts
  // cannot re-trigger it; sendMessage is intentionally not awaited, matching
  // explain, so the settle handler returns immediately.
  pi.on('agent_settled', () => {
    if (!shouldReview(state)) {
      return;
    }
    state.steeredThisTurn = true;
    pi.sendMessage(
      {
        customType: REVIEW_STEER_TYPE,
        content: REVIEW_STEER,
        display: false,
      },
      { triggerTurn: true, deliverAs: 'steer' },
    );
  });
}
