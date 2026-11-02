import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type AgentBeforeSettleEvent,
  type AgentBeforeSettleEventResult,
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { registerDoneGuard } from '../done/guard.ts';
import {
  createDoneState,
  MISSING_TEST_NOTICE_TYPE,
} from '../done/model.ts';
import registerExplain from '../explain/index.ts';
import {
  createReviewState,
  REVIEW_STEER_TYPE,
  registerReviewGuard,
} from '../guidelines/review.ts';
import { PERSONA_STEER_TYPE } from '../persona/catalog.ts';
import {
  createPersonaGuardState,
  registerPersonaGuard,
} from '../persona/guard.ts';
import { REVIEW_NOTE_EVENT } from './review-note.ts';
import {
  registerSettleGuard,
  registerSettleSupplement,
  registerSettleWait,
  SETTLE_PRIORITY,
} from './settle.ts';

type Handler = (event: never, ctx: ExtensionContext) => unknown;
type Stage = 'review' | 'done' | 'explain' | 'persona';

const BEFORE_SETTLE_EVENT = 'agent_before_settle';
const SETTLE_WAIT_CHANNEL = 'sideroom:settle-wait';
const SETTLE_PRIORITY_CHANNEL = 'sideroom:settle-priority';
const SETTLE_SUPPLEMENT_CHANNEL = 'sideroom:settle-supplement';
const SUPPLEMENT_TYPE = 'sideroom-test-supplement';
const SUPPLEMENT_CONTENT = 'Add a test for the changed rule.';
const WAITS_PER_ACCEPTED_BOUNDARY = 2;

const CHECK = {
  executable: 'npm',
  args: ['run', 'check'],
  display: 'npm run check',
};
const EARLIER_ENTRY = {
  type: 'custom_message',
  customType: 'other-extension',
  content: 'context',
  display: false,
} as const;

function harness(order: readonly Stage[], hasTests = false) {
  const bus = createEventBus();
  const handlers = new Map<string, Handler[]>();
  const review = createReviewState();
  const done = createDoneState();
  const persona = createPersonaGuardState();
  let pendingMessages = false;
  const ctx = { cwd: '/work', mode: 'tui', hasPendingMessages: () => pendingMessages } as ExtensionContext;
  const steers: string[] = [];
  const contents: string[] = [];

  for (const stage of order) {
    const pi = {
      on(name: string, handler: Handler) {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
      events: {
        on: (name: string, handler: (payload: unknown) => void) =>
          bus.on(name, handler),
        emit: (name: string, payload: unknown) => bus.emit(name, payload),
      },
      sendMessage() {
        assert.fail('settle steers must use boundary entries');
      },
    } as unknown as ExtensionAPI;
    if (stage === 'review') {
      registerReviewGuard(pi, review);
    }
    if (stage === 'done') {
      registerDoneGuard({
        pi,
        state: done,
        resolveCommand: () => CHECK,
        resolveTestSetup: () => hasTests,
      });
    }
    if (stage === 'persona') {
      registerPersonaGuard(pi, persona, async () => {});
    }
    if (stage === 'explain') {
      registerExplain(pi);
    }
  }
  function emit(name: string, event: unknown): void {
    for (const handler of handlers.get(name) ?? []) {
      handler(event as never, ctx);
    }
  }
  function mutate(path = 'src/app.ts'): void {
    emit('tool_result', {
      toolName: 'write',
      toolCallId: path,
      input: { path },
      isError: false,
    });
  }
  async function settle(overrides: Partial<AgentBeforeSettleEvent> = {}) {
    let event = {
      type: 'agent_before_settle',
      outcome: 'completed',
      continue: false,
      entries: [EARLIER_ENTRY],
      context: { pendingMessages: [] },
      ...overrides,
    } as AgentBeforeSettleEvent;
    for (const handler of handlers.get('agent_before_settle') ?? []) {
      const result = await handler(event as never, ctx) as
        | AgentBeforeSettleEventResult
        | undefined;
      event = {
        ...event,
        entries: result?.entries ?? event.entries,
        continue: result?.continue ?? event.continue,
      };
    }
    assert.deepEqual(event.entries[0], EARLIER_ENTRY);
    const types = event.entries.slice(1).map((entry) => {
      assert.equal(entry.type, 'custom_message');
      if (entry.type === 'custom_message') {
        contents.push(String(entry.content));
      }
      return entry.type === 'custom_message' ? entry.customType : '';
    });
    assert.ok(
      types.filter(
        (type) =>
          type !== PERSONA_STEER_TYPE &&
          type !== MISSING_TEST_NOTICE_TYPE,
      ).length <= 1,
      'at most one necessary stage may steer per boundary',
    );
    steers.push(...types);
    return types;
  }
  function addWait(wait: () => Promise<void>) {
    registerSettleWait({
      events: {
        on: (name: string, handler: (payload: unknown) => void) => bus.on(name, handler),
        emit: (name: string, payload: unknown) => bus.emit(name, payload),
      },
      on(name: string, handler: Handler) {
        handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      },
    } as unknown as ExtensionAPI, wait);
  }
  return { review, done, persona, bus, steers, contents, emit, mutate, settle, addWait, setPendingMessages: (pending: boolean) => { pendingMessages = pending; } };
}

const ORDERS: readonly (readonly Stage[])[] = [
  ['review', 'done', 'explain'],
  ['review', 'explain', 'done'],
  ['done', 'review', 'explain'],
  ['done', 'explain', 'review'],
  ['explain', 'review', 'done'],
  ['explain', 'done', 'review'],
];

for (const order of ORDERS) {
  test(`reviews without a forced check or walkthrough continuation with ${order.join(', ')}`, async () => {
    const run = harness(order);
    for (let index = 0; index < 5; index += 1) {
      run.mutate(`src/file-${index}.ts`);
    }
    assert.deepEqual(await run.settle({ continue: true }), []);
    assert.equal(run.review.steeredThisTurn, false);
    assert.equal(run.done.checksGreen, false);
    assert.deepEqual(await run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(await run.settle(), []);
    run.emit('tool_call', {
      toolName: 'bash',
      toolCallId: 'check',
      input: { command: CHECK.display },
    });
    run.emit('tool_result', {
      toolName: 'bash',
      toolCallId: 'check',
      input: {},
      isError: false,
    });
    assert.deepEqual(await run.settle(), []);
    assert.deepEqual(await run.settle(), []);
    assert.deepEqual(run.steers, [
      REVIEW_STEER_TYPE,
    ]);
  });

  test(`reviews late semantic notes without a walkthrough continuation with ${order.join(', ')}`, async () => {
    const run = harness(order);
    for (let index = 0; index < 5; index += 1) {
      run.mutate(`src/file-${index}.ts`);
    }
    assert.deepEqual(await run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(await run.settle(), []);
    run.mutate();
    run.bus.emit(REVIEW_NOTE_EVENT, { text: 'late semantic finding' });
    assert.deepEqual(await run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(await run.settle(), []);
    assert.deepEqual(await run.settle(), []);
    assert.deepEqual(await run.settle(), []);
  });
}

test('sessions sharing the module keep their priorities isolated on separate Pi buses', async () => {
  const active = harness(['review', 'done', 'explain']);
  const other = harness(['explain']);
  active.mutate();
  for (let index = 0; index < 5; index += 1) {
    other.mutate(`src/file-${index}.ts`);
  }
  assert.deepEqual(await other.settle(), []);
  assert.deepEqual(await active.settle(), [REVIEW_STEER_TYPE]);
});

for (const order of ORDERS) {
  for (const stages of [
    [...order, 'persona'],
    ['persona', ...order],
  ] as const) {
    test(`coalesces review, style and offer with ${stages.join(', ')}`, async () => {
      const run = harness(stages);
      for (let index = 0; index < 5; index += 1) {
        run.mutate(`src/file-${index}.ts`);
      }
      run.emit('message_end', {
        message: {
          role: 'assistant',
          stopReason: 'stop',
          content: [{ type: 'text', text: 'Great question!' }],
        },
      });
      assert.deepEqual(await run.settle({ outcome: 'aborted' }), []);
      assert.deepEqual(
        await run.settle({ context: { pendingMessages: [{}] } } as never),
        [],
      );
      assert.equal(run.persona.steersThisRun, 0);
      assert.deepEqual(
        (await run.settle()).sort(),
        [REVIEW_STEER_TYPE, PERSONA_STEER_TYPE].sort(),
      );
      assert.equal(run.persona.steersThisRun, 1);
      run.emit('tool_call', {
        toolName: 'bash',
        toolCallId: 'check',
        input: { command: CHECK.display },
      });
      run.emit('tool_result', {
        toolName: 'bash',
        toolCallId: 'check',
        input: {},
        isError: false,
      });
      run.emit('message_end', {
        message: {
          role: 'assistant',
          stopReason: 'stop',
          content: [
            { type: 'text', text: 'Updated the files and checks passed.' },
          ],
        },
      });
      assert.deepEqual(await run.settle(), []);
    });
  }
}

for (const order of ORDERS) {
  test(`adds test coverage only to an existing review with ${order.join(', ')}`, async () => {
    const run = harness(order, true);
    run.emit('tool_call', {
      toolName: 'write',
      toolCallId: 'source',
      input: { path: 'src/app.ts' },
    });
    run.emit('tool_result', {
      toolName: 'write',
      toolCallId: 'source',
      input: { path: 'src/app.ts' },
      isError: false,
    });
    assert.deepEqual(await run.settle({ continue: true }), []);
    assert.equal(run.done.noticedMissingTest, false);
    assert.deepEqual(await run.settle(), [
      REVIEW_STEER_TYPE,
      MISSING_TEST_NOTICE_TYPE,
    ]);
    assert.equal(run.done.checksGreen, false);
    run.emit('tool_call', {
      toolName: 'bash',
      toolCallId: 'check',
      input: { command: CHECK.display },
    });
    run.emit('tool_result', {
      toolName: 'bash',
      toolCallId: 'check',
      input: {},
      isError: false,
    });
    assert.deepEqual(await run.settle(), []);
  });
}

test('never requests checks or standalone coverage when review is disabled', async () => {
  const run = harness(['done'], true);
  run.emit('tool_call', {
    toolName: 'write',
    toolCallId: 'source',
    input: { path: 'src/app.ts' },
  });
  run.emit('tool_result', {
    toolName: 'write',
    toolCallId: 'source',
    input: { path: 'src/app.ts' },
    isError: false,
  });
  assert.deepEqual(await run.settle(), []);
  assert.deepEqual(await run.settle(), []);
  assert.equal(run.done.noticedMissingTest, false);
});

for (const order of ORDERS) {
  test(`reuses the latest green check during review with ${order.join(', ')}`, async () => {
    const run = harness(order);
    run.mutate();
    run.emit('tool_call', { toolName: 'bash', toolCallId: 'green', input: { command: CHECK.display } });
    run.emit('tool_result', { toolName: 'bash', toolCallId: 'green', input: {}, isError: false });
    await run.settle();
    assert.match(run.contents.join('\n'), /npm run check.*passed after the latest successful file mutation/);
    assert.match(run.contents.join('\n'), /Reuse that result if this review changes no files/);
    assert.deepEqual(await run.settle(), []);
    run.mutate();
    assert.deepEqual(await run.settle(), []);
  });
}

test('waits for background semantic notes before selecting review even when registered last', async () => {
  const run = harness(['done', 'review', 'explain']);
  let release: () => void = () => { throw new Error('wait gate missing'); };
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let delivered = false;
  run.addWait(async () => {
    await pending;
    if (!delivered) {
      delivered = true;
      run.bus.emit(REVIEW_NOTE_EVENT, { text: 'background finding' });
    }
  });
  const boundary = run.settle();
  assert.deepEqual(run.steers, []);
  release();
  assert.deepEqual(await boundary, [REVIEW_STEER_TYPE]);
  assert.match(run.contents.join('\n'), /background finding/);
  assert.deepEqual(await run.settle(), []);
});

test('postpones review without spending its budget when user input arrives during the background wait', async () => {
  const run = harness(['review', 'done']);
  run.mutate();
  let release: () => void = () => { throw new Error('wait gate missing'); };
  const pending = new Promise<void>((resolve) => { release = resolve; });
  run.addWait(() => pending);
  const boundary = run.settle();
  run.setPendingMessages(true);
  release();
  assert.deepEqual(await boundary, []);
  assert.equal(run.review.steeredThisTurn, false);
  assert.equal(run.done.checksGreen, false);
  run.setPendingMessages(false);
  assert.deepEqual(await run.settle(), [REVIEW_STEER_TYPE]);
});

interface SettleRig {
  readonly pi: ExtensionAPI;
  readonly bus: ReturnType<typeof createEventBus>;
  readonly handlers: Map<string, Handler[]>;
  readonly ctx: ExtensionContext;
}

function createSettleRig(): SettleRig {
  const bus = createEventBus();
  const handlers = new Map<string, Handler[]>();
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    events: {
      on: (name: string, handler: (payload: unknown) => void) => bus.on(name, handler),
      emit: (name: string, payload: unknown) => bus.emit(name, payload),
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: '/work',
    mode: 'tui',
    hasPendingMessages: () => false,
  } as ExtensionContext;
  return { pi, bus, handlers, ctx };
}

async function runBoundary(
  rig: SettleRig,
  overrides: Partial<AgentBeforeSettleEvent> = {},
): Promise<AgentBeforeSettleEventResult | undefined> {
  const event = {
    type: 'agent_before_settle',
    outcome: 'completed',
    continue: false,
    entries: [],
    context: { pendingMessages: [] },
    ...overrides,
  } as AgentBeforeSettleEvent;
  let offeredContinuation: AgentBeforeSettleEventResult | undefined;
  for (const handler of rig.handlers.get(BEFORE_SETTLE_EVENT) ?? []) {
    const stageContinuation = await handler(event as never, rig.ctx) as
      | AgentBeforeSettleEventResult
      | undefined;
    if (stageContinuation !== undefined) {
      offeredContinuation = stageContinuation;
    }
  }
  return offeredContinuation;
}

test('waits only on a boundary that accepts a steer', async () => {
  const rig = createSettleRig();
  let waitCount = 0;
  const observedWaitLists: unknown[][] = [];
  rig.bus.on(SETTLE_WAIT_CHANNEL, (payload) => {
    observedWaitLists.push([...(payload as { waits: unknown[] }).waits]);
  });
  registerSettleWait(rig.pi, async () => {
    waitCount += 1;
  });
  assert.deepEqual([...rig.handlers.keys()], [BEFORE_SETTLE_EVENT]);
  registerSettleGuard(rig.pi, {
    priority: SETTLE_PRIORITY.review,
    pending: () => true,
    handle: () => undefined,
  });
  await runBoundary(rig);
  assert.equal(waitCount, WAITS_PER_ACCEPTED_BOUNDARY);
  await runBoundary(rig, { outcome: 'aborted' });
  await runBoundary(rig, { continue: true });
  await runBoundary(rig, { context: { pendingMessages: [{}] } } as never);
  assert.equal(waitCount, WAITS_PER_ACCEPTED_BOUNDARY);
  assert.deepEqual(observedWaitLists, [[]]);
});

test('adds a guard priority only while the guard is pending', () => {
  const pendingRig = createSettleRig();
  registerSettleGuard(pendingRig.pi, {
    priority: SETTLE_PRIORITY.persona,
    pending: () => true,
    handle: () => undefined,
  });
  const pendingPriorities = new Set<number>();
  pendingRig.bus.emit(SETTLE_PRIORITY_CHANNEL, {
    ctx: pendingRig.ctx,
    priorities: pendingPriorities,
  });
  assert.deepEqual([...pendingPriorities], [SETTLE_PRIORITY.persona]);

  const idleRig = createSettleRig();
  registerSettleGuard(idleRig.pi, {
    priority: SETTLE_PRIORITY.persona,
    pending: () => false,
    handle: () => undefined,
  });
  const idlePriorities = new Set<number>();
  idleRig.bus.emit(SETTLE_PRIORITY_CHANNEL, {
    ctx: idleRig.ctx,
    priorities: idlePriorities,
  });
  assert.deepEqual([...idlePriorities], []);
});

test('collects a prepared supplement from the supplement channel', () => {
  const rig = createSettleRig();
  registerSettleSupplement(rig.pi, () => ({
    customType: SUPPLEMENT_TYPE,
    content: SUPPLEMENT_CONTENT,
  }));
  const messages: unknown[] = [];
  rig.bus.emit(SETTLE_SUPPLEMENT_CHANNEL, { ctx: rig.ctx, messages });
  assert.deepEqual(messages, [
    { customType: SUPPLEMENT_TYPE, content: SUPPLEMENT_CONTENT },
  ]);
});

test('leaves the boundary alone when the guard offers no continuation', async () => {
  const rig = createSettleRig();
  registerSettleGuard(rig.pi, {
    priority: SETTLE_PRIORITY.review,
    pending: () => true,
    handle: () => undefined,
  });
  assert.equal(await runBoundary(rig), undefined);
});

test('returns a declining continuation without adding supplement entries', async () => {
  const rig = createSettleRig();
  const declining: AgentBeforeSettleEventResult = { continue: false };
  registerSettleGuard(rig.pi, {
    priority: SETTLE_PRIORITY.review,
    pending: () => true,
    handle: () => declining,
  });
  registerSettleSupplement(rig.pi, () => ({
    customType: SUPPLEMENT_TYPE,
    content: SUPPLEMENT_CONTENT,
  }));
  assert.deepEqual(await runBoundary(rig), declining);
});
