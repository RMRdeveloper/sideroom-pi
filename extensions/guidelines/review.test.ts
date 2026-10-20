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
  readonly continue?: boolean;
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
      emit(channel: string, payload: unknown) {
        for (const handler of bus.get(channel) ?? []) {
          handler(payload);
        }
      },
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

      handlers.set(name, ((event: never, ctx: never) => {
        existing(event, ctx);
        return handler(event, ctx);
      }) as EventHandler);
    },
    registerTool() {},
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

async function settle(harness: Harness, options: SettleOptions = {}): Promise<void> {
  const steer = await handlerOf(harness, 'agent_before_settle')(
    {
      type: 'agent_before_settle',
      outcome: options.outcome ?? 'completed',
      entries: options.entries ?? [],
      continue: options.continue ?? false,
      context: {
        pendingMessages: (options.pendingRoles ?? []).map((role) => ({
          role,
        })),
      },
    } as never,
    { hasPendingMessages: () => false } as never,
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

test('appends one hidden review and continues after a mutation settles', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

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

test('reviews intent and coupling, not function length, only in changes from this run', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

  const steer = steerText(harness, 0);
  assert.match(steer, /changes this run introduced/);
  assert.match(steer, /rule 20, Decomposition by intent/);
  assert.match(steer, /names and contracts/);
  assert.match(steer, /orchestration/);
  assert.match(steer, /even with one caller/);
  assert.match(steer, /Do not split solely for line count/);
  assert.match(steer, /shared mutable state/);
  assert.match(steer, /excessive parameters/);
  assert.match(steer, /functions that must be read together/);
  assert.match(steer, /Do not refactor unrelated code/);
});

test('keeps the entries earlier handlers proposed', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness, { entries: [EARLIER_ENTRY] });

  assert.equal(harness.steers[0]?.entries?.length, 2);
  assert.deepEqual(harness.steers[0]?.entries?.[0], EARLIER_ENTRY);
});

test('stays silent without a mutation', async () => {
  const harness = register();
  await settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('ignores a failed mutation', async () => {
  const harness = register();
  mutate(harness, true);
  await settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('stays silent when the user aborted or the run errored', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness, { outcome: 'aborted' });
  await settle(harness, { outcome: 'error' });
  assert.deepEqual(harness.steers, []);
});

test('yields to a pending user message', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness, { pendingRoles: ['user'] });
  assert.deepEqual(harness.steers, []);

  await settle(harness, { pendingRoles: ['custom'] });
  assert.deepEqual(harness.steers, []);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('steers at most once per turn and not again on its own continuation', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);
  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('does not re-arm on a message typed while the run is active', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

  input(harness, 'interactive', 'steer');
  mutate(harness);
  await settle(harness);
  input(harness, 'interactive', 'followUp');
  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('re-arms after an idle user prompt and a new mutation', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 1);

  input(harness, 'interactive');
  await settle(harness);
  assert.equal(harness.steers.length, 1);

  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 2);
});

test('does not re-arm on extension-sourced input', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

  input(harness, 'extension');
  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('clears review state when a session starts', async () => {
  const harness = register();
  mutate(harness);
  handlerOf(harness, 'session_start')({} as never);
  await settle(harness);
  assert.deepEqual(harness.steers, []);
});

test('keeps review state independent of the read-gate reset', async () => {
  const harness = register();
  mutate(harness);

  handlerOf(harness, 'before_agent_start')({ systemPrompt: 'base' } as never);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('carries semantic notes gathered before the review', async () => {
  const harness = register();
  mutate(harness);
  emitNote(harness, { text: 'Jev flagged src/example.ts' });
  await settle(harness);

  assert.equal(
    steerText(harness, 0),
    `${REVIEW_STEER}\n\nJev flagged src/example.ts`,
  );
});

test('follows up once on notes that arrive after the review fired', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

  mutate(harness);
  emitNote(harness, { text: 'first late note' });
  await settle(harness);
  assert.equal(
    steerText(harness, 1),
    `${REVIEW_NOTES_STEER}\n\nfirst late note`,
  );

  mutate(harness);
  emitNote(harness, { text: 'second late note' });
  await settle(harness);
  assert.equal(harness.steers.length, 2);
});

test('keeps late notes when the follow-up had to yield', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);

  emitNote(harness, { text: 'late note' });
  await settle(harness, { pendingRoles: ['user'] });
  await settle(harness);
  assert.equal(harness.steers.length, 2);
  assert.match(steerText(harness, 1), /late note/);
});

test('ignores a malformed note', async () => {
  const harness = register();
  mutate(harness);
  emitNote(harness, { note: 'wrong shape' });
  emitNote(harness, 'plain string');
  await settle(harness);
  assert.equal(steerText(harness, 0), REVIEW_STEER);
});

test('drops notes from the previous turn on an idle user prompt', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);
  emitNote(harness, { text: 'stale note' });

  input(harness, 'interactive');
  mutate(harness);
  await settle(harness);
  assert.equal(steerText(harness, 1), REVIEW_STEER);
});

test('a workflow note alone starts one evidence-based review', async () => {
  const state = createReviewState();
  state.notes.push('orphan note');
  assert.match(
    pendingReviewSteer(state) ?? '',
    /questionnaire or task contract/,
  );

  state.mutated = true;
  assert.match(pendingReviewSteer(state) ?? '', /orphan note/);
  markReviewSteered(state);
  assert.deepEqual(state.notes, []);
  assert.equal(pendingReviewSteer(state), undefined);
});

test('shouldReview requires a mutation and an unarmed flag', async () => {
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

test('keeps the review armed when an earlier handler continues implementation', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness, { entries: [EARLIER_ENTRY], continue: true });
  assert.deepEqual(harness.steers, []);
  mutate(harness);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('keeps late notes while a non-user continuation is queued', async () => {
  const harness = register();
  mutate(harness);
  await settle(harness);
  emitNote(harness, { text: 'late note' });
  await settle(harness, { pendingRoles: ['custom'] });
  assert.equal(harness.steers.length, 1);
  await settle(harness);
  assert.match(steerText(harness, 1), /late note/);
});

test('delivers a questionnaire note at settle without requiring a code mutation', async () => {
  const harness = register();
  emitNote(harness, { text: 'Question options visibly overlap' });
  await settle(harness);
  assert.match(steerText(harness, 0), /questionnaire or task contract/);
  assert.match(steerText(harness, 0), /Question options visibly overlap/);
  await settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('a late workflow note preserves the task-review contract without code changes', async () => {
  const state = createReviewState();
  state.notes.push('Question options overlap');
  markReviewSteered(state);
  state.notes.push('Completion claim contradicts observed checks');
  const steer = pendingReviewSteer(state) ?? '';
  assert.match(steer, /questionnaire or task contract/);
  assert.match(steer, /Run project checks only if code changes/);
  markReviewSteered(state);
  state.notes.push('Further advisory note');
  assert.equal(pendingReviewSteer(state), undefined);
});
