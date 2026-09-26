export const REVIEW_NOTE_EVENT = 'sideroom:review-note';

export interface ReviewNote {
  readonly text: string;
}

export function isReviewNote(value: unknown): value is ReviewNote {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof value.text === 'string'
  );
}
