import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  applyTodoParams,
  parseTodoParams,
  TODO_ACTION,
  type TodoAction,
  type TodoItem,
  type TodoToolParameters,
  UI_UNAVAILABLE,
} from './model.ts';

export interface TodoToolDetails {
  readonly action?: TodoAction;
  readonly items: readonly TodoItem[];
  readonly error?: string;
}

export interface TodoToolResult {
  readonly content: [{ readonly type: 'text'; readonly text: string }];
  readonly details: TodoToolDetails;
}

export function executeTodo(
  params: TodoToolParameters,
  ctx: Pick<ExtensionContext, 'mode'>,
  currentItems: readonly TodoItem[],
): TodoToolResult {
  const parsed = parseTodoParams(params);
  if (!parsed.ok) {
    return errorResult(parsed.message, currentItems);
  }
  if (parsed.params.action === TODO_ACTION.propose && ctx.mode !== 'tui') {
    return errorResult(UI_UNAVAILABLE, currentItems, parsed.params.action);
  }

  const applied = applyTodoParams(currentItems, parsed.params);
  if (!applied.ok) {
    return errorResult(applied.message, currentItems, parsed.params.action);
  }

  const itemCount = applied.items.length;
  return {
    content: [
      { type: 'text', text: successMessage(parsed.params.action, itemCount) },
    ],
    details: { action: parsed.params.action, items: applied.items },
  };
}

function successMessage(action: TodoAction, itemCount: number): string {
  if (action === TODO_ACTION.propose) {
    if (itemCount === 0) {
      return 'Board cleared';
    }
    return `Board proposed with ${String(itemCount)} item${itemCount === 1 ? '' : 's'}`;
  }
  return `Board updated (${String(itemCount)} item${itemCount === 1 ? '' : 's'})`;
}

function errorResult(
  error: string,
  items: readonly TodoItem[],
  action?: TodoToolDetails['action'],
): TodoToolResult {
  return {
    content: [{ type: 'text', text: error }],
    details: { action, items, error },
  };
}
