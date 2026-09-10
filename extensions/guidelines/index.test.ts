import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { GUIDELINE_SKILL_PATH } from './guard.ts';
import registerGuidelines from './index.ts';
import { GUIDELINES_REMINDER_HEADING } from './prompt.ts';

test('injects the guidelines reminder once per system prompt', () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  assert.ok(beforeAgentStart);

  const first = beforeAgentStart({ systemPrompt: 'base prompt' } as never) as {
    systemPrompt?: string;
  };
  assert.match(first.systemPrompt ?? '', /base prompt/);
  assert.equal(
    (first.systemPrompt ?? '').includes(GUIDELINES_REMINDER_HEADING),
    true,
  );
  assert.match(first.systemPrompt ?? '', /sideroom-guidelines/);

  const second = beforeAgentStart({
    systemPrompt: first.systemPrompt ?? '',
  } as never);
  assert.equal(second, undefined);
});

test('blocks write and edit until the required guides were read successfully', () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(beforeAgentStart);
  assert.ok(toolCall);
  assert.ok(toolResult);

  const typescriptGuidePath = join(
    dirname(GUIDELINE_SKILL_PATH),
    'references/languages/typescript.md',
  );
  const typescriptWrite = {
    toolName: 'write',
    input: { path: 'src/example.ts' },
  } as never;

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  const beforeReads = toolCall(typescriptWrite) as GuardResult;
  assert.equal(beforeReads?.block, true);
  assert.match(beforeReads?.reason ?? '', /SKILL\.md/);
  assert.match(beforeReads?.reason ?? '', /typescript\.md/);

  toolResult({
    toolName: 'read',
    input: { path: GUIDELINE_SKILL_PATH, limit: 1 },
    isError: false,
  } as never);
  toolResult({
    toolName: 'read',
    input: { path: '/tmp/skills/sideroom-guidelines/SKILL.md' },
    isError: false,
  } as never);
  toolResult({
    toolName: 'read',
    input: { path: GUIDELINE_SKILL_PATH },
    isError: true,
  } as never);
  assert.match(
    (toolCall(typescriptWrite) as GuardResult)?.reason ?? '',
    /SKILL\.md/,
  );

  toolResult({
    toolName: 'read',
    input: { path: `@${GUIDELINE_SKILL_PATH}` },
    isError: false,
  } as never);
  const beforeLanguageGuide = toolCall({
    toolName: 'edit',
    input: { path: 'src/example.tsx' },
  } as never) as GuardResult;
  assert.equal(beforeLanguageGuide?.block, true);
  assert.doesNotMatch(beforeLanguageGuide?.reason ?? '', /SKILL\.md/);
  assert.match(beforeLanguageGuide?.reason ?? '', /typescript\.md/);

  toolResult({
    toolName: 'read',
    input: { path: typescriptGuidePath, offset: 2 },
    isError: false,
  } as never);
  assert.match(
    (toolCall(typescriptWrite) as GuardResult)?.reason ?? '',
    /typescript\.md/,
  );

  toolResult({
    toolName: 'read',
    input: { path: typescriptGuidePath },
    isError: false,
  } as never);
  assert.equal(toolCall(typescriptWrite), undefined);

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  assert.equal(
    (
      toolCall({
        toolName: 'write',
        input: { path: 'README.md' },
      } as never) as GuardResult
    )?.block,
    true,
  );
});

type EventHandler = (event: never) => unknown;
type GuardResult = { block?: boolean; reason?: string } | undefined;
