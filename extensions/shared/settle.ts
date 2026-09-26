import type {
  AgentBeforeSettleEvent,
  AgentBeforeSettleEventResult,
  InputEvent,
  InputSource,
} from '@earendil-works/pi-coding-agent';

const COMPLETED_OUTCOME = 'completed';
const USER_ROLE = 'user';
const CUSTOM_MESSAGE_ENTRY = 'custom_message';
const USER_INPUT_SOURCES: ReadonlySet<InputSource> = new Set([
  'interactive',
  'rpc',
]);

// A message typed while the agent runs joins the current run as a steer or
// follow-up; only input that arrives idle opens a new turn.
export function startsUserTurn(event: InputEvent): boolean {
  return (
    USER_INPUT_SOURCES.has(event.source) &&
    event.streamingBehavior === undefined
  );
}

// An aborted run is the user stopping the agent, an errored run has nothing
// worth reviewing, and a pending user message already decides what comes next.
export function acceptsSettleSteer(event: AgentBeforeSettleEvent): boolean {
  if (event.outcome !== COMPLETED_OUTCOME) {
    return false;
  }
  return !event.context.pendingMessages.some(
    (message) => message.role === USER_ROLE,
  );
}

// Handlers chain on agent_before_settle, so keep the entries earlier handlers
// proposed; replacing them would drop another extension's steer.
export function withHiddenSteer(
  event: AgentBeforeSettleEvent,
  customType: string,
  content: string,
): AgentBeforeSettleEventResult {
  return {
    entries: [
      ...event.entries,
      { type: CUSTOM_MESSAGE_ENTRY, customType, content, display: false },
    ],
    continue: true,
  };
}
