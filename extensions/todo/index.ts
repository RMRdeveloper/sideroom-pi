import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { executeTodo, type TodoToolDetails } from './execute.ts';
import { registerGuardEvents } from './guards.ts';
import { TOOL_NAME, TodoParamsSchema } from './model.ts';
import {
  type BoardLifecycle,
  commitBoard,
  createTodoStore,
  registerBoardContext,
  registerSessionRefreshEvents,
  restoreAndRefreshBoard,
  restoreBoard,
  type TodoStore,
} from './session.ts';

export const TODO_DESCRIPTION =
  'Maintain a live, user-visible work board. propose replaces the full board; update patches existing items by id.';

export const TODO_PROMPT_SNIPPET =
  'Maintain the live work board with propose and update.';

export const TODO_PROMPT_GUIDELINES = [
  'Use sideroom_todo to maintain a live work board when implementation has more than one step.',
  'Use propose to replace the board and update to patch item ids. While any item is pending, exactly one must be in_progress.',
  'Complete the current item and start the next item in the same update call.',
  'propose is interactive-TUI-only; update also works in print, JSON, and RPC modes.',
];

// Pi loads extensions/*/index.ts through export default.
export default function registerTodo(pi: ExtensionAPI): void {
  const store = createTodoStore();
  const restore: BoardLifecycle = (ctx) => {
    restoreBoard(store, ctx);
  };
  const restoreAndRefresh: BoardLifecycle = (ctx) => {
    restoreAndRefreshBoard(store, ctx);
  };

  registerSessionRefreshEvents(pi, restoreAndRefresh);
  registerGuardEvents(pi, store, restore);
  registerBoardContext(pi, store, restoreAndRefresh);
  registerTodoTool(pi, store);
}

function registerTodoTool(pi: ExtensionAPI, store: TodoStore): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: 'Sideroom Todo',
    description: TODO_DESCRIPTION,
    promptSnippet: TODO_PROMPT_SNIPPET,
    promptGuidelines: TODO_PROMPT_GUIDELINES,
    parameters: TodoParamsSchema,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = executeTodo(params, ctx, store.items);
      if (result.details.error !== undefined) {
        return result;
      }

      commitBoard(store, pi, ctx, result.details.items);
      return result;
    },
    renderCall(args, theme) {
      const text = `${theme.fg('toolTitle', theme.bold(`${TOOL_NAME} `))}${theme.fg('muted', args.action)}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as TodoToolDetails | undefined;
      if (details?.error !== undefined) {
        return new Text(theme.fg('error', details.error), 0, 0);
      }
      const text = result.content[0];
      return new Text(
        theme.fg('success', text?.type === 'text' ? text.text : ''),
        0,
        0,
      );
    },
  });
}
