import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { appendGuidelinesReminder } from './prompt.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerGuidelines(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (event) => {
    const systemPrompt = appendGuidelinesReminder(event.systemPrompt);
    if (systemPrompt === event.systemPrompt) {
      return;
    }
    return { systemPrompt };
  });
}
