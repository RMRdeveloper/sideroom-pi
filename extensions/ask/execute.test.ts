import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { executeAsk } from './execute.ts';
import { type AskParams, type AskResult, UI_UNAVAILABLE } from './model.ts';

const sampleParams: AskParams = {
  questions: [
    {
      id: 'scope',
      label: 'Scope',
      prompt: 'Who should receive the first rollout?',
      options: [
        { value: 'pilot', label: 'Pilot with one team' },
        { value: 'all', label: 'Roll out to every team now' },
      ],
      recommendationIndex: 0,
    },
  ],
};

function context(
  mode: ExtensionContext['mode'],
  result?: AskResult,
): Pick<ExtensionContext, 'mode' | 'ui'> {
  return {
    mode,
    ui: {
      custom: (async () => {
        if (result === undefined) {
          throw new Error('custom UI should not run');
        }
        return result;
      }) as ExtensionContext['ui']['custom'],
    } as ExtensionContext['ui'],
  };
}

test('fails closed outside the TUI instead of auto-accepting the recommendation', async () => {
  const result = await executeAsk(sampleParams, context('print'));
  assert.equal(result.details.cancelled, true);
  assert.equal(result.content[0]?.text, UI_UNAVAILABLE);
});

test('rejects a recommendationIndex past the option list before opening the UI', async () => {
  const result = await executeAsk(
    {
      questions: [
        {
          id: 'scope',
          prompt: 'Who should receive the first rollout?',
          options: [
            { value: 'pilot', label: 'Pilot with one team' },
            { value: 'all', label: 'Roll out to every team now' },
          ],
          recommendationIndex: 9,
        },
      ],
    },
    context('tui'),
  );
  assert.equal(result.details.cancelled, true);
  assert.match(result.content[0]?.text ?? '', /recommendationIndex 9/);
});

test('returns cancelled details when the user dismisses the questionnaire', async () => {
  const result = await executeAsk(
    sampleParams,
    context('tui', { questions: [], answers: [], cancelled: true }),
  );
  assert.equal(result.details.cancelled, true);
  assert.equal(result.content[0]?.text, 'User cancelled the questionnaire');
});

test('returns formatted answers from one completed batch', async () => {
  const captured: AskResult = {
    questions: [],
    answers: [
      {
        id: 'scope',
        value: 'pilot',
        label: 'Pilot with one team',
        wasCustom: false,
        outOfScope: false,
        index: 1,
      },
    ],
    cancelled: false,
  };
  const result = await executeAsk(sampleParams, context('tui', captured));
  assert.equal(result.details.cancelled, false);
  assert.equal(
    result.content[0]?.text,
    'Scope: user selected: 1. Pilot with one team',
  );
});
