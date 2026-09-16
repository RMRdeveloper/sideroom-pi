import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerAsk, { ASK_PROMPT_GUIDELINES } from './index.ts';
import { TOOL_NAME } from './model.ts';

test('registers sideroom_ask as a sequential parent-agent tool', () => {
  const tools: Array<{
    readonly name: string;
    readonly executionMode?: string;
    readonly promptSnippet?: string;
    readonly promptGuidelines?: readonly string[];
    prepareArguments?: (args: unknown) => unknown;
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
  const guidelines = ASK_PROMPT_GUIDELINES.join('\n');
  assert.match(guidelines, /option descriptions in the language/);
  assert.match(guidelines, /language the user is speaking/);
  assert.match(guidelines, /project fact/);
  assert.match(guidelines, /minor decision/);
  assert.match(guidelines, /architectural decision/);
  assert.match(guidelines, /practical consequences/);
  assert.match(guidelines, /one-line justification/);
  assert.equal(guidelines.length <= 1400, true);
});

test('keeps the grill decision classification self-contained', () => {
  const skillPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../skills/sideroom-grill/SKILL.md',
  );
  const skill = readFileSync(skillPath, 'utf8');

  assert.match(
    skill,
    /materially\s+affects architecture, external dependencies/,
  );
  assert.match(
    skill,
    /persistence, public contracts, or future change difficulty/,
  );
});

test('prepares stringified questions before execute sees native arrays', () => {
  const tools: Array<{
    prepareArguments?: (args: unknown) => unknown;
  }> = [];
  registerAsk({
    registerTool: (tool) => {
      tools.push(tool);
    },
  } as Pick<ExtensionAPI, 'registerTool'> as ExtensionAPI);

  const questions = [
    {
      id: 'scope',
      prompt: 'Who should receive the first rollout?',
      options: [
        { value: 'pilot', label: 'Pilot with one team' },
        { value: 'all', label: 'Roll out to every team now' },
      ],
      recommendationIndex: 0,
    },
  ];
  const tool = tools[0];
  assert.ok(tool?.prepareArguments);
  assert.deepEqual(
    tool.prepareArguments({ questions: JSON.stringify(questions) }),
    {
      questions,
    },
  );
});
