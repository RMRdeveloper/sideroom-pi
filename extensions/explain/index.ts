import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { appendExplainReminder } from './prompt.ts';

export default function registerExplain(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event) => ({
    systemPrompt: appendExplainReminder(event.systemPrompt),
  }));
}
