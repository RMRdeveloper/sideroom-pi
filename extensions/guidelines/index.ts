import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  createGuidelineReadState,
  registerGuidelineGuard,
  resetGuidelineReadState,
} from './guard.ts';
import { appendGuidelinesReminder } from './prompt.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerGuidelines(pi: ExtensionAPI): void {
  const readState = createGuidelineReadState();
  registerGuidelineGuard(pi, readState);

  pi.on('before_agent_start', (event) => {
    resetGuidelineReadState(readState);
    const systemPrompt = appendGuidelinesReminder(event.systemPrompt);
    if (systemPrompt === event.systemPrompt) {
      return;
    }
    return { systemPrompt };
  });

  // Compaction may summarize the loaded guides out of context mid-run; force
  // a fresh read instead of trusting a now-stale in-memory flag.
  pi.on('session_compact', () => {
    resetGuidelineReadState(readState);
  });
}
