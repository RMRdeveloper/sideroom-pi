import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { startsUserTurn } from '../shared/settle.ts';
import {
  resolveCachedTestSetup,
  resolveCheckCommand,
} from './detect.ts';
import {
  type ResolveCommand,
  type ResolveTestSetup,
  registerDoneGuard,
} from './guard.ts';
import { createDoneState, resetDoneRun } from './model.ts';

export default function registerDone(pi: ExtensionAPI): void {
  const state = createDoneState();
  const resolveCommand: ResolveCommand = (
    ctx: Pick<ExtensionContext, 'cwd'>,
  ) => resolveCheckCommand(ctx.cwd);
  const resolveTestSetup: ResolveTestSetup = (
    ctx: Pick<ExtensionContext, 'cwd'>,
  ) => resolveCachedTestSetup(ctx.cwd);

  registerDoneGuard({ pi, state, resolveCommand, resolveTestSetup });

  pi.on('input', (event) => {
    if (startsUserTurn(event)) {
      resetDoneRun(state);
    }
  });

  pi.on('session_start', () => {
    resetDoneRun(state);
  });
}
