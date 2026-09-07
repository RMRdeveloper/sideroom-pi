import assert from 'node:assert/strict';
import test from 'node:test';

import type { GrillingQuestion } from './grilling.ts';
import {
  CUSTOM_LABEL,
  chooseOption,
  createGrillingState,
  effectiveOptions,
  moveQuestion,
  OUT_OF_SCOPE_ANSWER,
  OUT_OF_SCOPE_LABEL,
  renderGrillingLines,
  setCustom,
  toAnswers,
  toggleOutOfScope,
} from './grilling-ui.ts';

function sampleQuestions(): GrillingQuestion[] {
  return [
    {
      id: 'scope',
      title: 'Decide the rollout scope',
      question:
        'Ship to one team first; a full rollout risks a breaking change.',
      recommendation: 'Pilot with one team to limit blast radius.',
      options: [
        'Pilot with one team to limit blast radius.',
        'Roll out to every team now.',
      ],
      recommendationIndex: 0,
    },
    {
      id: 'store',
      title: 'Choose the session store',
      question:
        'Memory is simple but loses sessions on restart; Redis adds ops work.',
      recommendation: 'Use Redis to survive restarts.',
      options: [
        'Keep in-memory sessions.',
        'Add a database table.',
        'Use Redis to survive restarts.',
      ],
      recommendationIndex: 2,
    },
  ];
}

test('appends the out-of-scope and custom rows to the effective options', () => {
  const [first, second] = sampleQuestions();
  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(effectiveOptions(first), [
    'Pilot with one team to limit blast radius.',
    'Roll out to every team now.',
    OUT_OF_SCOPE_LABEL,
    CUSTOM_LABEL,
  ]);
  assert.equal(effectiveOptions(second).length, 5);
});

test('starts every question on its recommendation without scope flags', () => {
  const questions = sampleQuestions();
  const state = createGrillingState(questions);
  assert.equal(state.active, 0);
  assert.deepEqual(state.selections, [
    { selected: 0, customText: undefined, outOfScope: false },
    { selected: 2, customText: undefined, outOfScope: false },
  ]);
});

test('moves the focus between questions wrapping around both ends', () => {
  const questions = sampleQuestions();
  const state = createGrillingState(questions);
  assert.equal(moveQuestion(state, 1).active, 1);
  assert.equal(moveQuestion(state, 2).active, 0);
  assert.equal(moveQuestion(state, -1).active, 1);
  assert.equal(moveQuestion(moveQuestion(state, 1), 1).active, 0);
  assert.equal(moveQuestion(createGrillingState([]), 1).active, 0);
});

test('chooses an option row and arms out-of-scope on its dedicated row', () => {
  const questions = sampleQuestions();
  const state = createGrillingState(questions);
  const chosen = chooseOption(state, questions, 0, 1);
  assert.equal(chosen.selections[0]?.selected, 1);
  assert.equal(chosen.selections[0]?.outOfScope, false);
  assert.equal(chosen.selections[1]?.selected, 2);

  const scoped = chooseOption(state, questions, 0, 2);
  assert.equal(scoped.selections[0]?.selected, 2);
  assert.equal(scoped.selections[0]?.outOfScope, true);

  const clamped = chooseOption(state, questions, 0, 99);
  assert.equal(clamped.selections[0]?.selected, 3);

  const negative = chooseOption(state, questions, 0, -4);
  assert.equal(negative.selections[0]?.selected, 0);

  assert.equal(chooseOption(state, questions, 7, 0), state);
});

test('toggles out-of-scope while preserving the previous selection', () => {
  const questions = sampleQuestions();
  const state = createGrillingState(questions);
  const on = toggleOutOfScope(state, questions, 0);
  assert.equal(on.selections[0]?.outOfScope, true);
  assert.equal(on.selections[0]?.selected, 0);
  const off = toggleOutOfScope(on, questions, 0);
  assert.equal(off.selections[0]?.outOfScope, false);
  assert.equal(off.selections[0]?.selected, 0);
  assert.equal(toggleOutOfScope(state, questions, 7), state);
});

test('stores a custom answer on the custom row and clears scope flags', () => {
  const questions = sampleQuestions();
  const state = createGrillingState(questions);
  const scoped = toggleOutOfScope(state, questions, 1);
  const custom = setCustom(scoped, questions, 1, 'Signed cookies.');
  assert.equal(custom.selections[1]?.selected, 4);
  assert.equal(custom.selections[1]?.customText, 'Signed cookies.');
  assert.equal(custom.selections[1]?.outOfScope, false);
  assert.equal(setCustom(state, questions, 7, 'Nope.'), state);
});

test('converts state to answers covering scope, custom, and fallbacks', () => {
  const questions = sampleQuestions();
  const initial = createGrillingState(questions);
  assert.deepEqual(toAnswers(initial, questions), [
    { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
    { id: 'store', answer: 'Use Redis to survive restarts.' },
  ]);

  const chosen = chooseOption(initial, questions, 0, 1);
  assert.equal(
    toAnswers(chosen, questions)[0]?.answer,
    'Roll out to every team now.',
  );

  const scoped = toggleOutOfScope(initial, questions, 1);
  assert.equal(toAnswers(scoped, questions)[1]?.answer, OUT_OF_SCOPE_ANSWER);

  const rowScoped = chooseOption(initial, questions, 1, 3);
  assert.equal(toAnswers(rowScoped, questions)[1]?.answer, OUT_OF_SCOPE_ANSWER);

  const custom = setCustom(initial, questions, 1, '  Signed cookies.  ');
  assert.equal(toAnswers(custom, questions)[1]?.answer, 'Signed cookies.');

  const emptyCustom = setCustom(initial, questions, 1, '   ');
  assert.equal(
    toAnswers(emptyCustom, questions)[1]?.answer,
    'Use Redis to survive restarts.',
  );

  assert.deepEqual(toAnswers(createGrillingState([]), questions), [
    { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
    { id: 'store', answer: 'Use Redis to survive restarts.' },
  ]);
});

test('renders an English active-question card with compact status for the rest', () => {
  const questions = sampleQuestions();
  let state = createGrillingState(questions);
  state = setCustom(state, questions, 0, 'Two-team pilot.');
  state = toggleOutOfScope(state, questions, 1);
  const lines = renderGrillingLines(state, questions, 2).join('\n');

  assert.match(lines, /Round 2/);
  assert.match(lines, /Question 1 of 2/);
  assert.match(lines, /Decide the rollout scope/);
  assert.match(lines, /Ship to one team first/);
  assert.match(lines, /→ "Two-team pilot\."/);
  assert.match(
    lines,
    /Questions\n {2}● Q1 — Decide the rollout scope\n {2}○ Q2 — Choose the session store \[out of scope\]/,
  );
  assert.doesNotMatch(
    lines,
    /○ Q2 — Choose the session store \[out of scope\][\s\S]*Memory is simple/,
  );
  assert.match(lines, /1\. Pilot with one team/);
  assert.match(lines, /2\. Roll out to every team now/);
  assert.match(lines, /Out of scope/);
  assert.match(lines, /Write a custom answer/);
  assert.match(
    lines,
    /\[↑↓\] question \[←→\/1-3\] option \[o\] toggle out of scope \[Enter\] edit custom answer\/confirm \[Esc\] cancel and use sequential questions/,
  );
});

test('renders an English default header when no round is given', () => {
  const questions = sampleQuestions().slice(0, 1);
  const lines = renderGrillingLines(createGrillingState(questions), questions);
  assert.match(lines[0] ?? '', /answer every question/);
});
