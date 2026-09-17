import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  type CheckCommand,
  detectCheckCommand,
  hasTestSetup,
} from './detect.ts';
import {
  type ResolveCommand,
  type ResolveTestSetup,
  registerDoneGuard,
} from './guard.ts';
import { createDoneState, resetDoneRun } from './model.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerDone(pi: ExtensionAPI): void {
  const state = createDoneState();
  const cache = new Map<string, CheckCommand | undefined>();
  const testCache = new Map<string, boolean>();
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
  const resolveTestSetup: ResolveTestSetup = (
    ctx: Pick<ExtensionContext, 'cwd'>,
  ) => {
    const cached = testCache.get(ctx.cwd);
    if (cached !== undefined) {
      return cached;
    }
    const hasTests = hasTestSetup(ctx.cwd);
    testCache.set(ctx.cwd, hasTests);
    return hasTests;
  };

  registerDoneGuard(pi, state, resolveCommand, resolveTestSetup);

  pi.on('input', (event) => {
    if (event.source === 'interactive' || event.source === 'rpc') {
      resetDoneRun(state);
    }
  });

  pi.on('session_start', () => {
    resetDoneRun(state);
  });
}
