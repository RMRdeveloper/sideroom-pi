import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerExplain from './index.ts';
import { EXPLAIN_REMINDER } from './prompt.ts';

test('adds a stable invitation policy without registering closing hooks or tools', () => {
  const handlers = new Map<string, (event: never) => unknown>();
  registerExplain({
    on(name: string, handler: (event: never) => unknown) {
      handlers.set(name, handler);
    },
    registerTool() {
      assert.fail('the invitation must not add a tool');
    },
    sendMessage() {
      assert.fail('the invitation must not request a response');
    },
  } as unknown as ExtensionAPI);

  assert.deepEqual([...handlers.keys()], ['before_agent_start']);
  const beforeStart = handlers.get('before_agent_start');
  assert.ok(beforeStart);
  const first = beforeStart({ systemPrompt: 'base' } as never);
  assert.deepEqual(first, { systemPrompt: `base\n\n${EXPLAIN_REMINDER}` });
  assert.deepEqual(beforeStart({ systemPrompt: 'base' } as never), first);
  assert.deepEqual(beforeStart(first as never), first);
});
