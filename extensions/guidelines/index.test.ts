import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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

type EventHandler = (event: never) => unknown;
