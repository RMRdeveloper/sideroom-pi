export const EXPLAIN_OFFER_TYPE = 'sideroom-explain-offer';

const TUI_MODE = 'tui';

export const EXPLAIN_OFFER =
  "Use sideroom_ask for one question in the user's language with three options: explain changes and test steps, test steps only, or no explanation. Recommend one.";

export interface ExplainState {
  mutatedSincePrompt: boolean;
  offeredThisRun: boolean;
}

export function createExplainState(): ExplainState {
  return { mutatedSincePrompt: false, offeredThisRun: false };
}

export function resetExplainRun(state: ExplainState): void {
  state.mutatedSincePrompt = false;
  state.offeredThisRun = false;
}

// sideroom_ask rejects every mode but the TUI, so the offer is gated the same way.
export function shouldOfferExplanation(
  state: ExplainState,
  mode: string,
): boolean {
  return mode === TUI_MODE && state.mutatedSincePrompt && !state.offeredThisRun;
}
