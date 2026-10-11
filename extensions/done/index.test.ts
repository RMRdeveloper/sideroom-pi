import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  AgentBeforeSettleEventResult,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import registerDone from './index.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Registered {
  readonly handlers: Map<string, EventHandler>;
  readonly steers: string[];
  readonly cwd: string;
}

function register(
  scripts: Record<string, string> = { check: 'x' },
): Registered {
  const handlers = new Map<string, EventHandler>();
  const steers: string[] = [];
  const bus = new EventEmitter();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, (event, ctx) => {
        const result = handler(event, ctx);
        if (name === 'agent_before_settle') {
          const entries =
            (result as AgentBeforeSettleEventResult | undefined)?.entries ?? [];
          for (const entry of entries) {
            if (entry.type === 'custom_message') {
              steers.push(String(entry.content));
            }
          }
        }
        return result;
      });
    },
    events: {
      on: (name: string, handler: (payload: unknown) => void) =>
        bus.on(name, handler),
      emit: (name: string, payload: unknown) => bus.emit(name, payload),
    },
    sendMessage(message: { customType: string; content: string }) {
      steers.push(message.content);
    },
  } as unknown as ExtensionAPI;
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts }));
  registerDone(api);
  return { handlers, steers, cwd };
}

function mutate(handlers: Map<string, EventHandler>): void {
  const toolResult = handlers.get('tool_result');
  assert.ok(toolResult);
  toolResult({
    toolName: 'write',
    toolCallId: 'w1',
    input: {},
    content: [],
    isError: false,
  } as never);
}

function writePath(
  handlers: Map<string, EventHandler>,
  toolCallId: string,
  path: string,
): void {
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(toolCall);
  assert.ok(toolResult);
  toolCall(
    {
      toolName: 'write',
      toolCallId,
      input: { path, content: '' },
    } as never,
    {} as never,
  );
  toolResult({
    toolName: 'write',
    toolCallId,
    input: {},
    content: [],
    isError: false,
  } as never);
}

function runCheck(handlers: Map<string, EventHandler>, cwd: string): void {
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(toolCall);
  assert.ok(toolResult);
  toolCall(
    {
      toolName: 'bash',
      toolCallId: 'b1',
      input: { command: 'npm run test' },
    } as never,
    { cwd } as never,
  );
  toolResult({
    toolName: 'bash',
    toolCallId: 'b1',
    input: {},
    content: [],
    isError: false,
    details: {},
  } as never);
}

test('steers when files changed without a green check', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);
    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, [
      'Run `npm run check` and make it pass before finishing.',
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stops steering once the check command passes', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const toolCall = handlers.get('tool_call');
    const toolResult = handlers.get('tool_result');
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(toolCall);
    assert.ok(toolResult);
    assert.ok(settleRun);

    toolCall(
      {
        toolName: 'bash',
        toolCallId: 'b1',
        input: { command: 'npm run check' },
      } as never,
      { cwd } as never,
    );
    toolResult({
      toolName: 'bash',
      toolCallId: 'b1',
      input: {},
      content: [],
      isError: false,
      details: {},
    } as never);

    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('caps steering to avoid an infinite loop', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);

    settleRun(boundary() as never, { cwd } as never);
    settleRun(boundary() as never, { cwd } as never);
    settleRun(boundary() as never, { cwd } as never);
    assert.equal(steers.length, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('notes a run that changed code without touching a test', () => {
  const { handlers, steers, cwd } = register({ test: 'node --test' });
  try {
    writePath(handlers, 'w1', 'src/user.ts');
    runCheck(handlers, cwd);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);
    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, [
      'This run changed code files and no test file. Check whether existing tests cover the changed behavior; add or update a test if coverage is missing, then rerun the relevant checks before finishing.',
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stays quiet when the run touched a test', () => {
  const { handlers, steers, cwd } = register({ test: 'node --test' });
  try {
    writePath(handlers, 'w1', 'src/user.ts');
    writePath(handlers, 'w2', 'src/user.test.ts');
    runCheck(handlers, cwd);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);
    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('stays quiet when the run changed only documentation', () => {
  const { handlers, steers, cwd } = register({ test: 'node --test' });
  try {
    writePath(handlers, 'w1', 'README.md');
    runCheck(handlers, cwd);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);
    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does nothing when no check command is detectable', () => {
  const handlers = new Map<string, EventHandler>();
  const steers: string[] = [];
  const bus = new EventEmitter();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, (event, ctx) => {
        const result = handler(event, ctx);
        if (name === 'agent_before_settle') {
          const entries =
            (result as AgentBeforeSettleEventResult | undefined)?.entries ?? [];
          for (const entry of entries) {
            if (entry.type === 'custom_message') {
              steers.push(String(entry.content));
            }
          }
        }
        return result;
      });
    },
    events: {
      on: (name: string, handler: (payload: unknown) => void) =>
        bus.on(name, handler),
      emit: (name: string, payload: unknown) => bus.emit(name, payload),
    },
    sendMessage(message: { content: string }) {
      steers.push(message.content);
    },
  } as unknown as ExtensionAPI;
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  try {
    registerDone(api);
    mutate(handlers);
    const settleRun = handlers.get('agent_before_settle');
    assert.ok(settleRun);
    settleRun(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function boundary(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: 'agent_before_settle',
    outcome: 'completed',
    entries: [],
    continue: false,
    context: { pendingMessages: [] },
    ...overrides,
  };
}

test('does not steer at tool turn boundaries during implementation', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    assert.equal(handlers.has('turn_end'), false);
    assert.equal(handlers.has('turn_start'), false);
    assert.deepEqual(steers, []);
    const settle = handlers.get('agent_before_settle');
    assert.ok(settle);
    const result = settle(
      boundary() as never,
      { cwd } as never,
    ) as AgentBeforeSettleEventResult;
    assert.equal(result.continue, true);
    assert.deepEqual(result.entries, [
      {
        type: 'custom_message',
        customType: 'sideroom-done-gate',
        content: 'Run `npm run check` and make it pass before finishing.',
        display: false,
      },
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('yields on abort, error, queued work and an existing continuation without spending its cap', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const settle = handlers.get('agent_before_settle');
    assert.ok(settle);
    for (const overrides of [
      { outcome: 'aborted' },
      { outcome: 'error' },
      { continue: true },
      { context: { pendingMessages: [{ role: 'user' }] } },
      { context: { pendingMessages: [{ role: 'custom' }] } },
    ]) {
      settle(boundary(overrides) as never, { cwd } as never);
    }
    assert.deepEqual(steers, []);
    settle(boundary() as never, { cwd } as never);
    settle(boundary() as never, { cwd } as never);
    assert.equal(steers.length, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('re-arms only on idle user input and clears state on session start', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const settle = handlers.get('agent_before_settle');
    const input = handlers.get('input');
    const start = handlers.get('session_start');
    assert.ok(settle);
    assert.ok(input);
    assert.ok(start);
    settle(boundary() as never, { cwd } as never);
    settle(boundary() as never, { cwd } as never);
    for (const event of [
      { source: 'interactive', streamingBehavior: 'steer' },
      { source: 'rpc', streamingBehavior: 'followUp' },
      { source: 'extension' },
    ]) {
      input(event as never);
      settle(boundary() as never, { cwd } as never);
    }
    assert.equal(steers.length, 2);
    input({ source: 'interactive' } as never);
    settle(boundary() as never, { cwd } as never);
    assert.equal(steers.length, 2);
    mutate(handlers);
    settle(boundary() as never, { cwd } as never);
    assert.equal(steers.length, 3);
    start({} as never);
    settle(boundary() as never, { cwd } as never);
    assert.equal(steers.length, 3);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('invalidates a green check after a later successful mutation', () => {
  const { handlers, steers, cwd } = register({ test: 'node --test' });
  try {
    mutate(handlers);
    runCheck(handlers, cwd);
    mutate(handlers);
    const settle = handlers.get('agent_before_settle');
    assert.ok(settle);
    settle(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, [
      'Run `npm run test` and make it pass before finishing.',
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('clears a previous green check when a later check fails', () => {
  const { handlers, steers, cwd } = register({ test: 'node --test' });
  try {
    mutate(handlers);
    runCheck(handlers, cwd);
    const toolCall = handlers.get('tool_call');
    const toolResult = handlers.get('tool_result');
    const settle = handlers.get('agent_before_settle');
    assert.ok(toolCall);
    assert.ok(toolResult);
    assert.ok(settle);
    toolCall(
      {
        toolName: 'bash',
        toolCallId: 'red',
        input: { command: 'npm run test' },
      } as never,
      { cwd } as never,
    );
    toolResult({
      toolName: 'bash',
      toolCallId: 'red',
      input: {},
      isError: true,
    } as never);
    settle(boundary() as never, { cwd } as never);
    assert.deepEqual(steers, [
      'Run `npm run test` and make it pass before finishing.',
    ]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
