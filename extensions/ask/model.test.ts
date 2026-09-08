import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  type AskParams,
  CUSTOM_LABEL,
  CUSTOM_VALUE,
  formatAnswerLines,
  normalizeQuestions,
  OUT_OF_SCOPE_LABEL,
  parseAskParams,
  renderOptions,
} from './model.ts';

function sampleParams(): AskParams {
  return {
    questions: [
      {
        id: 'scope',
        label: 'Scope',
        prompt: 'Who should receive the first rollout?',
        options: [
          {
            value: 'pilot',
            label: 'Pilot with one team',
            description: 'Limits blast radius',
          },
          { value: 'all', label: 'Roll out to every team now' },
        ],
        recommendationIndex: 0,
      },
      {
        id: 'store',
        prompt: 'Where should sessions live?',
        options: [
          { value: 'memory', label: 'Keep in-memory sessions' },
          { value: 'db', label: 'Add a database table' },
          { value: 'redis', label: 'Use Redis to survive restarts' },
        ],
        recommendationIndex: 2,
      },
    ],
  };
}

test('keeps the unwired guidelines template as a seed', () => {
  const file = fileURLToPath(
    new URL('../../assets/artifacts/GUIDELINES_TEMPLATE.md', import.meta.url),
  );
  const text = readFileSync(file, 'utf8');
  assert.match(text, /# Guidelines Template/);
  assert.match(text, /Use braces around every `if` body/);
});

test('rejects an empty batch, duplicate ids, short option lists, and a bad recommendationIndex', () => {
  const empty = parseAskParams({ questions: [] });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.message, 'Error: No questions provided');
  }

  const [first] = sampleParams().questions;
  assert.ok(first);
  const duplicate = parseAskParams({
    questions: [first, { ...first, prompt: 'Again' }],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) {
    assert.match(duplicate.message, /Duplicate question id: scope/);
  }

  const short = parseAskParams({
    questions: [
      {
        ...first,
        options: [first.options[0] ?? { value: 'only', label: 'Only' }],
      },
    ],
  });
  assert.equal(short.ok, false);
  if (!short.ok) {
    assert.match(short.message, /at least two options/);
  }

  const outOfRange = parseAskParams({
    questions: [{ ...first, recommendationIndex: 2 }],
  });
  assert.equal(outOfRange.ok, false);
  if (!outOfRange.ok) {
    assert.match(outOfRange.message, /recommendationIndex 2 is out of range/);
  }

  const parsed = parseAskParams(sampleParams());
  assert.equal(parsed.ok, true);
});

test('keeps the recommended option label intact and always appends Out of scope and a custom answer', () => {
  const parsed = parseAskParams(sampleParams());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const [scope, store] = parsed.questions;
  assert.ok(scope);
  assert.ok(store);
  assert.deepEqual(
    renderOptions(scope).map((option) => ({
      value: option.value,
      label: option.label,
      isRecommended: option.isRecommended === true,
      isOutOfScope: option.isOutOfScope === true,
      isOther: option.isOther === true,
    })),
    [
      {
        value: 'pilot',
        label: 'Pilot with one team',
        isRecommended: true,
        isOutOfScope: false,
        isOther: false,
      },
      {
        value: 'all',
        label: 'Roll out to every team now',
        isRecommended: false,
        isOutOfScope: false,
        isOther: false,
      },
      {
        value: OUT_OF_SCOPE_LABEL,
        label: OUT_OF_SCOPE_LABEL,
        isRecommended: false,
        isOutOfScope: true,
        isOther: false,
      },
      {
        value: CUSTOM_VALUE,
        label: CUSTOM_LABEL,
        isRecommended: false,
        isOutOfScope: false,
        isOther: true,
      },
    ],
  );
  assert.equal(store.label, 'Q2');
  assert.equal(renderOptions(store)[2]?.isRecommended, true);
});

test('formats selected, recommended, custom, and out-of-scope answers for the model', () => {
  const questions = normalizeQuestions(sampleParams().questions);
  const lines = formatAnswerLines(questions, [
    {
      id: 'scope',
      value: 'pilot',
      label: 'Pilot with one team',
      wasCustom: false,
      outOfScope: false,
      index: 1,
    },
    {
      id: 'store',
      value: 'ship next week',
      label: 'ship next week',
      wasCustom: true,
      outOfScope: false,
      index: 5,
    },
  ]);
  assert.deepEqual(lines, [
    'Scope: user selected: 1. Pilot with one team',
    'Q2: user wrote: ship next week',
  ]);
  assert.equal(
    formatAnswerLines(questions, [
      {
        id: 'scope',
        value: OUT_OF_SCOPE_LABEL,
        label: OUT_OF_SCOPE_LABEL,
        wasCustom: false,
        outOfScope: true,
        index: 3,
      },
    ])[0],
    'Scope: Out of scope',
  );
});
