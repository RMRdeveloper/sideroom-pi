import { resolveFileToolPath } from '../shared/file-path.ts';

export const EXPLAIN_OFFER_TYPE = 'sideroom-explain-offer';

export const EXPLAIN_FILE_THRESHOLD = 5;

const TUI_MODE = 'tui';

export const EXPLAIN_OFFER =
  "Use sideroom_ask for one question in the user's language with four parallel options: changes only, test steps only, both, or no explanation. Recommend changes only.";

export const EXPLAIN_DECISION = {
  send: 'send',
  none: 'none',
} as const;

export type ExplainDecision =
  (typeof EXPLAIN_DECISION)[keyof typeof EXPLAIN_DECISION];

export interface ExplainState {
  mutatedFilesThisTurn: Set<string>;
  offeredThisTurn: boolean;
}

export function createExplainState(): ExplainState {
  return {
    mutatedFilesThisTurn: new Set(),
    offeredThisTurn: false,
  };
}

export function resetExplainTurn(state: ExplainState): void {
  state.mutatedFilesThisTurn.clear();
  state.offeredThisTurn = false;
}

export function mutationPathKey(cwd: string, path: string): string | undefined {
  return resolveFileToolPath(cwd, path);
}

export function recordMutation(state: ExplainState, pathKey: string): void {
  state.mutatedFilesThisTurn.add(pathKey);
}

export function decideOffer(
  state: ExplainState,
  mode: string,
): ExplainDecision {
  const thresholdReached =
    mode === TUI_MODE &&
    !state.offeredThisTurn &&
    state.mutatedFilesThisTurn.size >= EXPLAIN_FILE_THRESHOLD;
  if (thresholdReached) {
    return EXPLAIN_DECISION.send;
  }
  return EXPLAIN_DECISION.none;
}

export function applyOfferDecision(
  state: ExplainState,
  decision: ExplainDecision,
): void {
  if (decision === EXPLAIN_DECISION.send) {
    state.offeredThisTurn = true;
  }
}
