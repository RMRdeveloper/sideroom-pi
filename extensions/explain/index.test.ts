import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerExplain from './index.ts';
import { EXPLAIN_FILE_THRESHOLD } from './model.ts';

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

const CWD = '/work';

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

function fileResult(toolName: string, path: string, isError = false): never {
  return {
    toolName,
    toolCallId: `t:${path}`,
    input: { path },
    isError,
  } as never;
}

function mutateFile(
  harness: Harness,
  path: string,
  toolName = 'write',
  isError = false,
): void {
  handlerOf(harness, 'tool_result')(fileResult(toolName, path, isError), {
    cwd: CWD,
  } as never);
}

function mutateTurn(
  harness: Harness,
  count: number,
  toolName = 'write',
  isError = false,
): void {
  for (let index = 0; index < count; index += 1) {
    mutateFile(harness, `src/file-${index}.ts`, toolName, isError);
  }
}

function settle(harness: Harness, mode = 'tui'): void {
  handlerOf(harness, 'agent_settled')({} as never, { mode } as never);
}

test('defers one settle, then offers at the file threshold', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  settle(harness);
  assert.equal(harness.offers.length, 0);

  settle(harness);
  assert.equal(harness.offers.length, 1);
  assert.match(harness.offers[0]?.content ?? '', /sideroom_ask/);
  assert.equal(harness.offers[0]?.triggerTurn, true);
  assert.equal(harness.offers[0]?.deliverAs, 'steer');
});

test('offers after a review turn that crosses the threshold', () => {
  const harness = register();
  mutateFile(harness, 'src/a.ts');
  mutateFile(harness, 'src/b.ts');
  settle(harness);
  assert.equal(harness.offers.length, 0);

  mutateFile(harness, 'src/c.ts');
  mutateFile(harness, 'src/d.ts');
  mutateFile(harness, 'src/e.ts');
  settle(harness);
  assert.equal(harness.offers.length, 1);
});

test('stays silent below the file threshold', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD - 1);
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('counts a file mutated twice once', () => {
  const harness = register();
  for (let index = 0; index < EXPLAIN_FILE_THRESHOLD; index += 1) {
    mutateFile(harness, 'src/app.ts', 'edit');
  }
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('treats an edit the same as a write', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD - 1);
  mutateFile(harness, 'src/edited.ts', 'edit');
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 1);
});

test('counts one file once however the model spelled its path', () => {
  const harness = register();
  mutateFile(harness, 'src/app.ts');
  mutateFile(harness, '@src/app.ts');
  mutateFile(harness, './src/app.ts');
  mutateFile(harness, '/work/src/app.ts');
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('stays silent without a mutation', () => {
  const harness = register();
  handlerOf(harness, 'tool_result')(
    { toolName: 'read', toolCallId: 't1', input: {}, isError: false } as never,
    { cwd: CWD } as never,
  );
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('ignores a failed mutation', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD, 'write', true);
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('stays silent outside the TUI', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  settle(harness, 'print');
  settle(harness, 'print');
  assert.equal(harness.offers.length, 0);
});

test('offers at most once per turn and re-arms on the next prompt', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);

  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 1);

  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 1);

  handlerOf(harness, 'input')({ source: 'interactive' } as never);
  settle(harness);
  assert.equal(harness.offers.length, 1);

  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 2);
});

test('clears the turn state when a session starts', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  handlerOf(harness, 'session_start')({} as never);
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 0);
});

test('ignores a non-user input source when re-arming', () => {
  const harness = register();
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  settle(harness);
  settle(harness);

  handlerOf(harness, 'input')({ source: 'extension' } as never);
  settle(harness);
  settle(harness);
  assert.equal(harness.offers.length, 1);
});
