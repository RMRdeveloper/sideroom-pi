import assert from 'node:assert/strict';
import test from 'node:test';
import { isReviewNote, REVIEW_NOTE_EVENT } from './review-note.ts';

const REVIEW_NOTE_CHANNEL = 'sideroom:review-note';
const REVIEW_NOTE_TEXT = 'Rename the helper so the caller reads the flow.';

test('answers on the shared review note channel', () => {
  assert.equal(REVIEW_NOTE_EVENT, REVIEW_NOTE_CHANNEL);
});

test('accepts a value that carries review note text', () => {
  assert.equal(isReviewNote({ text: REVIEW_NOTE_TEXT }), true);
  assert.equal(isReviewNote({ text: '', display: false }), true);
});

test('rejects a value that carries no review note text', () => {
  assert.equal(isReviewNote(undefined), false);
  assert.equal(isReviewNote(null), false);
  assert.equal(isReviewNote(REVIEW_NOTE_TEXT), false);
  assert.equal(isReviewNote({}), false);
  assert.equal(isReviewNote({ text: 1 }), false);
});
