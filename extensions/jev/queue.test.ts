import assert from 'node:assert/strict';
import test from 'node:test';
import { JevReviewQueue } from './queue.ts';

function deferred() {
  let release: () => void = () => { throw new Error('Gate is not ready'); };
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release: () => release() };
}

test('runs one review at a time and retains only the latest queued version', async () => {
  const queue = new JevReviewQueue();
  const gate = deferred();
  const started = deferred();
  const seen: string[] = [];
  queue.enqueue({ key: 'active', run: async () => { started.release(); await gate.promise; } });
  await started.promise;
  queue.enqueue({ key: 'next', run: async () => { seen.push('obsolete'); } });
  queue.enqueue({ key: 'next', run: async () => { seen.push('latest'); } });
  assert.deepEqual(seen, []);
  gate.release();
  await queue.drain();
  assert.deepEqual(seen, ['latest']);
});

test('invalidates snapshots when a source dependency changes', async () => {
  const queue = new JevReviewQueue();
  const gate = deferred();
  const started = deferred();
  let activeSignal: AbortSignal | undefined;
  let queuedRan = false;
  queue.enqueue({ key: 'active', dependencies: ['src/dependency.ts'], run: async (signal) => { activeSignal = signal; started.release(); await gate.promise; } });
  await started.promise;
  queue.enqueue({ key: 'queued', dependencies: ['src/dependency.ts'], run: async () => { queuedRan = true; } });
  queue.invalidate('src/dependency.ts');
  assert.equal(activeSignal?.aborted, true);
  gate.release();
  await queue.drain();
  assert.equal(queuedRan, false);
});

test('a full backlog applies backpressure without losing files and reset cancels outstanding work', async () => {
  const queue = new JevReviewQueue();
  const gate = deferred();
  const started = deferred();
  const seen: number[] = [];
  let cancelled: AbortSignal | undefined;
  queue.enqueue({ key: 'active', run: async (signal) => { cancelled = signal; started.release(); await gate.promise; } });
  await started.promise;
  const producers: (Promise<void> | undefined)[] = [];
  for (let index = 0; index < 40; index += 1) {
    producers.push(queue.enqueue({ key: `file-${index}`, run: async () => { seen.push(index); } }));
  }
  assert.equal(producers[15], undefined);
  assert.ok(producers[16] instanceof Promise);
  gate.release();
  await Promise.all(producers);
  await queue.drain();
  assert.equal(seen.length, 40);
  assert.equal(seen.at(-1), 39);
  const nextGate = deferred();
  const nextStarted = deferred();
  queue.enqueue({ key: 'another', run: async (signal) => { cancelled = signal; nextStarted.release(); await nextGate.promise; } });
  await nextStarted.promise;
  queue.cancel();
  assert.equal(cancelled?.aborted, true);
  nextGate.release();
  await queue.drain();
});

test('forwards run cancellation and surfaces unexpected failures at the boundary', async () => {
  const queue = new JevReviewQueue();
  const controller = new AbortController();
  controller.abort();
  queue.enqueue({ key: 'cancelled', signal: controller.signal, run: async () => { assert.fail('cancelled work must not run'); } });
  await queue.drain();
  queue.enqueue({ key: 'broken', run: async () => { throw new Error('unexpected review error'); } });
  await assert.rejects(queue.drain(), /Jev background review failed/);
  await queue.drain();
});

test('reset also cancels producers waiting for capacity', async () => {
  const queue = new JevReviewQueue();
  const gate = deferred();
  const started = deferred();
  queue.enqueue({ key: 'active', run: async () => { started.release(); await gate.promise; } });
  await started.promise;
  for (let index = 0; index < 16; index += 1) {
    queue.enqueue({ key: `queued-${index}`, run: async () => { assert.fail('reset must cancel queued work'); } });
  }
  const blocked = queue.enqueue({ key: 'blocked', run: async () => { assert.fail('reset must cancel waiting producers'); } });
  assert.ok(blocked instanceof Promise);
  queue.cancel();
  gate.release();
  await blocked;
  await queue.drain();
});
