import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import registerAsk, { ASK_PROMPT_GUIDELINES, executeAsk } from './index.ts';
import {
  type AskParams,
  type AskResult,
  TOOL_NAME,
  UI_UNAVAILABLE,
} from './model.ts';

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

test('registers sideroom_ask as a sequential parent-agent tool', () => {
  const tools: Array<{
    readonly name: string;
    readonly executionMode?: string;
    readonly promptSnippet?: string;
    readonly promptGuidelines?: readonly string[];
  }> = [];
  registerAsk({
    registerTool: (tool) => {
      tools.push(tool);
    },
  } as Pick<ExtensionAPI, 'registerTool'> as ExtensionAPI);

  assert.equal(tools.length, 1);
  assert.equal(tools[0]?.name, TOOL_NAME);
  assert.equal(tools[0]?.executionMode, 'sequential');
  assert.equal(
    tools[0]?.promptSnippet,
    'Ask the user one or more questions with a recommended option.',
  );
  assert.deepEqual(tools[0]?.promptGuidelines, ASK_PROMPT_GUIDELINES);
  for (const guideline of ASK_PROMPT_GUIDELINES) {
    assert.match(guideline, /sideroom_ask/);
  }
});

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
