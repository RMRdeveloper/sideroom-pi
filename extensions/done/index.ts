import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { type CheckCommand, detectCheckCommand } from './detect.ts';
import { type ResolveCommand, registerDoneGuard } from './guard.ts';
import { createDoneState, resetDoneRun } from './model.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerDone(pi: ExtensionAPI): void {
  const state = createDoneState();
  const cache = new Map<string, CheckCommand | undefined>();
  const resolveCommand: ResolveCommand = (
    ctx: Pick<ExtensionContext, 'cwd'>,
  ) => {
    if (cache.has(ctx.cwd)) {
      return cache.get(ctx.cwd);
    }
    const command = detectCheckCommand(ctx.cwd);
    cache.set(ctx.cwd, command);
    return command;
  };

  registerDoneGuard(pi, state, resolveCommand);

  pi.on('input', (event) => {
    if (event.source === 'interactive' || event.source === 'rpc') {
      resetDoneRun(state);
    }
  });

  pi.on('session_start', () => {
    resetDoneRun(state);
  });
}
