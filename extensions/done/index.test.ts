import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
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
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
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
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnEnd);
    turnEnd({} as never, { cwd } as never);
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
    const turnEnd = handlers.get('turn_end');
    assert.ok(toolCall);
    assert.ok(toolResult);
    assert.ok(turnEnd);

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

    turnEnd({} as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('caps steering to avoid an infinite loop', () => {
  const { handlers, steers, cwd } = register();
  try {
    mutate(handlers);
    const turnStart = handlers.get('turn_start');
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnStart);
    assert.ok(turnEnd);

    turnStart({} as never);
    turnEnd({} as never, { cwd } as never);
    turnStart({} as never);
    turnEnd({} as never, { cwd } as never);
    turnStart({} as never);
    turnEnd({} as never, { cwd } as never);
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
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnEnd);
    turnEnd({} as never, { cwd } as never);
    assert.deepEqual(steers, [
      'This run changed code files and no test file. Add or update the test that covers the change before finishing.',
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
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnEnd);
    turnEnd({} as never, { cwd } as never);
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
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnEnd);
    turnEnd({} as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does nothing when no check command is detectable', () => {
  const handlers = new Map<string, EventHandler>();
  const steers: string[] = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    sendMessage(message: { content: string }) {
      steers.push(message.content);
    },
  } as unknown as ExtensionAPI;
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  try {
    registerDone(api);
    mutate(handlers);
    const turnEnd = handlers.get('turn_end');
    assert.ok(turnEnd);
    turnEnd({} as never, { cwd } as never);
    assert.deepEqual(steers, []);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
