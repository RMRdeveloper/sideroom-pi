import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  createRulesState,
  registerRulesGuard,
  resetRulesState,
} from './guard.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerRules(pi: ExtensionAPI): void {
  const state = createRulesState();
  registerRulesGuard(pi, state);

  pi.on('input', (event) => {
    if (event.source === 'interactive' || event.source === 'rpc') {
      resetRulesState(state);
    }
  });

  pi.on('session_compact', () => {
    resetRulesState(state);
  });
}
