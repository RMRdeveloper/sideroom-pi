import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitRateOf, parseSessionLines } from './parse.mjs';

test('splits turn openings by whether the board moved before them', () => {
  const facts = parseSessionLines([
    userMessage(),
    assistantCall(1000, 0),
    toolResult('read'),
    toolResult('sideroom_todo', { items: [{ id: 'work' }] }),
    assistantCall(50, 1000),
    userMessage(),
    assistantCall(5000, 1200),
    toolResult('sideroom_todo', { items: [{ id: 'work' }] }),
    userMessage(),
    assistantCall(100, 6000),
  ]);

  assert.equal(facts.calls, 4);
  assert.equal(facts.input, 6150);
  assert.equal(facts.cacheRead, 8200);
  assert.deepEqual(facts.openings.updatedBoard, {
    count: 1,
    totalRecomputed: 5000,
    averageRecomputed: 5000,
  });
  assert.deepEqual(facts.openings.untouchedBoard, {
    count: 2,
    totalRecomputed: 1100,
    averageRecomputed: 550,
  });
});

test('counts torn lines instead of failing the session', () => {
  const facts = parseSessionLines([
    userMessage(),
    '{"type":"message","message":',
    assistantCall(10, 0),
  ]);

  assert.equal(facts.skippedLines, 1);
  assert.equal(facts.calls, 1);
});

test('includes cache writes in recomputed tokens and the hit rate', () => {
  const facts = parseSessionLines([
    userMessage(),
    assistantCall(100, 900, 500),
  ]);

  assert.equal(facts.hitRate, 60);
  assert.deepEqual(facts.openings.untouchedBoard, {
    count: 1,
    totalRecomputed: 600,
    averageRecomputed: 600,
  });
  assert.equal(hitRateOf(0, 0, 0), 0);
  assert.equal(hitRateOf(1000, 0, 0), 0);
  assert.equal(hitRateOf(1000, 1000, 0), 50);
  assert.equal(hitRateOf(0, 1000, 1000), 50);
});

test('ignores failed and unchanged board tool results', () => {
  const boardItems = [{ id: 'work' }];
  const facts = parseSessionLines([
    userMessage(),
    assistantCall(100, 0),
    toolResult('sideroom_todo', { items: [] }),
    userMessage(),
    assistantCall(100, 0),
    toolResult('sideroom_todo', { items: boardItems, error: 'invalid' }),
    userMessage(),
    assistantCall(100, 0),
    toolResult('sideroom_todo', { items: boardItems }),
    userMessage(),
    assistantCall(100, 0),
  ]);

  assert.equal(facts.openings.updatedBoard.count, 0);
  assert.equal(facts.openings.untouchedBoard.count, 4);
});

function userMessage() {
  return line({ message: { role: 'user', content: [] } });
}

function assistantCall(input, cacheRead, cacheWrite = 0) {
  return line({
    message: {
      role: 'assistant',
      content: [],
      usage: { input, cacheRead, cacheWrite, output: 0 },
    },
  });
}

function toolResult(toolName, details) {
  return line({
    message: { role: 'toolResult', toolName, content: [], details },
  });
}

function line(entry) {
  return JSON.stringify({ type: 'message', ...entry });
}
