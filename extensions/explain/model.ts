import { resolveFileToolPath } from '../shared/file-path.ts';

export const EXPLAIN_OFFER_TYPE = 'sideroom-explain-offer';

// Five is the point where a turn stopped being an adjustment and became work
// worth walking the user through.
export const EXPLAIN_FILE_THRESHOLD = 5;

const TUI_MODE = 'tui';

export const EXPLAIN_OFFER =
  "Use sideroom_ask for one question in the user's language with four parallel options: changes only, test steps only, both, or no explanation. Recommend changes only.";

export const EXPLAIN_DECISION = {
  send: 'send',
  defer: 'defer',
  none: 'none',
} as const;

export type ExplainDecision =
  (typeof EXPLAIN_DECISION)[keyof typeof EXPLAIN_DECISION];

export interface ExplainState {
  mutatedFilesThisTurn: Set<string>;
  mutatedSinceSettle: boolean;
  pendingOffer: boolean;
  offeredThisTurn: boolean;
}

export function createExplainState(): ExplainState {
  return {
    mutatedFilesThisTurn: new Set(),
    mutatedSinceSettle: false,
    pendingOffer: false,
    offeredThisTurn: false,
  };
}

export function resetExplainTurn(state: ExplainState): void {
  state.mutatedFilesThisTurn.clear();
  state.mutatedSinceSettle = false;
  state.pendingOffer = false;
  state.offeredThisTurn = false;
}

// Pi reports the path as the model wrote it, so use the built-in file-tool
// semantics and canonicalize existing aliases before counting the file.
export function mutationPathKey(cwd: string, path: string): string | undefined {
  return resolveFileToolPath(cwd, path);
}

export function recordMutation(state: ExplainState, pathKey: string): void {
  state.mutatedFilesThisTurn.add(pathKey);
  state.mutatedSinceSettle = true;
}

// The guidelines review steers at the first settle after a mutation, and
// agent_settled runs both deferred steers in extension load order. Explain
// holds its own steer back one settle so the review always runs first.
export function decideOffer(
  state: ExplainState,
  mode: string,
): ExplainDecision {
  const thresholdReached =
    mode === TUI_MODE &&
    !state.offeredThisTurn &&
    state.mutatedFilesThisTurn.size >= EXPLAIN_FILE_THRESHOLD;
  if (state.pendingOffer && thresholdReached) {
    return EXPLAIN_DECISION.send;
  }
  if (
    thresholdReached ||
    (mode === TUI_MODE && state.mutatedSinceSettle && !state.offeredThisTurn)
  ) {
    return EXPLAIN_DECISION.defer;
  }
  return EXPLAIN_DECISION.none;
}

export function applyOfferDecision(
  state: ExplainState,
  decision: ExplainDecision,
): void {
  if (decision === EXPLAIN_DECISION.send) {
    state.offeredThisTurn = true;
    state.pendingOffer = false;
  } else if (decision === EXPLAIN_DECISION.defer) {
    state.pendingOffer = true;
  } else {
    state.pendingOffer = false;
  }
  state.mutatedSinceSettle = false;
}
