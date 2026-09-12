import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type AskParams,
  CUSTOM_LABEL,
  CUSTOM_VALUE,
  formatAnswerLines,
  normalizeQuestions,
  OUT_OF_SCOPE_LABEL,
  parseAskParams,
  prepareAskArguments,
  renderOptions,
} from './model.ts';

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MAX_TAB_LABEL_LENGTH = 16;
const MAX_OPTION_LABEL_LENGTH = 60;

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

test('accepts input at every questionnaire batch limit', () => {
  const parsedBoundary = parseAskParams({
    questions: Array.from({ length: MAX_QUESTIONS }, (_, questionIndex) => ({
      id: `question-${String(questionIndex + 1)}`,
      label: 'L'.repeat(MAX_TAB_LABEL_LENGTH),
      prompt: 'Choose an option',
      options: Array.from({ length: MAX_OPTIONS }, (_, optionIndex) => ({
        value: `option-${String(optionIndex + 1)}`,
        label: 'O'.repeat(MAX_OPTION_LABEL_LENGTH),
      })),
      recommendationIndex: MAX_OPTIONS - 1,
    })),
  });
  assert.equal(parsedBoundary.ok, true);
});

test('rejects each exceeded questionnaire batch limit explicitly', () => {
  const [sampleQuestion] = sampleParams().questions;
  assert.ok(sampleQuestion);
  const oversizedInputs: ReadonlyArray<{
    readonly input: unknown;
    readonly expectedMessage: string;
  }> = [
    {
      input: {
        questions: Array.from({ length: MAX_QUESTIONS + 1 }, (_, index) => ({
          ...sampleQuestion,
          id: `question-${String(index + 1)}`,
        })),
      },
      expectedMessage:
        'Error: A questionnaire batch may include at most 4 questions',
    },
    {
      input: {
        questions: [
          {
            ...sampleQuestion,
            options: [
              ...sampleQuestion.options,
              ...Array.from(
                { length: MAX_OPTIONS - sampleQuestion.options.length + 1 },
                (_, index) => ({
                  value: `extra-${String(index + 1)}`,
                  label: `Extra ${String(index + 1)}`,
                }),
              ),
            ],
          },
        ],
      },
      expectedMessage: "Error: Question 'scope' may include at most 4 options",
    },
    {
      input: {
        questions: [
          {
            ...sampleQuestion,
            label: 'L'.repeat(MAX_TAB_LABEL_LENGTH + 1),
          },
        ],
      },
      expectedMessage:
        "Error: Question 'scope' label may contain at most 16 characters",
    },
    {
      input: {
        questions: [
          {
            ...sampleQuestion,
            options: [
              {
                ...sampleQuestion.options[0],
                label: 'O'.repeat(MAX_OPTION_LABEL_LENGTH + 1),
              },
              sampleQuestion.options[1],
            ],
          },
        ],
      },
      expectedMessage:
        "Error: Option 1 for question 'scope' may contain at most 60 characters",
    },
  ];

  for (const { input, expectedMessage } of oversizedInputs) {
    const parsedInput = parseAskParams(input);
    assert.equal(parsedInput.ok, false);
    if (!parsedInput.ok) {
      assert.equal(parsedInput.message, expectedMessage);
    }
  }
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

test('decodes JSON-string questions and options then applies the strict schema', () => {
  const native = sampleParams();
  const fromQuestions = parseAskParams({
    questions: JSON.stringify(native.questions),
  });
  assert.equal(fromQuestions.ok, true);
  if (!fromQuestions.ok) {
    return;
  }
  assert.deepEqual(
    fromQuestions.questions,
    normalizeQuestions(native.questions),
  );

  const [first] = native.questions;
  assert.ok(first);
  const fromOptions = parseAskParams({
    questions: [{ ...first, options: JSON.stringify(first.options) }],
  });
  assert.equal(fromOptions.ok, true);
  if (!fromOptions.ok) {
    return;
  }
  assert.deepEqual(fromOptions.questions[0]?.options, first.options);

  assert.equal(prepareAskArguments(native), native);
  assert.deepEqual(
    prepareAskArguments({ questions: JSON.stringify(native.questions) }),
    native,
  );
});

test('still rejects invalid JSON strings and decoded values that fail the schema', () => {
  const [first] = sampleParams().questions;
  assert.ok(first);
  const cases: unknown[] = [
    { questions: '[{' },
    { questions: '{}' },
    { questions: JSON.stringify([{ id: 'scope' }]) },
    {
      questions: [
        {
          ...first,
          options: JSON.stringify([{ value: 'only', label: 'Only' }]),
        },
      ],
    },
    { questions: JSON.stringify([]) },
  ];

  for (const params of cases) {
    const parsed = parseAskParams(params);
    assert.equal(parsed.ok, false);
  }
});

test('parses a multiple-selection question and marks every recommendation', () => {
  const parsed = parseAskParams({
    questions: [
      {
        id: 'concerns',
        label: 'Concerns',
        prompt: 'Which concerns should the plan cover?',
        selectionMode: 'multiple',
        options: [
          { value: 'perf', label: 'Performance' },
          { value: 'a11y', label: 'Accessibility' },
        ],
        recommendedIndices: [1],
      },
    ],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  const [question] = parsed.questions;
  assert.ok(question);
  assert.equal(question.selectionMode, 'multiple');
  assert.deepEqual(question.recommendedIndices, [1]);
  assert.equal(renderOptions(question)[0]?.isRecommended, false);
  assert.equal(renderOptions(question)[1]?.isRecommended, true);
});

test('rejects a recommendation field that does not match the selection mode', () => {
  const singleOptions = [
    { value: 'pilot', label: 'Pilot with one team' },
    { value: 'all', label: 'Roll out to every team now' },
  ];
  const cases: ReadonlyArray<{
    readonly question: Record<string, unknown>;
    readonly expectedMessage: string;
  }> = [
    {
      question: {
        id: 'scope',
        prompt: 'Who should receive the first rollout?',
        options: singleOptions,
      },
      expectedMessage: "Error: Question 'scope' requires recommendationIndex",
    },
    {
      question: {
        id: 'scope',
        prompt: 'Who should receive the first rollout?',
        options: singleOptions,
        recommendationIndex: 0,
        recommendedIndices: [0],
      },
      expectedMessage:
        "Error: Question 'scope' is a single-selection question; remove recommendedIndices",
    },
    {
      question: {
        id: 'concerns',
        prompt: 'Which concerns should the plan cover?',
        selectionMode: 'multiple',
        options: singleOptions,
      },
      expectedMessage:
        "Error: Question 'concerns' is a multiple-selection question and requires recommendedIndices",
    },
    {
      question: {
        id: 'concerns',
        prompt: 'Which concerns should the plan cover?',
        selectionMode: 'multiple',
        options: singleOptions,
        recommendationIndex: 0,
        recommendedIndices: [0],
      },
      expectedMessage:
        "Error: Question 'concerns' is a multiple-selection question; remove recommendationIndex",
    },
    {
      question: {
        id: 'concerns',
        prompt: 'Which concerns should the plan cover?',
        selectionMode: 'multiple',
        options: singleOptions,
        recommendedIndices: [3],
      },
      expectedMessage:
        "Error: recommendedIndices 3 is out of range for question 'concerns'",
    },
  ];

  for (const { question, expectedMessage } of cases) {
    const parsed = parseAskParams({ questions: [question] });
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.equal(parsed.message, expectedMessage);
    }
  }
});

test('rejects an empty recommendedIndices list with a specific message', () => {
  const parsed = parseAskParams({
    questions: [
      {
        id: 'concerns',
        prompt: 'Which concerns should the plan cover?',
        selectionMode: 'multiple',
        options: [
          { value: 'perf', label: 'Performance' },
          { value: 'a11y', label: 'Accessibility' },
        ],
        recommendedIndices: [],
      },
    ],
  });
  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    assert.equal(
      parsed.message,
      "Error: Question 'concerns' must mark at least one recommended option",
    );
  }
});

test('formats every selection of a multiple-selection answer', () => {
  const questions = normalizeQuestions([
    {
      id: 'concerns',
      label: 'Concerns',
      prompt: 'Which concerns should the plan cover?',
      selectionMode: 'multiple',
      options: [
        { value: 'perf', label: 'Performance' },
        { value: 'a11y', label: 'Accessibility' },
      ],
      recommendedIndices: [0, 1],
    },
  ]);
  const lines = formatAnswerLines(questions, [
    {
      id: 'concerns',
      value: 'perf',
      label: 'Performance',
      wasCustom: false,
      outOfScope: false,
      index: 1,
      selections: [
        { value: 'perf', label: 'Performance', index: 1 },
        { value: 'a11y', label: 'Accessibility', index: 2 },
      ],
    },
  ]);
  assert.deepEqual(lines, [
    'Concerns: user selected: 1. Performance, 2. Accessibility',
  ]);
});
