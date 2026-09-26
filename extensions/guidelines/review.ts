import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { isReviewNote, REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import {
  acceptsSettleSteer,
  startsUserTurn,
  withHiddenSteer,
} from '../shared/settle.ts';

export const REVIEW_STEER_TYPE = 'sideroom-guidelines-review';

export const REVIEW_STEER =
  'Review every file this run changed against the loaded Sideroom language guide: fix any mechanical, structural, or architectural rule violations in those files, then run the relevant formatter, linter, type checks, and tests. If the guide is no longer in context, re-read it in full first.';

export const REVIEW_NOTES_STEER =
  'Files changed during the review drew the semantic notes below. Verify each against the loaded Sideroom language guide, fix only real violations, then rerun the relevant checks.';

export interface ReviewState {
  mutated: boolean;
  steeredThisTurn: boolean;
  notesSteeredThisTurn: boolean;
  notes: string[];
}

export function createReviewState(): ReviewState {
  return {
    mutated: false,
    steeredThisTurn: false,
    notesSteeredThisTurn: false,
    notes: [],
  };
}

export function resetReviewTurn(state: ReviewState): void {
  state.mutated = false;
  state.steeredThisTurn = false;
  state.notesSteeredThisTurn = false;
  state.notes = [];
}

export function shouldReview(state: ReviewState): boolean {
  return state.mutated && !state.steeredThisTurn;
}

// Notes that arrive after the review fired get one follow-up per turn, so a
// fix that draws new notes cannot keep the run going.
export function pendingReviewSteer(state: ReviewState): string | undefined {
  if (shouldReview(state)) {
    return withNotes(REVIEW_STEER, state.notes);
  }
  if (
    state.steeredThisTurn &&
    !state.notesSteeredThisTurn &&
    state.notes.length > 0
  ) {
    return withNotes(REVIEW_NOTES_STEER, state.notes);
  }
  return undefined;
}

export function markReviewSteered(state: ReviewState): void {
  if (state.steeredThisTurn) {
    state.notesSteeredThisTurn = true;
  }
  state.steeredThisTurn = true;
  state.notes = [];
}

function withNotes(lead: string, notes: readonly string[]): string {
  return [lead, ...notes].join('\n\n');
}

export function registerReviewGuard(
  pi: ExtensionAPI,
  state: ReviewState,
): void {
  pi.on('input', (event) => {
    if (!startsUserTurn(event)) {
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

  pi.events.on(REVIEW_NOTE_EVENT, (payload) => {
    if (isReviewNote(payload)) {
      state.notes.push(payload.text);
    }
  });

  // agent_before_settle runs after retries and compaction recovery, and its
  // continuation stays inside the same run. agent_settled is notification-only:
  // a steer sent there starts a second run after the user already saw the
  // agent stop, and it fires even when the user pressed Escape.
  pi.on('agent_before_settle', (event) => {
    const steer = pendingReviewSteer(state);
    if (steer === undefined || !acceptsSettleSteer(event)) {
      return;
    }
    markReviewSteered(state);
    return withHiddenSteer(event, REVIEW_STEER_TYPE, steer);
  });
}
