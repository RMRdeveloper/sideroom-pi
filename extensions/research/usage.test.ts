import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { sumResearchUsage } from './usage.ts';

function assistant(input: number, output: number): AgentMessage {
  return {
    role: 'assistant', api: 'test', provider: 'test', model: 'test', content: [], stopReason: 'stop', timestamp: 1,
    usage: { input, output, cacheRead: 2, cacheWrite: 3, totalTokens: input + output + 5, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } },
  } as AgentMessage;
}

test('sums provider usage from every assistant response', () => {
  const messages = [assistant(10, 5), assistant(20, 8)];
  const usage = sumResearchUsage(messages);
  assert.deepEqual(usage, {
    input: 30, output: 13, cacheRead: 4, cacheWrite: 6, totalTokens: 53,
    cost: { input: 2, output: 4, cacheRead: 6, cacheWrite: 8, total: 20 },
  });
  assert.equal(sumResearchUsage([]), undefined);
});
