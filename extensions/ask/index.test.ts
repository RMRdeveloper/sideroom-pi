import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerAsk, { ASK_PROMPT_GUIDELINES } from './index.ts';
import { TOOL_NAME } from './model.ts';

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
    'Ask the user one or more questions with a recommended option, in their language.',
  );
  assert.deepEqual(tools[0]?.promptGuidelines, ASK_PROMPT_GUIDELINES);
  for (const guideline of ASK_PROMPT_GUIDELINES) {
    assert.match(guideline, /sideroom_ask/);
  }
  assert.match(
    ASK_PROMPT_GUIDELINES.join('\n'),
    /language the user is speaking/,
  );
});
