import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { researchContextTokens, shouldFinishResearch } from './context.ts';

const userMessage = (text: string): AgentMessage => ({ role: 'user', content: text, timestamp: 1 });

test('does not impose the previous byte limit on larger model windows', () => {
  const messages = [userMessage('x'.repeat(200_000))];
  assert.equal(researchContextTokens(messages), 50_000);
  assert.equal(shouldFinishResearch(messages, 200_000), false);
  assert.equal(shouldFinishResearch(messages, 60_000), true);
});

test('uses the latest provider usage and estimates later messages', () => {
  const usage = { input: 70_000, output: 100, cacheRead: 1_000, cacheWrite: 0, totalTokens: 71_100, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const messages = [userMessage('old content'), { role: 'assistant', content: [], stopReason: 'toolUse', usage } as unknown as AgentMessage, userMessage('x'.repeat(4_000))];
  assert.equal(researchContextTokens(messages), 72_100);
  assert.equal(shouldFinishResearch(messages, 80_000), true);
  assert.equal(shouldFinishResearch(messages, 0), false);
});
