import type { AgentMessage } from '@earendil-works/pi-agent-core';

type AssistantMessage = Extract<AgentMessage, { role: 'assistant' }>;
export type ResearchUsage = AssistantMessage['usage'];

export function sumResearchUsage(messages: readonly AgentMessage[]): ResearchUsage | undefined {
  let total: ResearchUsage | undefined;
  for (const message of messages) {
    if (message.role !== 'assistant' || message.usage === undefined) {
      continue;
    }
    const usage = message.usage;
    if (total === undefined) {
      total = { ...usage, cost: { ...usage.cost } };
      continue;
    }
    total = {
      input: total.input + usage.input,
      output: total.output + usage.output,
      cacheRead: total.cacheRead + usage.cacheRead,
      cacheWrite: total.cacheWrite + usage.cacheWrite,
      totalTokens: total.totalTokens + usage.totalTokens,
      cost: {
        input: total.cost.input + usage.cost.input,
        output: total.cost.output + usage.cost.output,
        cacheRead: total.cost.cacheRead + usage.cost.cacheRead,
        cacheWrite: total.cost.cacheWrite + usage.cost.cacheWrite,
        total: total.cost.total + usage.cost.total,
      },
    };
  }
  return total;
}
