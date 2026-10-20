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
const SETTLE_SUPPLEMENT_EVENT = 'sideroom:settle-supplement';
const SETTLE_WAIT_EVENT = 'sideroom:settle-wait';

interface SettleWaitRequest {
  readonly ctx: ExtensionContext;
  readonly waits: Promise<void>[];
}

export function registerSettleWait(
  pi: ExtensionAPI,
  wait: (ctx: ExtensionContext) => Promise<void>,
): void {
  pi.events.on(SETTLE_WAIT_EVENT, (payload) => {
    const request = payload as SettleWaitRequest;
    request.waits.push(wait(request.ctx));
  });
  pi.on('agent_before_settle', async (event, ctx) => {
    if (acceptsSettleSteer(event)) {
      await wait(ctx);
    }
  });
}

async function waitForSettle(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const request: SettleWaitRequest = { ctx, waits: [] };
  pi.events.emit(SETTLE_WAIT_EVENT, request);
  await Promise.all(request.waits);
}

export const SETTLE_PRIORITY = { review: 0, persona: 1, done: 2 } as const;

interface SettleSupplement {
  readonly customType: string;
  readonly content: string;
}

interface SettleSupplementRequest {
  readonly ctx: ExtensionContext;
  readonly messages: SettleSupplement[];
}

export function registerSettleSupplement(
  pi: ExtensionAPI,
  prepare: (ctx: ExtensionContext) => SettleSupplement | undefined,
): void {
  pi.events.on(SETTLE_SUPPLEMENT_EVENT, (payload) => {
    const request = payload as SettleSupplementRequest;
    const message = prepare(request.ctx);
    if (message !== undefined) {
      request.messages.push(message);
    }
  });
}

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

export function startsUserTurn(event: InputEvent): boolean {
  return (
    USER_INPUT_SOURCES.has(event.source) &&
    event.streamingBehavior === undefined
  );
}

export function acceptsSettleSteer(event: AgentBeforeSettleEvent): boolean {
  return (
    event.outcome === COMPLETED_OUTCOME &&
    !event.continue &&
    event.context.pendingMessages.length === 0
  );
}

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

  pi.on('agent_before_settle', async (event, ctx) => {
    if (!acceptsSettleSteer(event)) {
      return;
    }
    await waitForSettle(pi, ctx);
    if (ctx.signal?.aborted || ctx.hasPendingMessages() || !acceptsSettleSteer(event) || !guard.pending(ctx)) {
      return;
    }
    const request: SettlePriorityRequest = { ctx, priorities: new Set() };
    pi.events.emit(SETTLE_PRIORITY_EVENT, request);
    if ([...request.priorities].some((priority) => priority < guard.priority)) {
      return;
    }
    const continuation = guard.handle(event, ctx);
    if (!continuation?.continue) {
      return continuation;
    }
    const supplements: SettleSupplementRequest = { ctx, messages: [] };
    pi.events.emit(SETTLE_SUPPLEMENT_EVENT, supplements);
    return {
      ...continuation,
      entries: [
        ...(continuation.entries ?? event.entries),
        ...supplements.messages.map(
          (message) =>
            ({
              type: CUSTOM_MESSAGE_ENTRY,
              ...message,
              display: false,
            }) as const,
        ),
      ],
    };
  });
}

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
