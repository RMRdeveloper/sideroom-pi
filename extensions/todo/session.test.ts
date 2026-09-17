import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { formatBoardBlock, type TodoItem } from './model.ts';
import {
  BOARD_MESSAGE_TYPE,
  type BoardLifecycle,
  createTodoStore,
  reconstructTodoItems,
  registerBoardContext,
  registerSessionRefreshEvents,
} from './session.ts';

const initialItems: readonly TodoItem[] = [
  { id: 'auth', content: 'Add login route', status: 'in_progress' },
  { id: 'tests', content: 'Cover login', status: 'pending' },
];

test('reconstructs the latest custom snapshot, including an intentionally empty board', () => {
  assert.deepEqual(
    reconstructTodoItems([
      toolResultEntry({ items: initialItems }),
      customEntry({ items: initialItems }),
      customEntry({ items: [] }),
    ] as never),
    [],
  );

  assert.deepEqual(
    reconstructTodoItems([toolResultEntry({ items: initialItems })] as never),
    initialItems,
  );
});

test('forked session branches inherit the board and then reconstruct independently', () => {
  const sharedBranch = [customEntry({ items: initialItems })];
  const originalItems: readonly TodoItem[] = [
    { id: 'auth', content: 'Add login route', status: 'completed' },
    { id: 'tests', content: 'Cover login', status: 'in_progress' },
  ];
  const forkedItems: readonly TodoItem[] = [
    { id: 'auth', content: 'Add login route', status: 'in_progress' },
    { id: 'tests', content: 'Cover login', status: 'cancelled' },
  ];

  assert.deepEqual(reconstructTodoItems(sharedBranch as never), initialItems);
  assert.deepEqual(
    reconstructTodoItems([
      ...sharedBranch,
      customEntry({ items: originalItems }),
    ] as never),
    originalItems,
  );
  assert.deepEqual(
    reconstructTodoItems([
      ...sharedBranch,
      customEntry({ items: forkedItems }),
    ] as never),
    forkedItems,
  );
  assert.deepEqual(reconstructTodoItems(sharedBranch as never), initialItems);
});

test('sends the board block as a session message and only when it changes', () => {
  const handlers = new Map<string, EventHandler>();
  const store = createTodoStore(initialItems);
  const ctx = {} as ExtensionContext;
  registerBoardContext(createHandlerApi(handlers), store, () => undefined);

  const beforeAgentStart = handlers.get('before_agent_start');
  assert.ok(beforeAgentStart);

  const first = beforeAgentStart({} as never, ctx) as BeforeAgentStartResult;
  assert.deepEqual(Object.keys(first ?? {}), ['message']);
  assert.deepEqual(first.message, {
    customType: BOARD_MESSAGE_TYPE,
    content: formatBoardBlock(initialItems),
    display: false,
  });
  assert.equal(beforeAgentStart({} as never, ctx), undefined);

  store.items = [{ id: 'tests', content: 'Cover login', status: 'completed' }];
  const changed = beforeAgentStart({} as never, ctx) as BeforeAgentStartResult;
  assert.equal(changed.message?.content, formatBoardBlock(store.items));
});

test('injects nothing while the board is empty', () => {
  const handlers = new Map<string, EventHandler>();
  registerBoardContext(
    createHandlerApi(handlers),
    createTodoStore(),
    () => undefined,
  );
  const beforeAgentStart = handlers.get('before_agent_start');
  assert.ok(beforeAgentStart);
  assert.equal(
    beforeAgentStart({} as never, {} as ExtensionContext),
    undefined,
  );
});

test('re-sends an unchanged board block after the session is restored', () => {
  const handlers = new Map<string, EventHandler>();
  const store = createTodoStore(initialItems);
  const ctx = {} as ExtensionContext;
  const api = createHandlerApi(handlers);
  const lifecycle: BoardLifecycle = () => undefined;
  registerSessionRefreshEvents(api, store, lifecycle);
  registerBoardContext(api, store, lifecycle);

  const beforeAgentStart = handlers.get('before_agent_start');
  const sessionCompact = handlers.get('session_compact');
  assert.ok(beforeAgentStart);
  assert.ok(sessionCompact);

  assert.ok(beforeAgentStart({} as never, ctx));
  assert.equal(beforeAgentStart({} as never, ctx), undefined);
  sessionCompact({ willRetry: false } as never, ctx);
  assert.ok(beforeAgentStart({} as never, ctx));
});

test('queues the board block when compaction retries automatically', () => {
  const handlers = new Map<string, EventHandler>();
  const sentMessages: SentMessage[] = [];
  const store = createTodoStore(initialItems);
  const ctx = {} as ExtensionContext;
  const api = createHandlerApi(handlers, sentMessages);
  const lifecycle: BoardLifecycle = () => undefined;
  registerSessionRefreshEvents(api, store, lifecycle);
  registerBoardContext(api, store, lifecycle);

  const beforeAgentStart = handlers.get('before_agent_start');
  const sessionCompact = handlers.get('session_compact');
  assert.ok(beforeAgentStart);
  assert.ok(sessionCompact);

  assert.ok(beforeAgentStart({} as never, ctx));
  sessionCompact({ willRetry: true } as never, ctx);

  assert.deepEqual(sentMessages, [
    {
      message: {
        customType: BOARD_MESSAGE_TYPE,
        content: formatBoardBlock(initialItems),
        display: false,
      },
      options: { deliverAs: 'steer' },
    },
  ]);
  assert.equal(beforeAgentStart({} as never, ctx), undefined);
});

interface BeforeAgentStartResult {
  message?: { customType?: string; content?: string; display?: boolean };
}

interface SentMessage {
  readonly message: {
    readonly customType: string;
    readonly content: string;
    readonly display?: boolean;
  };
  readonly options: { readonly deliverAs?: string };
}

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

function createHandlerApi(
  handlers: Map<string, EventHandler>,
  sentMessages: SentMessage[] = [],
): ExtensionAPI {
  return {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    sendMessage(
      message: SentMessage['message'],
      options: SentMessage['options'],
    ) {
      sentMessages.push({ message, options });
    },
  } as unknown as ExtensionAPI;
}

function customEntry(data: unknown): unknown {
  return { type: 'custom', customType: 'sideroom-todo', data };
}

function toolResultEntry(details: unknown): unknown {
  return {
    type: 'message',
    message: { role: 'toolResult', toolName: 'sideroom_todo', details },
  };
}
