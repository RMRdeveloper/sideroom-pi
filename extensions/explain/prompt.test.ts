import assert from 'node:assert/strict';
import test from 'node:test';
import { appendExplainReminder, EXPLAIN_REMINDER } from './prompt.ts';

test('appends once while preserving the existing prompt', () => {
  assert.equal(appendExplainReminder(''), EXPLAIN_REMINDER);
  const prompt = appendExplainReminder('existing instructions');
  assert.equal(prompt, `existing instructions\n\n${EXPLAIN_REMINDER}`);
  assert.equal(appendExplainReminder(prompt), prompt);
});
