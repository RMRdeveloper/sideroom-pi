import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { isReviewNote, REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import {
  registerSettleGuard,
  SETTLE_PRIORITY,
  startsUserTurn,
  withHiddenSteer,
} from '../shared/settle.ts';

export const REVIEW_STEER_TYPE = 'sideroom-guidelines-review';

export const REVIEW_STEER =
  'Finish any remaining requested implementation before reviewing. Review the changes this run introduced against the loaded Sideroom language guide: fix only demonstrated violations caused by those changes, preserving all requested requirements and existing behavior. KISS and YAGNI do not justify removing required error handling, compatibility, or tests. Do not refactor unrelated code. Then run the relevant formatter, linter, type checks, and tests. If the guide is no longer in context, re-read it in full first.';

export const WORKFLOW_REVIEW_STEER =
  'Verify the semantic notes below against the visible evidence and the questionnaire or task contract. Correct only demonstrated ambiguity or contradictions; respect user answers and ask again only when clarification is necessary. Missing evidence is not proof of unfinished work. Do not create unrelated implementation work. Run project checks only if code changes.';

export const REVIEW_NOTES_STEER =
  'Additional semantic notes arrived after the review. Verify each against the loaded Sideroom language guide, fix only demonstrated violations introduced by this run without removing required behavior or refactoring unrelated code, then rerun the relevant checks.';

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
  return (state.mutated || state.notes.length > 0) && !state.steeredThisTurn;
}

// Notes that arrive after the review fired get one follow-up per turn, so a
// fix that draws new notes cannot keep the run going.
export function pendingReviewSteer(state: ReviewState): string | undefined {
  if (shouldReview(state)) {
    return withNotes(
      state.mutated ? REVIEW_STEER : WORKFLOW_REVIEW_STEER,
      state.notes,
    );
  }
  if (
    state.steeredThisTurn &&
    !state.notesSteeredThisTurn &&
    state.notes.length > 0
  ) {
    return withNotes(
      state.mutated ? REVIEW_NOTES_STEER : WORKFLOW_REVIEW_STEER,
      state.notes,
    );
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
  registerSettleGuard(pi, {
    priority: SETTLE_PRIORITY.review,
    pending: () => pendingReviewSteer(state) !== undefined,
    handle: (event) => {
      const steer = pendingReviewSteer(state);
      if (steer === undefined) {
        return;
      }
      markReviewSteered(state);
      return withHiddenSteer({
        event,
        customType: REVIEW_STEER_TYPE,
        content: steer,
      });
    },
  });
}
