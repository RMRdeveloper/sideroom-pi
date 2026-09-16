import { resolveFileToolPath } from '../shared/file-path.ts';

export const EXPLAIN_OFFER_TYPE = 'sideroom-explain-offer';

// Five is the point where a turn stopped being an adjustment and became work
// worth walking the user through.
export const EXPLAIN_FILE_THRESHOLD = 5;

const TUI_MODE = 'tui';

export const EXPLAIN_OFFER =
  "Use sideroom_ask for one question in the user's language with four parallel options: changes only, test steps only, both, or no explanation. Recommend changes only.";

export interface ExplainState {
  mutatedFilesThisTurn: Set<string>;
  offeredThisTurn: boolean;
}

export function createExplainState(): ExplainState {
  return { mutatedFilesThisTurn: new Set(), offeredThisTurn: false };
}

export function resetExplainTurn(state: ExplainState): void {
  state.mutatedFilesThisTurn.clear();
  state.offeredThisTurn = false;
}

// Pi reports the path as the model wrote it, so use the built-in file-tool
// semantics and canonicalize existing aliases before counting the file.
export function mutationPathKey(cwd: string, path: string): string | undefined {
  return resolveFileToolPath(cwd, path);
}

// sideroom_ask rejects every mode but the TUI, so the offer is gated the same way.
export function shouldOfferExplanation(
  state: ExplainState,
  mode: string,
): boolean {
  return (
    mode === TUI_MODE &&
    state.mutatedFilesThisTurn.size >= EXPLAIN_FILE_THRESHOLD &&
    !state.offeredThisTurn
  );
}
