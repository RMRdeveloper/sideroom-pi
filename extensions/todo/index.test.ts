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
  ) as { systemPrompt?: string };
  assert.match(injected.systemPrompt ?? '', /sideroom_todo \(live board/);
  assert.match(injected.systemPrompt ?? '', /base prompt/);

  const input = handlers.get('input');
  const turnStart = handlers.get('turn_start');
  const toolStart = handlers.get('tool_execution_start');
  const turnEnd = handlers.get('turn_end');
  assert.ok(input);
  assert.ok(turnStart);
  assert.ok(toolStart);
  assert.ok(turnEnd);
  input({ source: 'interactive' } as never, ctx);
  turnStart({} as never, ctx);
  toolStart({ toolName: 'write' } as never, ctx);
  turnEnd({} as never, ctx);
  assert.deepEqual(steers, [
    {
      message: {
        customType: 'sideroom-todo-watchdog',
        content:
          'Use sideroom_todo update to reflect this work before continuing to the next item.',
        display: false,
      },
      options: { triggerTurn: true, deliverAs: 'steer' },
    },
  ]);
});

test('nudges only once when mutating an empty board', () => {
  const handlers = new Map<string, EventHandler>();
  const steers: unknown[] = [];
  const api = {
    registerTool() {},
    registerShortcut() {},
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry() {},
    sendMessage(message: unknown) {
      steers.push(message);
    },
    events: { emit() {} },
  } as unknown as ExtensionAPI;
  const ctx = {
    sessionManager: { getBranch: () => [] },
    ui: { setWidget() {} },
  } as unknown as ExtensionContext;

  registerTodo(api);
  const input = handlers.get('input');
  const turnStart = handlers.get('turn_start');
  const toolStart = handlers.get('tool_execution_start');
  assert.ok(input);
  assert.ok(turnStart);
  assert.ok(toolStart);
  input({ source: 'interactive' } as never, ctx);
  turnStart({} as never, ctx);
  toolStart({ toolName: 'write' } as never, ctx);
  toolStart({ toolName: 'edit' } as never, ctx);

  assert.deepEqual(steers, [
    {
      customType: 'sideroom-todo-nudge',
      content:
        'Use sideroom_todo propose now to create the live board before continuing implementation.',
      display: false,
    },
  ]);
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
