import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import registerTodo from './index.ts';
import type { TodoItem, TodoParams } from './model.ts';

const initialItems: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
];

function propose(items: readonly TodoItem[]): TodoParams {
  return { action: 'propose', items: [...items] };
}

test('registers a sequential tool that snapshots and injects the live board', async () => {
  const registered: { tool?: RegisteredTool } = {};
  const handlers = new Map<string, EventHandler>();
  const snapshots: unknown[] = [];
  const steers: Array<{ message: unknown; options: unknown }> = [];
  const widgets: Array<{ key: string; content: unknown }> = [];
  const widgetRefreshes: unknown[] = [];
  const shortcutKeys: string[] = [];
  const api = {
    registerTool(tool: RegisteredTool) {
      registered.tool = tool;
    },
    registerShortcut(key: string) {
      shortcutKeys.push(key);
    },
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry(_customType: string, data: unknown) {
      snapshots.push(data);
    },
    sendMessage(message: unknown, options: unknown) {
      steers.push({ message, options });
    },
    events: {
      emit(_channel: string, value: unknown) {
        widgetRefreshes.push(value);
      },
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: 'tui',
    sessionManager: {
      getBranch: () =>
        snapshots.map((snapshot) => customEntry(snapshot)) as never,
    },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;

  registerTodo(api);
  const tool = registered.tool;
  assert.ok(tool);
  assert.equal(tool.executionMode, 'sequential');
  assert.equal(tool.name, 'sideroom_todo');

  const result = await tool.execute(
    'call-1',
    propose(initialItems),
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(result.details, {
    action: 'propose',
    items: initialItems,
  });
  assert.deepEqual(snapshots, [{ items: initialItems }]);
  assert.equal(widgets.at(-1)?.key, 'sideroom-todo');
  assert.deepEqual(widgetRefreshes, [ctx]);
  assert.deepEqual(shortcutKeys, ['f9']);

  const beforeAgentStart = handlers.get('before_agent_start');
  assert.ok(beforeAgentStart);
  const injected = beforeAgentStart(
    { systemPrompt: 'base prompt' } as never,
    ctx,
  ) as {
    message?: { customType?: string; content?: string; display?: boolean };
  };
  assert.equal(injected.message?.customType, 'sideroom-todo-board');
  assert.match(injected.message?.content ?? '', /sideroom_todo \(live board/);
  assert.equal(injected.message?.display, false);

  assert.equal(handlers.has('turn_end'), false);
  const toolResult = handlers.get('tool_result');
  assert.ok(toolResult);
  toolResult({ toolName: 'write', isError: false } as never, ctx);
  assert.equal(steers.length, 1);
  assert.deepEqual(steers[0]?.options, {
    triggerTurn: false,
    deliverAs: 'steer',
  });
});

function guardHarness(items: readonly TodoItem[] = initialItems, mode = 'tui') {
  const handlers = new Map<string, EventHandler>();
  const steers: Array<{ content: string; options: unknown }> = [];
  const api = {
    registerTool() {},
    registerShortcut() {},
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    sendMessage(message: { content: string }, options: unknown) {
      steers.push({ content: message.content, options });
    },
    events: { emit() {} },
  } as unknown as ExtensionAPI;
  const ctx = {
    mode,
    sessionManager: { getBranch: () => [customEntry({ items })] },
    ui: { setWidget() {} },
  } as unknown as ExtensionContext;
  registerTodo(api);
  function emit(name: string, event: unknown) {
    handlers.get(name)?.(event as never, ctx);
  }
  return { emit, steers };
}

test('reminds once per idle user turn without scheduling a model turn', () => {
  const run = guardHarness();
  for (let index = 0; index < 100; index += 1) {
    run.emit('turn_start', {});
    run.emit('tool_result', { toolName: 'write', isError: false });
    run.emit('turn_end', {});
  }
  assert.equal(run.steers.length, 1);
  assert.match(run.steers[0]?.content ?? '', /when a task changes status/);
  assert.deepEqual(run.steers[0]?.options, {
    triggerTurn: false,
    deliverAs: 'steer',
  });
  run.emit('input', { source: 'interactive', streamingBehavior: 'steer' });
  run.emit('tool_result', { toolName: 'edit', isError: false });
  assert.equal(run.steers.length, 1);
  run.emit('input', { source: 'rpc' });
  run.emit('tool_result', { toolName: 'edit', isError: false });
  assert.equal(run.steers.length, 2);
  run.emit('session_start', {});
  run.emit('tool_result', { toolName: 'write', isError: false });
  assert.equal(run.steers.length, 3);
});

test('ignores reads, bash and failed edits, and only suggests supported proposals', () => {
  const run = guardHarness([]);
  for (const toolName of ['bash', 'read', 'sideroom_todo']) {
    run.emit('tool_execution_start', { toolName });
    run.emit('tool_result', { toolName, isError: false });
  }
  run.emit('tool_result', { toolName: 'edit', isError: true });
  assert.equal(run.steers.length, 0);
  run.emit('tool_result', { toolName: 'write', isError: false });
  assert.equal(run.steers.length, 1);
  assert.match(run.steers[0]?.content ?? '', /propose if.*multiple steps/);
  const print = guardHarness([], 'print');
  print.emit('tool_result', { toolName: 'write', isError: false });
  assert.equal(print.steers.length, 0);
  const closed = guardHarness([
    { id: 'done', content: 'Finished work', status: 'completed' },
  ]);
  closed.emit('tool_result', { toolName: 'write', isError: false });
  assert.equal(closed.steers.length, 0);
});

test('prepares stringified items before execute sees native arrays', () => {
  const registered: { tool?: RegisteredTool } = {};
  const api = {
    registerTool(tool: RegisteredTool) {
      registered.tool = tool;
    },
    registerShortcut() {},
    on() {},
    appendEntry() {},
    sendMessage() {},
    events: { emit() {} },
  } as unknown as ExtensionAPI;

  registerTodo(api);
  const tool = registered.tool;
  assert.ok(tool?.prepareArguments);
  assert.deepEqual(
    tool.prepareArguments({
      action: 'propose',
      items: JSON.stringify(initialItems),
    }),
    propose(initialItems),
  );
});

interface RegisteredTool {
  readonly name: string;
  readonly executionMode?: string;
  prepareArguments?: (args: unknown) => TodoParams;
  execute(
    toolCallId: string,
    params: TodoParams,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ): Promise<{ readonly details: unknown }>;
}

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

function customEntry(data: unknown): unknown {
  return { type: 'custom', customType: 'sideroom-todo', data };
}
