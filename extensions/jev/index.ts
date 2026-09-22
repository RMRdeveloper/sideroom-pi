import {
  type ExtensionAPI,
  type ExtensionContext,
  getAgentDir,
} from '@earendil-works/pi-coding-agent';
import { createFetchTransport } from './client.ts';
import {
  createJevGuardState,
  guardStatus,
  JEV_STATUS,
  type JevStatus,
  registerJevGuard,
  resetJevGuard,
  resetJevUsage,
} from './guard.ts';
import {
  clearStoredKey,
  configPathFor,
  resolveApiKey,
  storeApiKey,
} from './key.ts';
import {
  createJevKeyController,
  JEV_SHORTCUT,
  JEV_STATUS_KEY,
  statusLabel,
} from './ui.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerJev(pi: ExtensionAPI): void {
  const configPath = configPathFor(getAgentDir());
  const guardState = createJevGuardState();

  // The key is read on each use instead of cached at load time, so a key stored
  // during a running session takes effect without a restart.
  const readKey = () => resolveApiKey(process.env, configPath);

  const currentStatus = (): JevStatus => {
    if (readKey() === undefined) {
      return JEV_STATUS.noKey;
    }
    return guardStatus(guardState);
  };

  const publish = (status: JevStatus, ctx: ExtensionContext): void => {
    ctx.ui.setStatus(
      JEV_STATUS_KEY,
      statusLabel(status, guardState.lastModel, guardState.calls),
    );
  };

  const keyController = createJevKeyController({
    store: (apiKey) => {
      storeApiKey(configPath, apiKey);
    },
    clear: () => {
      clearStoredKey(configPath);
    },
    retry: () => {
      resetJevGuard(guardState);
    },
    origin: () => readKey()?.origin,
    usage: () => guardState.calls,
    refresh: (ctx) => {
      publish(currentStatus(), ctx);
    },
  });

  registerJevGuard(pi, guardState, {
    apiKey: () => readKey()?.key,
    transport: createFetchTransport(),
    report: (status, ctx) => {
      publish(status, ctx);
    },
  });

  pi.on('session_start', (_event, ctx) => {
    resetJevUsage(guardState);
    publish(currentStatus(), ctx);
  });

  pi.registerShortcut(JEV_SHORTCUT, {
    description: 'Set or clear the Jev API key',
    handler: (ctx) => {
      keyController.open(ctx);
    },
  });
}
