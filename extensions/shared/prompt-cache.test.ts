import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import registerAsk from '../ask/index.ts';
import registerDone from '../done/index.ts';
import registerExplain from '../explain/index.ts';
import registerGuidelines from '../guidelines/index.ts';
import registerModifiedFiles from '../modified-files/index.ts';
import registerPersona from '../persona/index.ts';
import registerRules from '../rules/index.ts';
import registerTodo from '../todo/index.ts';
import type { TodoItem, TodoParams } from '../todo/model.ts';

const BASE_SYSTEM_PROMPT = 'base system prompt';

// The only extensions allowed to touch the system prompt. Every other
// extension must carry per-turn context as a session message, so the cached
// prefix stays byte-identical while the session runs.
const SYSTEM_PROMPT_MUTATORS = ['guidelines', 'persona'];

const EXTENSIONS: readonly ExtensionEntry[] = [
  ['ask', registerAsk],
  ['done', registerDone],
  ['explain', registerExplain],
  ['guidelines', registerGuidelines],
  ['modified-files', registerModifiedFiles],
  ['persona', registerPersona],
  ['rules', registerRules],
  ['todo', registerTodo],
];

const initialItems: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
];

test('only the static reminders touch the system prompt', () => {
  const producers: string[] = [];
  for (const entry of EXTENSIONS) {
    const harness = createHarness([entry]);
    if (composeSystemPrompt(harness).systemPrompt !== BASE_SYSTEM_PROMPT) {
      producers.push(entry[0]);
    }
  }

  assert.deepEqual(producers, SYSTEM_PROMPT_MUTATORS);
});

test('a board change leaves the composed system prompt byte-identical', async () => {
  const harness = createHarness(EXTENSIONS);
  const before = composeSystemPrompt(harness);

  const todoTool = harness.tools.get('sideroom_todo');
  assert.ok(todoTool);
  await todoTool.execute(
    'call-1',
    { action: 'propose', items: [...initialItems] },
    undefined,
    undefined,
    harness.ctx,
  );
  const afterChange = composeSystemPrompt(harness);
  const withoutChange = composeSystemPrompt(harness);

  assert.equal(afterChange.systemPrompt, before.systemPrompt);
  assert.equal(before.systemPrompt.includes('sideroom_todo'), false);
  assert.deepEqual(before.messages, []);
  assert.equal(afterChange.messages.length, 1);
  assert.match(boardMessage(afterChange), /sideroom_todo \(live board/);
  assert.deepEqual(withoutChange.messages, []);
  assert.equal(withoutChange.systemPrompt, before.systemPrompt);
});

type ExtensionEntry = readonly [name: string, register: ExtensionRegister];

type ExtensionRegister = (pi: ExtensionAPI) => void;

interface Harness {
  readonly handlers: Map<string, EventHandler[]>;
  readonly tools: Map<string, RegisteredTool>;
  readonly ctx: ExtensionContext;
}

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

interface RegisteredTool {
  readonly name: string;
  execute(
    toolCallId: string,
    params: TodoParams,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ): Promise<unknown>;
}

interface ComposedPrompt {
  readonly systemPrompt: string;
  readonly messages: readonly { readonly content?: string }[];
}

// Mirrors how Pi chains before_agent_start results: each handler sees the
// system prompt the earlier handlers produced, and messages are collected.
function composeSystemPrompt(harness: Harness): ComposedPrompt {
  let systemPrompt = BASE_SYSTEM_PROMPT;
  const messages: { content?: string }[] = [];
  for (const handler of harness.handlers.get('before_agent_start') ?? []) {
    const handlerResult = handler({ systemPrompt } as never, harness.ctx) as
      | { systemPrompt?: string; message?: { content?: string } }
      | undefined;
    if (handlerResult?.systemPrompt !== undefined) {
      systemPrompt = handlerResult.systemPrompt;
    }
    if (handlerResult?.message !== undefined) {
      messages.push(handlerResult.message);
    }
  }
  return { systemPrompt, messages };
}

function boardMessage(composed: ComposedPrompt): string {
  return composed.messages[0]?.content ?? '';
}

function createHarness(entries: readonly ExtensionEntry[]): Harness {
  const handlers = new Map<string, EventHandler[]>();
  const tools = new Map<string, RegisteredTool>();
  const snapshots: unknown[] = [];
  const api = {
    on(name: string, handler: EventHandler) {
      const registered = handlers.get(name) ?? [];
      registered.push(handler);
      handlers.set(name, registered);
    },
    registerTool(tool: RegisteredTool) {
      tools.set(tool.name, tool);
    },
    registerShortcut() {},
    getActiveTools: () => ['read', 'bash', 'edit', 'write'],
    appendEntry(_customType: string, snapshot: unknown) {
      snapshots.push(snapshot);
    },
    sendMessage() {},
    events: { emit() {}, on() {} },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: '/repo',
    mode: 'tui',
    hasUI: false,
    sessionManager: {
      getBranch: () => snapshots.map(boardSnapshotEntry) as never,
    },
    ui: { setStatus() {}, setWidget() {} },
  } as unknown as ExtensionContext;

  for (const [, register] of entries) {
    register(api);
  }
  return { handlers, tools, ctx };
}

function boardSnapshotEntry(snapshot: unknown): unknown {
  return { type: 'custom', customType: 'sideroom-todo', data: snapshot };
}
