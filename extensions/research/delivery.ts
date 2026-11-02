import type { ExtensionAPI, ExtensionToolContext } from '@earendil-works/pi-coding-agent';

export const RESEARCH_RESULT_MESSAGE = 'sideroom-research-result';
const RETRY_MS = 5_000;

type ResearchMessage = { customType: typeof RESEARCH_RESULT_MESSAGE; content: string; display: boolean; details: { id: string; outcome?: unknown; usage?: unknown; error?: string } };
type PendingDelivery = { message: ResearchMessage; ctx: Pick<ExtensionToolContext, 'isIdle'> };

export function createResearchDelivery(pi: Pick<ExtensionAPI, 'sendMessage'>) {
  const pending: PendingDelivery[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = false;

  function scheduleRetry(): void {
    if (timer !== undefined || pending.length === 0) {
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      const current = pending[0];
      if (current === undefined) {
        return;
      }
      if (current.ctx.isIdle()) {
        sent = false;
        sendCurrent();
      }
      scheduleRetry();
    }, RETRY_MS);
    timer.unref();
  }

  function sendCurrent(): void {
    const current = pending[0];
    if (current === undefined || sent) {
      return;
    }
    sent = true;
    try {
      pi.sendMessage(current.message, { triggerTurn: true, deliverAs: 'steer' });
    } catch (error) {
      sent = false;
      console.error('Research delivery failed; it will be retried in this session.', error);
    }
    scheduleRetry();
  }

  return {
    enqueue(delivery: PendingDelivery): void {
      pending.push(delivery);
      sendCurrent();
    },
    acknowledge(id: string): void {
      if (pending[0]?.message.details.id !== id) {
        return;
      }
      pending.shift();
      sent = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      sendCurrent();
    },
    retry(): void {
      sendCurrent();
    },
    clear(): void {
      pending.length = 0;
      sent = false;
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
