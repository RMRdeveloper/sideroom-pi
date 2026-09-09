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
export const WIDGET_KEY = 'sideroom-todo';

export interface TodoStore {
  items: readonly TodoItem[];
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
  restoreAndRefresh: BoardLifecycle,
): void {
  pi.on('session_start', (_event, ctx) => restoreAndRefresh(ctx));
  pi.on('session_tree', (_event, ctx) => restoreAndRefresh(ctx));
  pi.on('session_compact', (_event, ctx) => restoreAndRefresh(ctx));
}

export function registerBoardContext(
  pi: ExtensionAPI,
  store: TodoStore,
  restoreAndRefresh: BoardLifecycle,
): void {
  pi.on('before_agent_start', (event, ctx) => {
    restoreAndRefresh(ctx);
    if (store.items.length === 0) {
      return;
    }
    return {
      systemPrompt: `${event.systemPrompt}\n\n${formatBoardBlock(store.items)}`,
    };
  });
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
