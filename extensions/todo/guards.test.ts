import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { registerGuardEvents } from './guards.ts';
import { createTodoStore, type TodoStore } from './session.ts';
import type { TodoItem } from './model.ts';

type EventHandler = (event: never, ctx: ExtensionContext) => void;

interface GuardHarness {
  readonly steers: Array<{ content: string; options: unknown }>;
  readonly emit: (name: string, event: unknown, mode?: string) => void;
}

function harness(store: TodoStore): GuardHarness {
  const handlers = new Map<string, EventHandler>();
  const steers: Array<{ content: string; options: unknown }> = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    sendMessage(message: { content: string }, options: unknown) {
      steers.push({ content: message.content, options });
    },
  } as unknown as ExtensionAPI;

  registerGuardEvents(api, store, () => {});

  const emit = (name: string, event: unknown, mode = 'tui'): void => {
    const ctx = { mode } as unknown as ExtensionContext;
    handlers.get(name)?.(event as never, ctx);
  };
  return { steers, emit };
}

function writeResult(): unknown {
  return { toolName: 'write', isError: false };
}

test('suggests a plan before a multi-step change and keeps the reminder quiet', () => {
  const run = harness(createTodoStore());

  run.emit('tool_result', writeResult());
  assert.equal(run.steers.length, 1);
  assert.match(
    run.steers[0]?.content ?? '',
    /Use sideroom_todo propose to show the plan/,
  );
  assert.deepEqual(run.steers[0]?.options, {
    triggerTurn: false,
    deliverAs: 'steer',
  });

  run.emit('tool_result', writeResult());
  assert.equal(run.steers.length, 1);

  run.emit('input', { source: 'interactive' });
  run.emit('tool_result', writeResult());
  assert.equal(run.steers.length, 2);
});

test('asks for a status change when the board already has open items', () => {
  const items: readonly TodoItem[] = [
    { id: 'auth', content: 'Add login route', status: 'in_progress' },
    { id: 'tests', content: 'Cover login', status: 'pending' },
  ];
  const run = harness(createTodoStore(items));

  run.emit('tool_result', writeResult());
  assert.match(
    run.steers[0]?.content ?? '',
    /mark the finished one and start the next/,
  );
  assert.match(run.steers[0]?.content ?? '', /A tool that ran is not a status change/);
});

test('stays silent for other tools, failed edits, closed boards and non-TUI runs', () => {
  const closed = harness(
    createTodoStore([
      { id: 'done', content: 'Finished work', status: 'completed' },
    ]),
  );
  for (const toolName of ['bash', 'read', 'sideroom_todo']) {
    closed.emit('tool_result', { toolName, isError: false });
  }
  closed.emit('tool_result', { toolName: 'edit', isError: true });
  closed.emit('tool_result', { toolName: 'write', isError: true });
  assert.equal(closed.steers.length, 0);

  const headless = harness(createTodoStore());
  headless.emit('tool_result', writeResult(), 'print');
  assert.equal(headless.steers.length, 0);
});
