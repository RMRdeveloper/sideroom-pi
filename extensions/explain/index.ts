import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerExplainGuard } from './guard.ts';
import { createExplainState, resetExplainTurn } from './model.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerExplain(pi: ExtensionAPI): void {
  const state = createExplainState();
  registerExplainGuard(pi, state);

  pi.on('session_start', () => resetExplainTurn(state));
}
