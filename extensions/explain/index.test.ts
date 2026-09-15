import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerExplain from './index.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Offer {
  readonly content: string;
  readonly triggerTurn: boolean | undefined;
  readonly deliverAs: string | undefined;
}

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly offers: Offer[];
}

function register(): Harness {
  const handlers = new Map<string, EventHandler>();
  const offers: Offer[] = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    sendMessage(
      message: { content: string },
      options: { triggerTurn?: boolean; deliverAs?: string },
    ) {
      offers.push({
        content: message.content,
        triggerTurn: options.triggerTurn,
        deliverAs: options.deliverAs,
      });
    },
  } as unknown as ExtensionAPI;
  registerExplain(api);
  return { handlers, offers };
}

function handlerOf(harness: Harness, name: string): EventHandler {
  const handler = harness.handlers.get(name);
  assert.ok(handler, name);
  return handler;
}

function fileResult(toolName: string, isError = false): never {
  return { toolName, toolCallId: 't1', input: {}, isError } as never;
}

function settle(harness: Harness, mode = 'tui'): void {
  handlerOf(harness, 'agent_settled')({} as never, { mode } as never);
}

test('offers the walkthrough after a successful write settles', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write'));
  settle(harness);
  assert.equal(harness.offers.length, 1);
  assert.match(harness.offers[0]?.content ?? '', /sideroom_ask/);
  assert.equal(harness.offers[0]?.triggerTurn, true);
  assert.equal(harness.offers[0]?.deliverAs, 'steer');
});

test('treats an edit the same as a write', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('edit'));
  settle(harness);
  assert.equal(harness.offers.length, 1);
});

test('stays silent without a mutation', () => {
  const harness = register();
  handlerOf(
    harness,
    'tool_result',
  )({ toolName: 'read', toolCallId: 't2', input: {}, isError: false } as never);
  settle(harness);
  assert.deepEqual(harness.offers, []);
});

test('ignores a failed mutation', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write', true));
  settle(harness);
  assert.deepEqual(harness.offers, []);
});

test('stays silent outside the TUI', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write'));
  settle(harness, 'print');
  assert.deepEqual(harness.offers, []);
});

test('offers at most once per run and re-arms on the next prompt', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write'));

  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 1);

  handlerOf(harness, 'input')({ source: 'interactive' } as never);
  settle(harness);
  assert.equal(harness.offers.length, 1);

  handlerOf(harness, 'tool_result')(fileResult('write'));
  settle(harness);
  assert.equal(harness.offers.length, 2);
});

test('clears the run state when a session starts', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write'));
  handlerOf(harness, 'session_start')({} as never);
  settle(harness);
  assert.deepEqual(harness.offers, []);
});

test('ignores a non-user input source when re-arming', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(fileResult('write'));
  settle(harness);

  handlerOf(harness, 'input')({ source: 'extension' } as never);
  settle(harness);
  assert.equal(harness.offers.length, 1);
});
