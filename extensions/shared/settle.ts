import type {
  AgentBeforeSettleEvent,
  AgentBeforeSettleEventResult,
  ExtensionAPI,
  ExtensionContext,
  InputEvent,
  InputSource,
} from '@earendil-works/pi-coding-agent';

const COMPLETED_OUTCOME = 'completed';
const CUSTOM_MESSAGE_ENTRY = 'custom_message';
const SETTLE_PRIORITY_EVENT = 'sideroom:settle-priority';

export const SETTLE_PRIORITY = { review: 0, done: 1, explain: 2 } as const;

interface SettlePriorityRequest {
  readonly ctx: ExtensionContext;
  readonly priorities: Set<number>;
}

interface SettleGuard {
  readonly priority: number;
  readonly pending: (ctx: ExtensionContext) => boolean;
  readonly handle: (
    event: AgentBeforeSettleEvent,
    ctx: ExtensionContext,
  ) => AgentBeforeSettleEventResult | undefined;
}
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

// Any queued message or an earlier handler's continuation still has work to
// run. Yield without consuming the guard's state until a quiet boundary.
export function acceptsSettleSteer(event: AgentBeforeSettleEvent): boolean {
  return (
    event.outcome === COMPLETED_OUTCOME &&
    !event.continue &&
    event.context.pendingMessages.length === 0
  );
}

// Pi gives each extension its own API object. Its synchronous event bus is
// shared, so ask which stages are pending rather than relying on load order
// or module-global state that would leak across sessions and reloads.
export function registerSettleGuard(
  pi: ExtensionAPI,
  guard: SettleGuard,
): void {
  pi.events.on(SETTLE_PRIORITY_EVENT, (payload) => {
    const request = payload as SettlePriorityRequest;
    if (guard.pending(request.ctx)) {
      request.priorities.add(guard.priority);
    }
  });

  pi.on('agent_before_settle', (event, ctx) => {
    if (!acceptsSettleSteer(event) || !guard.pending(ctx)) {
      return;
    }
    const request: SettlePriorityRequest = { ctx, priorities: new Set() };
    pi.events.emit(SETTLE_PRIORITY_EVENT, request);
    if ([...request.priorities].some((priority) => priority < guard.priority)) {
      return;
    }
    return guard.handle(event, ctx);
  });
}

// Handlers chain on agent_before_settle, so keep the entries earlier handlers
// proposed; replacing them would drop another extension's steer.
interface HiddenSteerOptions {
  readonly event: AgentBeforeSettleEvent;
  readonly customType: string;
  readonly content: string;
}

export function withHiddenSteer({
  event,
  customType,
  content,
}: HiddenSteerOptions): AgentBeforeSettleEventResult {
  return {
    entries: [
      ...event.entries,
      { type: CUSTOM_MESSAGE_ENTRY, customType, content, display: false },
    ],
    continue: true,
  };
}
