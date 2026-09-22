import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import registerJev from './index.ts';
import { configPathFor, JEV_KEY_ENV_VAR, storeApiKey } from './key.ts';

const AGENT_DIR_ENV_VAR = 'PI_CODING_AGENT_DIR';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Shortcut {
  readonly name: string;
  readonly handler: (ctx: ExtensionContext) => void;
}

interface Registered {
  readonly handlers: Map<string, EventHandler>;
  readonly shortcuts: readonly Shortcut[];
  readonly statuses: (string | undefined)[];
  readonly notifications: string[];
  readonly ctx: ExtensionContext;
}

function register(): Registered {
  const handlers = new Map<string, EventHandler>();
  const shortcuts: Shortcut[] = [];
  const statuses: (string | undefined)[] = [];
  const notifications: string[] = [];
  const ctx = {
    mode: 'tui',
    ui: {
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
      notify(message: string) {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    registerShortcut(
      name: string,
      options: { handler: (context: ExtensionContext) => void },
    ) {
      shortcuts.push({ name, handler: options.handler });
    },
  } as unknown as ExtensionAPI;

  registerJev(api);
  return { handlers, shortcuts, statuses, notifications, ctx };
}

function withAgentDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-jev-index-'));
  const previousDirectory = process.env[AGENT_DIR_ENV_VAR];
  const previousKey = process.env[JEV_KEY_ENV_VAR];
  process.env[AGENT_DIR_ENV_VAR] = directory;
  delete process.env[JEV_KEY_ENV_VAR];

  try {
    run(directory);
  } finally {
    restoreEnvironment(AGENT_DIR_ENV_VAR, previousDirectory);
    restoreEnvironment(JEV_KEY_ENV_VAR, previousKey);
    rmSync(directory, { recursive: true, force: true });
  }
}

function restoreEnvironment(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = previous;
}

function settle(registered: Registered): void {
  const sessionStart = registered.handlers.get('session_start');
  assert.ok(sessionStart);
  sessionStart({} as never, registered.ctx as never);
}

test('reports no key when nothing is configured', () => {
  withAgentDirectory(() => {
    const registered = register();
    settle(registered);
    assert.deepEqual(registered.statuses, ['jev: no key (F10)']);
  });
});

test('reports ready when the key comes from the environment', () => {
  withAgentDirectory(() => {
    process.env[JEV_KEY_ENV_VAR] = 'environment-key';
    const registered = register();
    settle(registered);
    assert.deepEqual(registered.statuses, ['jev: ready']);
  });
});

test('reports ready when the key is stored in sideroom.json', () => {
  withAgentDirectory((directory) => {
    storeApiKey(configPathFor(directory), 'stored-key');
    const registered = register();
    settle(registered);
    assert.deepEqual(registered.statuses, ['jev: ready']);
  });
});

test('registers the F10 capture screen', () => {
  withAgentDirectory(() => {
    const registered = register();
    assert.deepEqual(
      registered.shortcuts.map((shortcut) => shortcut.name),
      ['f10'],
    );
  });
});

test('sends a non-terminal user to the environment variable', () => {
  withAgentDirectory(() => {
    const registered = register();
    const shortcut = registered.shortcuts[0];
    assert.ok(shortcut);

    const headless = {
      mode: 'rpc',
      ui: {
        notify(message: string) {
          registered.notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;

    shortcut.handler(headless);
    assert.equal(registered.notifications.length, 1);
    assert.match(registered.notifications[0] ?? '', /TYPESAFE_API_KEY/);
  });
});

test('picks up a key stored while the session is already running', () => {
  withAgentDirectory((directory) => {
    const registered = register();
    settle(registered);
    assert.deepEqual(registered.statuses, ['jev: no key (F10)']);

    storeApiKey(configPathFor(directory), 'stored-later');
    settle(registered);
    assert.deepEqual(registered.statuses, ['jev: no key (F10)', 'jev: ready']);
  });
});
