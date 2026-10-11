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
import { createDoneState, DONE_GATE_TYPE } from '../done/model.ts';
import { registerExplainGuard } from '../explain/guard.ts';
import { createExplainState, EXPLAIN_OFFER_TYPE } from '../explain/model.ts';
import {
  createReviewState,
  REVIEW_STEER_TYPE,
  registerReviewGuard,
} from '../guidelines/review.ts';
import { REVIEW_NOTE_EVENT } from './review-note.ts';

type Handler = (event: never, ctx: ExtensionContext) => unknown;
type Stage = 'review' | 'done' | 'explain';

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

function harness(order: readonly Stage[]) {
  const bus = createEventBus();
  const handlers = new Map<string, Handler[]>();
  const review = createReviewState();
  const done = createDoneState();
  const explain = createExplainState();
  const ctx = { cwd: '/work', mode: 'tui' } as ExtensionContext;
  const steers: string[] = [];
  // Each extension receives a distinct API and events wrapper, as in Pi.
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
        resolveTestSetup: () => false,
      });
    }
    if (stage === 'explain') {
      registerExplainGuard(pi, explain);
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
  function settle(overrides: Partial<AgentBeforeSettleEvent> = {}) {
    let event = {
      type: 'agent_before_settle',
      outcome: 'completed',
      continue: false,
      entries: [EARLIER_ENTRY],
      context: { pendingMessages: [] },
      ...overrides,
    } as AgentBeforeSettleEvent;
    for (const handler of handlers.get('agent_before_settle') ?? []) {
      const result = handler(event as never, ctx) as
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
      return entry.type === 'custom_message' ? entry.customType : '';
    });
    assert.ok(types.length <= 1, 'at most one stage may steer per boundary');
    steers.push(...types);
    return types;
  }
  return { review, done, explain, bus, steers, emit, mutate, settle };
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
  test(`reviews, checks and offers in order with ${order.join(', ')}`, () => {
    const run = harness(order);
    for (let index = 0; index < 5; index += 1) {
      run.mutate(`src/file-${index}.ts`);
    }
    assert.deepEqual(run.settle({ continue: true }), []);
    assert.equal(run.review.steeredThisTurn, false);
    assert.equal(run.done.steerCount, 0);
    assert.equal(run.explain.offeredThisTurn, false);
    assert.deepEqual(run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(run.settle(), [DONE_GATE_TYPE]);
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
    assert.deepEqual(run.settle(), [EXPLAIN_OFFER_TYPE]);
    assert.deepEqual(run.settle(), []);
    assert.deepEqual(run.steers, [
      REVIEW_STEER_TYPE,
      DONE_GATE_TYPE,
      EXPLAIN_OFFER_TYPE,
    ]);
  });

  test(`keeps late semantic notes ahead of the offer with ${order.join(', ')}`, () => {
    const run = harness(order);
    for (let index = 0; index < 5; index += 1) {
      run.mutate(`src/file-${index}.ts`);
    }
    assert.deepEqual(run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(run.settle(), [DONE_GATE_TYPE]);
    run.mutate();
    run.bus.emit(REVIEW_NOTE_EVENT, { text: 'late semantic finding' });
    assert.deepEqual(run.settle(), [REVIEW_STEER_TYPE]);
    assert.deepEqual(run.settle(), [DONE_GATE_TYPE]);
    assert.deepEqual(run.settle(), [EXPLAIN_OFFER_TYPE]);
    assert.deepEqual(run.settle(), []);
  });
}

test('sessions sharing the module keep their priorities isolated on separate Pi buses', () => {
  const active = harness(['review', 'done', 'explain']);
  const other = harness(['explain']);
  active.mutate();
  for (let index = 0; index < 5; index += 1) {
    other.mutate(`src/file-${index}.ts`);
  }
  assert.deepEqual(other.settle(), [EXPLAIN_OFFER_TYPE]);
  assert.deepEqual(active.settle(), [REVIEW_STEER_TYPE]);
});
