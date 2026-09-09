import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  shouldNudgePropose,
  shouldWatchdogUpdate,
  TOOL_NAME,
} from './model.ts';
import type { TodoStore } from './session.ts';

const NUDGE_TYPE = 'sideroom-todo-nudge';
const WATCHDOG_TYPE = 'sideroom-todo-watchdog';
const MUTATING_TOOL_NAMES = new Set(['write', 'edit', 'bash']);

interface TodoRunState {
  proposeNudgedThisRun: boolean;
  updateWatchdogThisTurn: boolean;
  turnMutated: boolean;
  turnCalledTodo: boolean;
  steerFromUs: boolean;
}

export function registerGuardEvents(
  pi: ExtensionAPI,
  store: TodoStore,
  restore: (ctx: ExtensionContext) => void,
): void {
  const runState = createTodoRunState();

  pi.on('input', (event) => {
    if (event.source === 'interactive' || event.source === 'rpc') {
      runState.proposeNudgedThisRun = false;
      runState.steerFromUs = false;
    }
  });

  pi.on('turn_start', () => resetTurnState(runState));

  pi.on('tool_execution_start', (event, ctx) => {
    if (event.toolName === TOOL_NAME) {
      runState.turnCalledTodo = true;
      return;
    }
    if (!MUTATING_TOOL_NAMES.has(event.toolName)) {
      return;
    }

    runState.turnMutated = true;
    restore(ctx);
    if (!shouldNudgePropose({ items: store.items, ...runState })) {
      return;
    }

    runState.proposeNudgedThisRun = true;
    sendSteer(
      pi,
      runState,
      NUDGE_TYPE,
      'Use sideroom_todo propose now to create the live board before continuing implementation.',
    );
  });

  pi.on('turn_end', (_event, ctx) => {
    restore(ctx);
    if (!shouldWatchdogUpdate({ items: store.items, ...runState })) {
      return;
    }

    runState.updateWatchdogThisTurn = true;
    sendSteer(
      pi,
      runState,
      WATCHDOG_TYPE,
      'Use sideroom_todo update to reflect this work before continuing to the next item.',
    );
  });
}

function createTodoRunState(): TodoRunState {
  return {
    proposeNudgedThisRun: false,
    updateWatchdogThisTurn: false,
    turnMutated: false,
    turnCalledTodo: false,
    steerFromUs: false,
  };
}

function resetTurnState(runState: TodoRunState): void {
  runState.turnMutated = false;
  runState.turnCalledTodo = false;
  runState.updateWatchdogThisTurn = false;
}

function sendSteer(
  pi: ExtensionAPI,
  runState: TodoRunState,
  customType: string,
  content: string,
): void {
  runState.steerFromUs = true;
  pi.sendMessage(
    { customType, content, display: false },
    { triggerTurn: true, deliverAs: 'steer' },
  );
}
