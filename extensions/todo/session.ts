import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import {
  formatBoardBlock,
  parseTodoParams,
  TODO_ACTION,
  TOOL_NAME,
  type TodoItem,
} from './model.ts';
import { renderTodoWidget } from './ui.ts';

export const SNAPSHOT_TYPE = 'sideroom-todo';
export const BOARD_MESSAGE_TYPE = 'sideroom-todo-board';
export const WIDGET_KEY = 'sideroom-todo';
export const TODO_WIDGET_REFRESH_EVENT = 'sideroom:todo-widget-refreshed';

export interface TodoStore {
  items: readonly TodoItem[];
  lastSentBlock?: string;
}

export type BoardLifecycle = (ctx: ExtensionContext) => void;

type SessionBranch = ReturnType<
  ExtensionContext['sessionManager']['getBranch']
>;

export function createTodoStore(items: readonly TodoItem[] = []): TodoStore {
  return { items };
}

export function reconstructTodoItems(
  branch: SessionBranch,
): readonly TodoItem[] {
  const snapshotItems = findSnapshotItems(branch);
  if (snapshotItems !== undefined) {
    return snapshotItems;
  }
  return findToolResultItems(branch) ?? [];
}

export function restoreBoard(
  store: TodoStore,
  ctx: Pick<ExtensionContext, 'sessionManager'>,
): void {
  store.items = reconstructTodoItems(ctx.sessionManager.getBranch());
}

export function persistSnapshot(
  pi: Pick<ExtensionAPI, 'appendEntry'>,
  items: readonly TodoItem[],
): void {
  pi.appendEntry(SNAPSHOT_TYPE, { items });
}

export function refreshBoard(
  store: TodoStore,
  ctx: Pick<ExtensionContext, 'ui'>,
): void {
  if (store.items.length === 0) {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    return;
  }
  ctx.ui.setWidget(WIDGET_KEY, (_tui, theme) => {
    const lines = renderTodoWidget(store.items, theme);
    return new Text(lines?.join('\n') ?? '', 0, 0);
  });
}

export function restoreAndRefreshBoard(
  store: TodoStore,
  ctx: ExtensionContext,
): void {
  restoreBoard(store, ctx);
  refreshBoard(store, ctx);
}

export function commitBoard(
  store: TodoStore,
  pi: Pick<ExtensionAPI, 'appendEntry'>,
  ctx: Pick<ExtensionContext, 'ui'>,
  items: readonly TodoItem[],
): void {
  store.items = items;
  persistSnapshot(pi, items);
  refreshBoard(store, ctx);
}

export function registerSessionRefreshEvents(
  pi: ExtensionAPI,
  store: TodoStore,
  restoreAndRefresh: BoardLifecycle,
): void {
  // A restore can drop the sent block from the model's context, so an unchanged
  // board still has to be announced again.
  const restoreSession = (ctx: ExtensionContext) => {
    restoreAndRefresh(ctx);
    forgetSentBoardBlock(store);
  };
  pi.on('session_start', (_event, ctx) => restoreSession(ctx));
  pi.on('session_tree', (_event, ctx) => restoreSession(ctx));
  pi.on('session_compact', (event, ctx) => {
    restoreSession(ctx);
    if (!event.willRetry) {
      return;
    }
    const block = pendingBoardBlock(store);
    if (block === undefined) {
      return;
    }
    store.lastSentBlock = block;
    pi.sendMessage(boardMessage(block), { deliverAs: 'steer' });
  });
}

export function registerBoardContext(
  pi: ExtensionAPI,
  store: TodoStore,
  restoreAndRefresh: BoardLifecycle,
): void {
  pi.on('before_agent_start', (_event, ctx) => {
    restoreAndRefresh(ctx);
    const block = pendingBoardBlock(store);
    if (block === undefined) {
      return;
    }
    store.lastSentBlock = block;
    return { message: boardMessage(block) };
  });
}

// The block rides a session message instead of the system prompt: a volatile
// system prompt invalidates the cached prefix of the whole request.
function pendingBoardBlock(store: TodoStore): string | undefined {
  if (store.items.length === 0) {
    return undefined;
  }
  const block = formatBoardBlock(store.items);
  if (block === store.lastSentBlock) {
    return undefined;
  }
  return block;
}

function forgetSentBoardBlock(store: TodoStore): void {
  store.lastSentBlock = undefined;
}

function boardMessage(block: string): {
  customType: typeof BOARD_MESSAGE_TYPE;
  content: string;
  display: false;
} {
  return {
    customType: BOARD_MESSAGE_TYPE,
    content: block,
    display: false,
  };
}

function findSnapshotItems(
  branch: SessionBranch,
): readonly TodoItem[] | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type === 'custom' && entry.customType === SNAPSHOT_TYPE) {
      const items = readSnapshot(entry.data);
      if (items !== undefined) {
        return items;
      }
    }
  }
  return undefined;
}

function findToolResultItems(
  branch: SessionBranch,
): readonly TodoItem[] | undefined {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (entry?.type !== 'message') {
      continue;
    }
    const message = entry.message;
    if (message.role !== 'toolResult' || message.toolName !== TOOL_NAME) {
      continue;
    }
    const items = readSnapshot(message.details);
    if (items !== undefined) {
      return items;
    }
  }
  return undefined;
}

function readSnapshot(value: unknown): readonly TodoItem[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return undefined;
  }
  const parsed = parseTodoParams({
    action: TODO_ACTION.propose,
    items: value.items,
  });
  if (!parsed.ok || parsed.params.action !== TODO_ACTION.propose) {
    return undefined;
  }
  return parsed.params.items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
