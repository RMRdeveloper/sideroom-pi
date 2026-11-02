import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { calculateContextTokens, DEFAULT_COMPACTION_SETTINGS, estimateTokens } from '@earendil-works/pi-coding-agent';

export const CONTEXT_FINALIZATION = 'The model context is nearly full. Stop investigating and return a partial report now using the evidence already gathered. Explain what remains unverified.';

export function researchContextTokens(messages: readonly AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.stopReason !== 'error' && message.stopReason !== 'aborted' && message.usage && calculateContextTokens(message.usage) > 0) {
      return calculateContextTokens(message.usage) + messages.slice(index + 1).reduce((total, next) => total + estimateTokens(next), 0);
    }
  }
  return messages.reduce((total, message) => total + estimateTokens(message), 0);
}

export function shouldFinishResearch(messages: readonly AgentMessage[], contextWindow: number): boolean {
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) {
    return false;
  }
  const reserve = Math.min(DEFAULT_COMPACTION_SETTINGS.reserveTokens, Math.floor(contextWindow / 4));
  return researchContextTokens(messages) >= contextWindow - reserve;
}
