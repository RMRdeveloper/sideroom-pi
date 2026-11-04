import { readFileSync } from 'node:fs';
import {
  type ExtensionAPI,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { resolveFileToolPath } from '../shared/file-path.ts';
import { isMissingFile } from '../shared/read-file.ts';
import {
  CHECK_OUTCOME,
  type CheckStatus,
  readCheckStatus,
} from '../shared/check-status.ts';
import { isReviewNote, REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import {
  registerSettleGuard,
  SETTLE_PRIORITY,
  startsUserTurn,
  withHiddenSteer,
} from '../shared/settle.ts';

export const REVIEW_STEER_TYPE = 'sideroom-guidelines-review';

export const REVIEW_STEER =
  'Finish any remaining requested implementation before reviewing. Then review the changes this run introduced against the loaded Sideroom language guide: fix only demonstrated violations caused by those changes, keep every requested requirement and the existing behavior, and do not drop required error handling, compatibility or tests to satisfy KISS or YAGNI. Apply rule 20, Decomposition by intent: names and contracts separate orchestration from coherent implementation details, even with one caller. Do not split code just to shorten it, and do not separate tightly coupled steps into shared mutable state, excessive parameters, or functions that must be read together. Do not refactor unrelated code. Reuse the checks that already passed in this user turn after the latest file change, and run only the missing, failed or out-of-date formatter, linter, type checks and tests; any further file change makes earlier checks stale. If the guide is no longer in context, re-read it in full first.';

export const WORKFLOW_REVIEW_STEER =
  'Check the semantic notes below against the visible evidence and against the questionnaire or task contract. Fix only a demonstrated ambiguity or contradiction, and respect the answers the user already gave; ask again only when you cannot continue without clarifying. Missing evidence is not proof that the work is unfinished. Do not create unrelated implementation work. Run project checks only if the code changed.';

export const REVIEW_NOTES_STEER =
  'More semantic notes arrived after the review. Check each one against the loaded Sideroom language guide, fix only demonstrated violations introduced by this run, keep required behavior, and do not refactor unrelated code. Reuse the checks that remain valid, and run only the missing, failed or out-of-date ones after a corrective edit.';

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

function sameAsExistingFile(cwd: string, path: string, content: string): boolean {
  const absolute = resolveFileToolPath(cwd, path);
  if (absolute === undefined) {
    return false;
  }
  try {
    return readFileSync(absolute, 'utf8') === content;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
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

  const identicalWrites = new Set<string>();

  pi.on('tool_call', (event, ctx) => {
    if (
      ctx === undefined ||
      !isToolCallEventType('write', event) ||
      !sameAsExistingFile(ctx.cwd, event.input.path, event.input.content)
    ) {
      return;
    }
    identicalWrites.add(event.toolCallId);
  });

  pi.on('tool_result', (event) => {
    if (event.isError) {
      return;
    }
    if (!isEditToolResult(event) && !isWriteToolResult(event)) {
      return;
    }
    if (identicalWrites.delete(event.toolCallId)) {
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
      return withHiddenSteer({
        event,
        customType: REVIEW_STEER_TYPE,
        content: steer + formatCheckNote(check),
      });
    },
  });
}

export function formatCheckNote(check: CheckStatus | undefined): string {
  if (check?.green === true && check.command !== undefined) {
    return `\n\nThe detected project check \`${check.command}\` passed after the latest successful file mutation in this user turn. Reuse that result if this review changes no files; rerun it after any further mutation.`;
  }
  if (check?.outcome === CHECK_OUTCOME.unknown) {
    return '\n\nThe project check could not be detected, so this review has no pass to reuse. Run the project check yourself if you can tell which command it is.';
  }
  return '';
}
