import {
  type ExtensionAPI,
  type ExtensionContext,
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import { startsUserTurn } from '../shared/settle.ts';
import { TODO_STATUS } from './model.ts';
import type { TodoStore } from './session.ts';

const REMINDER_TYPE = 'sideroom-todo-reminder';

export function registerGuardEvents(
  pi: ExtensionAPI,
  store: TodoStore,
  restore: (ctx: ExtensionContext) => void,
): void {
  let remindedThisTurn = false;

  pi.on('input', (event) => {
    if (startsUserTurn(event)) {
      remindedThisTurn = false;
    }
  });
  pi.on('session_start', () => {
    remindedThisTurn = false;
  });

  pi.on('tool_result', (event, ctx) => {
    if (
      remindedThisTurn ||
      event.isError ||
      (!isWriteToolResult(event) && !isEditToolResult(event))
    ) {
      return;
    }
    restore(ctx);
    if (store.items.length === 0 && ctx.mode !== 'tui') {
      return;
    }
    if (
      store.items.length > 0 &&
      !store.items.some(
        (item) =>
          item.status === TODO_STATUS.pending ||
          item.status === TODO_STATUS.inProgress,
      )
    ) {
      return;
    }

    remindedThisTurn = true;
    pi.sendMessage(
      {
        customType: REMINDER_TYPE,
        content:
          store.items.length === 0
            ? 'Use sideroom_todo propose if this implementation has multiple steps. Maintain the board at task milestones, not after every tool call.'
            : 'Update sideroom_todo when a task changes status, combining completion and the next task in one call. Do not update merely because a tool ran.',
        display: false,
      },
      { triggerTurn: false, deliverAs: 'steer' },
    );
  });
}
