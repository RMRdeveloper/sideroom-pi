import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AgentBeforeSettleEventResult,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import { REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import registerGuidelines from './index.ts';
import {
  createReviewState,
  markReviewSteered,
  pendingReviewSteer,
  REVIEW_NOTES_STEER,
  REVIEW_STEER,
  REVIEW_STEER_TYPE,
  resetReviewTurn,
  shouldReview,
} from './review.ts';

type EventHandler = (event: never, ctx?: never) => unknown;
type BusHandler = (data: unknown) => void;

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly bus: Map<string, BusHandler[]>;
  readonly steers: AgentBeforeSettleEventResult[];
}

interface SettleOptions {
  readonly outcome?: string;
  readonly entries?: readonly unknown[];
  readonly pendingRoles?: readonly string[];
}

const EARLIER_ENTRY = {
  type: 'custom_message',
  customType: 'other-extension',
  content: 'earlier',
  display: false,
};

function register(): Harness {
  const handlers = new Map<string, EventHandler>();
  const bus = new Map<string, BusHandler[]>();
  const api = {
    events: {
      on(channel: string, handler: BusHandler) {
        bus.set(channel, [...(bus.get(channel) ?? []), handler]);
      },
    },
    on(name: string, handler: EventHandler) {
      const existing = handlers.get(name);
      if (existing === undefined) {
        handlers.set(name, handler);
        return;
      }
      // Pi chains handlers; tests compose them the same way so one
      // registration can cover both the read gate and the review guard.
      handlers.set(name, ((event: never, ctx: never) => {
        existing(event, ctx);
        return handler(event, ctx);
      }) as EventHandler);
    },
    getActiveTools: () => ['read', 'edit', 'write'],
  } as unknown as ExtensionAPI;
  registerGuidelines(api);
  return { handlers, bus, steers: [] };
}

function emitNote(harness: Harness, payload: unknown): void {
  for (const handler of harness.bus.get(REVIEW_NOTE_EVENT) ?? []) {
    handler(payload);
  }
}

function steerText(harness: Harness, index: number): string {
  const entries = harness.steers[index]?.entries ?? [];
  const last = entries.at(-1) as { readonly content?: string } | undefined;
  return last?.content ?? '';
}

function handlerOf(harness: Harness, name: string): EventHandler {
  const handler = harness.handlers.get(name);
  assert.ok(handler, name);
  return handler;
}

function mutate(harness: Harness, isError = false): void {
  handlerOf(harness, 'tool_result')(
    {
      toolName: 'write',
      toolCallId: 't1',
      input: { path: 'src/example.ts' },
      isError,
    } as never,
    { cwd: process.cwd() } as never,
  );
}

function settle(harness: Harness, options: SettleOptions = {}): void {
  const steer = handlerOf(harness, 'agent_before_settle')(
    {
      type: 'agent_before_settle',
      outcome: options.outcome ?? 'completed',
      entries: options.entries ?? [],
      continue: false,
      context: {
        pendingMessages: (options.pendingRoles ?? []).map((role) => ({
          role,
        })),
      },
    } as never,
    {} as never,
  );
  if (steer !== undefined) {
    harness.steers.push(steer as AgentBeforeSettleEventResult);
  }
}

function input(
  harness: Harness,
  source: string,
  streamingBehavior?: string,
): void {
  handlerOf(harness, 'input')({ source, streamingBehavior } as never);
}

test('appends one hidden review and continues after a mutation settles', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  assert.deepEqual(harness.steers, [
    {
      entries: [
        {
          type: 'custom_message',
          customType: REVIEW_STEER_TYPE,
          content: REVIEW_STEER,
          display: false,
        },
      ],
      continue: true,
    },
  ]);
});

test('keeps the entries earlier handlers proposed', () => {
  const harness = register();
  mutate(harness);
  settle(harness, { entries: [EARLIER_ENTRY] });

  assert.equal(harness.steers[0]?.entries?.length, 2);
  assert.deepEqual(harness.steers[0]?.entries?.[0], EARLIER_ENTRY);
});

test('stays silent without a mutation', () => {
  const harness = register();
  settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('ignores a failed mutation', () => {
  const harness = register();
  mutate(harness, true);
  settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('stays silent when the user aborted or the run errored', () => {
  const harness = register();
  mutate(harness);
  settle(harness, { outcome: 'aborted' });
  settle(harness, { outcome: 'error' });
  assert.deepEqual(harness.steers, []);
});

test('yields to a pending user message', () => {
  const harness = register();
  mutate(harness);
  settle(harness, { pendingRoles: ['user'] });
  assert.deepEqual(harness.steers, []);

  settle(harness, { pendingRoles: ['custom'] });
  assert.equal(harness.steers.length, 1);
});

test('steers at most once per turn and not again on its own continuation', () => {
  const harness = register();
  mutate(harness);
  settle(harness);
  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('does not re-arm on a message typed while the run is active', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  input(harness, 'interactive', 'steer');
  mutate(harness);
  settle(harness);
  input(harness, 'interactive', 'followUp');
  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('re-arms after an idle user prompt and a new mutation', () => {
  const harness = register();
  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);

  input(harness, 'interactive');
  settle(harness);
  assert.equal(harness.steers.length, 1);

  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 2);
});

test('does not re-arm on extension-sourced input', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  input(harness, 'extension');
  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('clears review state when a session starts', () => {
  const harness = register();
  mutate(harness);
  handlerOf(harness, 'session_start')({} as never);
  settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('keeps review state independent of the read-gate reset', () => {
  const harness = register();
  mutate(harness);
  // before_agent_start resets read state only; the review flag must survive
  // so a steer-triggered continuation cannot loop.
  handlerOf(harness, 'before_agent_start')({ systemPrompt: 'base' } as never);
  settle(harness);
  assert.equal(harness.steers.length, 1);
  settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('carries semantic notes gathered before the review', () => {
  const harness = register();
  mutate(harness);
  emitNote(harness, { text: 'Jev flagged src/example.ts' });
  settle(harness);

  assert.equal(
    steerText(harness, 0),
    `${REVIEW_STEER}\n\nJev flagged src/example.ts`,
  );
});

test('follows up once on notes that arrive after the review fired', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  mutate(harness);
  emitNote(harness, { text: 'first late note' });
  settle(harness);
  assert.equal(
    steerText(harness, 1),
    `${REVIEW_NOTES_STEER}\n\nfirst late note`,
  );

  mutate(harness);
  emitNote(harness, { text: 'second late note' });
  settle(harness);
  assert.equal(harness.steers.length, 2);
});

test('keeps late notes when the follow-up had to yield', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  emitNote(harness, { text: 'late note' });
  settle(harness, { pendingRoles: ['user'] });
  settle(harness);
  assert.equal(harness.steers.length, 2);
  assert.match(steerText(harness, 1), /late note/);
});

test('ignores a malformed note', () => {
  const harness = register();
  mutate(harness);
  emitNote(harness, { note: 'wrong shape' });
  emitNote(harness, 'plain string');
  settle(harness);
  assert.equal(steerText(harness, 0), REVIEW_STEER);
});

test('drops notes from the previous turn on an idle user prompt', () => {
  const harness = register();
  mutate(harness);
  settle(harness);
  emitNote(harness, { text: 'stale note' });

  input(harness, 'interactive');
  mutate(harness);
  settle(harness);
  assert.equal(steerText(harness, 1), REVIEW_STEER);
});

test('a note alone does not start a review', () => {
  const state = createReviewState();
  state.notes.push('orphan note');
  assert.equal(pendingReviewSteer(state), undefined);

  state.mutated = true;
  assert.match(pendingReviewSteer(state) ?? '', /orphan note/);
  markReviewSteered(state);
  assert.deepEqual(state.notes, []);
  assert.equal(pendingReviewSteer(state), undefined);
});

test('shouldReview requires a mutation and an unarmed flag', () => {
  const state = createReviewState();
  assert.equal(shouldReview(state), false);

  state.mutated = true;
  assert.equal(shouldReview(state), true);

  state.steeredThisTurn = true;
  assert.equal(shouldReview(state), false);

  resetReviewTurn(state);
  assert.equal(shouldReview(state), false);
  assert.equal(state.mutated, false);
  assert.equal(state.steeredThisTurn, false);
});
