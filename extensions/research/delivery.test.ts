import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createResearchDelivery, RESEARCH_RESULT_MESSAGE } from './delivery.ts';

function message(id: string) {
  return { customType: RESEARCH_RESULT_MESSAGE, content: `Report ${id}`, display: true, details: { id } } as const;
}

test('waits for the recorded message before sending the next report', () => {
  const sent: string[] = [];
  const delivery = createResearchDelivery({ sendMessage: (entry) => { sent.push((entry.details as { id: string }).id); } } as Pick<ExtensionAPI, 'sendMessage'>);
  const ctx = { isIdle: () => false };
  delivery.enqueue({ message: message('one'), ctx });
  delivery.enqueue({ message: message('two'), ctx });
  delivery.acknowledge('other');
  assert.deepEqual(sent, ['one']);
  delivery.acknowledge('one');
  assert.deepEqual(sent, ['one', 'two']);
  delivery.acknowledge('two');
  delivery.retry();
  assert.deepEqual(sent, ['one', 'two']);
  delivery.clear();
});

test('retries an unconfirmed delivery after five seconds only when idle', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: string[] = [];
  let idle = false;
  const delivery = createResearchDelivery({ sendMessage: (entry) => { sent.push((entry.details as { id: string }).id); } } as Pick<ExtensionAPI, 'sendMessage'>);
  delivery.enqueue({ message: message('one'), ctx: { isIdle: () => idle } });
  t.mock.timers.tick(5_000);
  assert.deepEqual(sent, ['one']);
  idle = true;
  t.mock.timers.tick(4_999);
  assert.deepEqual(sent, ['one']);
  t.mock.timers.tick(1);
  assert.deepEqual(sent, ['one', 'one']);
  delivery.acknowledge('one');
  t.mock.timers.tick(10_000);
  assert.deepEqual(sent, ['one', 'one']);
});

test('starts a fresh retry interval for the next report', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: string[] = [];
  const delivery = createResearchDelivery({ sendMessage: (entry) => { sent.push((entry.details as { id: string }).id); } } as Pick<ExtensionAPI, 'sendMessage'>);
  const ctx = { isIdle: () => true };
  delivery.enqueue({ message: message('one'), ctx });
  delivery.enqueue({ message: message('two'), ctx });
  t.mock.timers.tick(3_000);
  delivery.acknowledge('one');
  t.mock.timers.tick(2_000);
  assert.deepEqual(sent, ['one', 'two']);
  t.mock.timers.tick(3_000);
  assert.deepEqual(sent, ['one', 'two', 'two']);
  delivery.clear();
});

test('retries a synchronous send error on the next idle interval', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attempts = 0;
  const delivery = createResearchDelivery({ sendMessage: () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error('Unavailable');
    }
  } } as Pick<ExtensionAPI, 'sendMessage'>);
  delivery.enqueue({ message: message('one'), ctx: { isIdle: () => true } });
  assert.equal(attempts, 1);
  t.mock.timers.tick(5_000);
  assert.equal(attempts, 2);
  delivery.acknowledge('one');
  t.mock.timers.tick(5_000);
  assert.equal(attempts, 2);
});

test('clearing a branch prevents retries and drops waiting reports', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent: string[] = [];
  const delivery = createResearchDelivery({ sendMessage: (entry) => { sent.push((entry.details as { id: string }).id); } } as Pick<ExtensionAPI, 'sendMessage'>);
  const ctx = { isIdle: () => true };
  delivery.enqueue({ message: message('one'), ctx });
  delivery.enqueue({ message: message('two'), ctx });
  delivery.clear();
  delivery.acknowledge('one');
  delivery.retry();
  t.mock.timers.tick(10_000);
  assert.deepEqual(sent, ['one']);
  delivery.enqueue({ message: message('new-branch'), ctx });
  assert.deepEqual(sent, ['one', 'new-branch']);
  delivery.clear();
});
