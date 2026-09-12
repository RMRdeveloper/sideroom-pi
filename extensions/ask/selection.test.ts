import assert from 'node:assert/strict';
import test from 'node:test';
import { type AskQuestion, normalizeQuestions } from './model.ts';
import { answerFromSelections, toggleSelection } from './selection.ts';

function multipleQuestion(): AskQuestion {
  const [question] = normalizeQuestions([
    {
      id: 'concerns',
      label: 'Concerns',
      prompt: 'Which concerns should the plan cover?',
      selectionMode: 'multiple',
      options: [
        { value: 'perf', label: 'Performance' },
        { value: 'a11y', label: 'Accessibility' },
        { value: 'i18n', label: 'Internationalization' },
      ],
      recommendedIndices: [0, 1],
    },
  ]);
  assert.ok(question);
  return question;
}

test('toggles option indexes without mutating the input and keeps them sorted', () => {
  const selected = [2];
  assert.deepEqual(toggleSelection(selected, 0), [0, 2]);
  assert.deepEqual(toggleSelection(selected, 2), []);
  assert.deepEqual(selected, [2]);

  const twice = toggleSelection(toggleSelection([], 1), 1);
  assert.deepEqual(twice, []);
});

test('builds a multiple-selection answer that mirrors its first selection', () => {
  const question = multipleQuestion();
  const answer = answerFromSelections(question, [0, 1]);
  assert.deepEqual(answer, {
    id: 'concerns',
    value: 'perf',
    label: 'Performance',
    index: 1,
    wasCustom: false,
    outOfScope: false,
    selections: [
      { value: 'perf', label: 'Performance', index: 1 },
      { value: 'a11y', label: 'Accessibility', index: 2 },
    ],
  });
});

test('fails fast on an empty answer or an unknown option index', () => {
  const question = multipleQuestion();
  assert.throws(
    () => answerFromSelections(question, []),
    /Question 'concerns' needs at least one selection/,
  );
  assert.throws(
    () => answerFromSelections(question, [9]),
    /Unknown option index 9 for question 'concerns'/,
  );
});
