import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerGuidelines from './index.ts';
import {
  createReviewState,
  REVIEW_STEER,
  REVIEW_STEER_TYPE,
  resetReviewTurn,
  shouldReview,
} from './review.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Steer {
  readonly customType: string;
  readonly content: string;
  readonly display: boolean | undefined;
  readonly triggerTurn: boolean | undefined;
  readonly deliverAs: string | undefined;
}

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly steers: Steer[];
}

function register(): Harness {
  const handlers = new Map<string, EventHandler>();
  const steers: Steer[] = [];
  const api = {
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
    sendMessage(
      message: { customType: string; content: string; display?: boolean },
      options: { triggerTurn?: boolean; deliverAs?: string },
    ) {
      steers.push({
        customType: message.customType,
        content: message.content,
        display: message.display,
        triggerTurn: options.triggerTurn,
        deliverAs: options.deliverAs,
      });
    },
  } as unknown as ExtensionAPI;
  registerGuidelines(api);
  return { handlers, steers };
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

function settle(harness: Harness): void {
  handlerOf(harness, 'agent_settled')({} as never, {} as never);
}

test('steers one guidelines review after a successful mutation settles', () => {
  const harness = register();
  mutate(harness);
  settle(harness);

  assert.equal(harness.steers.length, 1);
  assert.equal(harness.steers[0]?.customType, REVIEW_STEER_TYPE);
  assert.equal(harness.steers[0]?.content, REVIEW_STEER);
  assert.equal(harness.steers[0]?.display, false);
  assert.equal(harness.steers[0]?.triggerTurn, true);
  assert.equal(harness.steers[0]?.deliverAs, 'steer');
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

test('steers at most once per turn and does not re-fire on the continuation settle', () => {
  const harness = register();
  mutate(harness);
  settle(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);
});

test('re-arms after a real user prompt and mutates again', () => {
  const harness = register();
  mutate(harness);
  settle(harness);
  assert.equal(harness.steers.length, 1);

  handlerOf(harness, 'input')({ source: 'interactive' } as never);
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

  handlerOf(harness, 'input')({ source: 'extension' } as never);
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
