import {
  type ExtensionAPI,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { readCheckStatus } from '../shared/check-status.ts';
import { isReviewNote, REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import {
  registerSettleGuard,
  SETTLE_PRIORITY,
  startsUserTurn,
  withHiddenSteer,
} from '../shared/settle.ts';

export const REVIEW_STEER_TYPE = 'sideroom-guidelines-review';

export const REVIEW_STEER =
  'Finish any remaining requested implementation before reviewing. Review the changes this run introduced against the loaded Sideroom language guide: fix only demonstrated violations caused by those changes, preserving all requested requirements and existing behavior. KISS and YAGNI do not justify removing required error handling, compatibility, or tests. Include rule 20, Decomposition by intent: names and contracts should separate orchestration from coherent implementation details, even with one caller. Do not split solely for line count or separate tightly coupled steps into shared mutable state, excessive parameters, or functions that must be read together. Do not refactor unrelated code. Reuse relevant checks that already passed in this user turn after the latest file mutation. Run only missing, failed, or stale formatter, linter, type checks, and tests; any further file mutation makes earlier checks stale. If the guide is no longer in context, re-read it in full first.';

export const WORKFLOW_REVIEW_STEER =
  'Verify the semantic notes below against the visible evidence and the questionnaire or task contract. Correct only demonstrated ambiguity or contradictions; respect user answers and ask again only when clarification is necessary. Missing evidence is not proof of unfinished work. Do not create unrelated implementation work. Run project checks only if code changes.';

export const REVIEW_NOTES_STEER =
  'Additional semantic notes arrived after the review. Verify each against the loaded Sideroom language guide, fix only demonstrated violations introduced by this run without removing required behavior or refactoring unrelated code, reuse checks that remain valid, and run only missing, failed, or stale checks after any corrective edit.';

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

  registerSettleGuard(pi, {
    priority: SETTLE_PRIORITY.review,
    pending: () => pendingReviewSteer(state) !== undefined,
    handle: (event, ctx) => {
      const steer = pendingReviewSteer(state);
      if (steer === undefined) {
        return;
      }
      markReviewSteered(state);
      const check = readCheckStatus(pi, ctx);
      const checkNote = check?.green
        ? `\n\nThe detected project check \`${check.command}\` passed after the latest successful file mutation in this user turn. Reuse that result if this review changes no files; rerun it after any further mutation.`
        : '';
      return withHiddenSteer({
        event,
        customType: REVIEW_STEER_TYPE,
        content: steer + checkNote,
      });
    },
  });
}
