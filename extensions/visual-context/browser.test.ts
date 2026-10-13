import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const id = 'a'.repeat(32);
const address = `ws://127.0.0.1:1234/sideroom-visual-context#${'b'.repeat(64)}`;
const first = {
  id: 'first',
  revision: 'r1',
  name: 'Demo',
  project: '/projects/demo',
  environment: 'WSL',
};
const second = {
  id: 'second',
  revision: 'r2',
  name: 'Sideroom',
  project: '/projects/sideroom',
  environment: 'Windows',
};
const popup = { id, url: `chrome-extension://${id}/popup.html` };
const pageSender = {
  id,
  url: 'http://localhost/account?private=1',
  tab: { id: 4, url: 'http://localhost/account?private=1' },
};

function loadCompanion(stored: Record<string, unknown> = {}) {
  const script = readFileSync(
    new URL(
      '../../assets/visual-context/browser/background.js',
      import.meta.url,
    ),
    'utf8',
  );
  const sockets: { sent: Record<string, unknown>[]; close(): void }[] = [];
  const notices: unknown[] = [];
  const injections: unknown[] = [];
  const badges = new Map<number | undefined, string>();
  const titles = new Map<number | undefined, string>();
  let command:
    | ((name: string, tab?: typeof pageSender.tab) => Promise<void> | undefined)
    | undefined;
  let navigation:
    | ((tabId: number, change: { status: string }) => void)
    | undefined;
  let alarm: ((alarm: { name: string }) => void) | undefined;
  let available = [first];
  const installations = new Map<string, typeof available>();
  let accessLevel = '';
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    sent: Record<string, unknown>[] = [];
    readonly endpoint: string;
    onopen?: () => void;
    onclose?: () => void;
    onmessage?: (event: { data: string }) => void;
    constructor(endpoint: string) {
      this.endpoint = endpoint;
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(source: string) {
      const message = JSON.parse(source);
      this.sent.push(message);
      if (message.type === 'authenticate') {
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify({
              type: 'ready',
              version: 2,
              sessions: installations.get(this.endpoint) ?? available,
            }),
          }),
        );
      }
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  const chrome = {
    runtime: {
      id,
      getURL: (path: string) => `chrome-extension://${id}/${path}`,
      onMessage: { addListener() {} },
    },
    commands: {
      onCommand: {
        addListener(listener: typeof command) {
          command = listener;
        },
      },
      getAll: async () => [
        { name: 'toggle-inspector', shortcut: 'Alt+Shift+S' },
      ],
    },
    action: {
      setBadgeBackgroundColor: async () => undefined,
      setBadgeText: async (options: { tabId?: number; text: string }) => {
        badges.set(options.tabId, options.text);
      },
      setTitle: async (options: { tabId?: number; title: string }) => {
        titles.set(options.tabId, options.title);
      },
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: {
        addListener(listener: typeof navigation) {
          navigation = listener;
        },
      },
      query: async () => [pageSender.tab],
      sendMessage: async (_tab: number, message: unknown) => {
        notices.push(message);
      },
    },
    scripting: {
      executeScript: async (options: {
        target: { tabId: number };
        files: string[];
      }): Promise<void> => {
        injections.push(options);
      },
    },
    alarms: {
      create: async () => undefined,
      clear: async () => undefined,
      onAlarm: {
        addListener(listener: typeof alarm) {
          alarm = listener;
        },
      },
    },
    storage: {
      local: {
        setAccessLevel: async (options: { accessLevel: string }) => {
          accessLevel = options.accessLevel;
        },
        get: async () => stored,
        set: async (values: Record<string, unknown>) => {
          Object.assign(stored, values);
        },
        remove: async (keys: string | string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) {
            delete stored[key];
          }
        },
      },
    },
  };
  const companion = runInNewContext(
    `${script}\n({ parsePairingAddress, handleMessage, updateSessions, initialized, reconnectAll: () => Promise.all([...connections.values()].map(reconnect)) })`,
    {
      chrome,
      console,
      URL,
      Set,
      Map,
      WebSocket: FakeSocket,
      queueMicrotask,
      setTimeout: () => 1,
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
    },
  );
  return {
    companion,
    chrome,
    sockets,
    notices,
    injections,
    badges,
    titles,
    command: (name = 'toggle-inspector', tab?: typeof pageSender.tab) =>
      command?.(name, tab),
    navigate: async (tabId = pageSender.tab.id) => {
      navigation?.(tabId, { status: 'loading' });
      await new Promise<void>((resolve) => setImmediate(resolve));
    },
    stored,
    accessLevel: () => accessLevel,
    setAvailable: (sessions: typeof available) => {
      available = sessions;
    },
    setInstallation: (endpoint: string, sessions: typeof available) =>
      installations.set(endpoint, sessions),
    alarm: () => alarm?.({ name: 'sideroom-reconnect' }),
  };
}

test('browser pairing rejects non-local destinations and credentials in the network URL', () => {
  const { companion } = loadCompanion();
  assert.equal(
    companion.parsePairingAddress(address).endpoint,
    'ws://127.0.0.1:1234/sideroom-visual-context',
  );
  for (const candidate of [
    address.replace('127.0.0.1', 'example.com'),
    address.replace('127.0.0.1', 'user:pass@localhost'),
    address.replace('#', '?token=private#'),
    'ws://localhost:1234/sideroom-visual-context#short',
  ]) {
    assert.throws(() => companion.parsePairingAddress(candidate));
  }
});

test('popup messages work in an extension tab, while pages and other extensions cannot control pairing', async () => {
  const { companion } = loadCompanion();
  assert.equal(
    (await companion.handleMessage({ action: 'status' }, popup)).connected,
    false,
  );
  assert.equal(
    (
      await companion.handleMessage(
        { action: 'status' },
        { ...popup, tab: { id: 1 } },
      )
    ).ok,
    true,
  );
  await assert.rejects(
    companion.handleMessage({ action: 'connect', address }, pageSender),
  );
  await assert.rejects(
    companion.handleMessage({ action: 'status' }, { id: 'other-extension' }),
  );
});

test('authorization survives worker/browser restart, reconnects automatically, and is restricted to trusted extension contexts', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.stored.pairingAddresses)), [
    address,
  ]);
  assert.equal(setup.accessLevel(), 'TRUSTED_CONTEXTS');
  assert.equal(setup.sockets[0]?.sent[0]?.role, 'browser');
  const restarted = loadCompanion(setup.stored);
  await restarted.companion.initialized;
  await restarted.companion.reconnectAll();
  const status = await restarted.companion.handleMessage(
    { action: 'status' },
    popup,
  );
  assert.equal(status.connected, true);
  assert.equal(status.selectedId, first.id);
  restarted.sockets[0]?.close();
  restarted.alarm();
  await restarted.companion.reconnectAll();
  assert.equal(
    (await restarted.companion.handleMessage({ action: 'status' }, popup))
      .connected,
    true,
  );
  assert.equal(restarted.sockets.length, 2);
});

test('multiple sessions require a choice, route selections to that session and stop old inspectors on branch changes', async () => {
  const setup = loadCompanion();
  setup.setAvailable([first, second]);
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  assert.equal(
    (await setup.companion.handleMessage({ action: 'status' }, popup))
      .selectedId,
    '',
  );
  await assert.rejects(
    setup.companion.handleMessage({ action: 'inspect' }, popup),
  );
  await setup.companion.handleMessage(
    { action: 'choose', id: second.id },
    popup,
  );
  await setup.companion.handleMessage({ action: 'inspect' }, popup);
  await setup.companion.handleMessage(
    { action: 'selection', selection: { id: 'click-1' } },
    pageSender,
  );
  const sent = setup.sockets[0]?.sent.at(-1);
  assert.ok(sent);
  assert.deepEqual(JSON.parse(JSON.stringify(sent?.target)), second);
  assert.equal(
    (sent.selection as { page: string }).page,
    'http://localhost/account',
  );
  setup.companion.updateSessions([
    { ...second, revision: 'new-branch' },
    first,
  ]);
  await assert.rejects(
    setup.companion.handleMessage(
      { action: 'selection', selection: { id: 'late-click' } },
      pageSender,
    ),
  );
  assert.ok(
    setup.notices.some(
      (notice) => (notice as { action: string }).action === 'stop',
    ),
  );
  setup.companion.updateSessions([first]);
  assert.equal(
    (await setup.companion.handleMessage({ action: 'status' }, popup))
      .selectedId,
    '',
  );
  setup.companion.updateSessions([first, second]);
  assert.equal(
    (await setup.companion.handleMessage({ action: 'status' }, popup))
      .selectedId,
    second.id,
  );
});

test('disconnect pauses automatic reconnect without forgetting, and Forget authorization removes it', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.companion.handleMessage({ action: 'disconnect' }, popup);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.stored.pairingAddresses)), [
    address,
  ]);
  const paused = loadCompanion(setup.stored);
  await paused.companion.initialized;
  await paused.companion.reconnectAll();
  assert.equal(paused.sockets.length, 0);
  await paused.companion.handleMessage({ action: 'forget' }, popup);
  assert.equal(paused.stored.pairingAddresses, undefined);
});

test('published companion uses explicit tab access and wake-up alarms without project or remote service integration', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../../assets/visual-context/browser/manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.deepEqual(manifest.permissions, [
    'activeTab',
    'scripting',
    'storage',
    'alarms',
  ]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(
    manifest.commands['toggle-inspector'].suggested_key,
    'Alt+Shift+S',
  );
  assert.notEqual(manifest.commands['toggle-inspector'].global, true);
});

test('remembers independent Windows and WSL installations, merges destinations and uses the selected installation socket', async () => {
  const setup = loadCompanion();
  const windowsAddress = address.replace(':1234/', ':1235/');
  setup.setInstallation('ws://127.0.0.1:1235/sideroom-visual-context', [
    second,
  ]);
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.companion.handleMessage(
    { action: 'connect', address: windowsAddress },
    popup,
  );
  const status = await setup.companion.handleMessage(
    { action: 'status' },
    popup,
  );
  assert.equal(status.installations, 2);
  assert.equal(status.sessions.length, 2);
  assert.equal(status.selectedId, '');
  assert.deepEqual(JSON.parse(JSON.stringify(setup.stored.pairingAddresses)), [
    address,
    windowsAddress,
  ]);
  await setup.companion.handleMessage(
    { action: 'choose', id: second.id },
    popup,
  );
  await setup.companion.handleMessage({ action: 'inspect' }, popup);
  await setup.companion.handleMessage(
    { action: 'selection', selection: { id: 'windows-click' } },
    pageSender,
  );
  assert.equal(
    setup.sockets[0]?.sent.some((message) => message.type === 'selection'),
    false,
  );
  const routed = setup.sockets[1]?.sent.at(-1);
  assert.ok(routed);
  assert.equal((routed.target as { id: string }).id, second.id);
  const restarted = loadCompanion(setup.stored);
  restarted.setInstallation('ws://127.0.0.1:1235/sideroom-visual-context', [
    second,
  ]);
  await restarted.companion.initialized;
  await restarted.companion.reconnectAll();
  assert.equal(restarted.sockets.length, 2);
  assert.equal(
    (await restarted.companion.handleMessage({ action: 'status' }, popup))
      .sessions.length,
    2,
  );
});

test('shortcut selects multiple elements without opening the popup, then cancels without disconnecting', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  setup.chrome.commands.getAll = async () => [
    { name: 'toggle-inspector', shortcut: 'Ctrl+Shift+Y' },
  ];
  await setup.command();
  assert.equal(setup.injections.length, 1);
  assert.equal(setup.badges.get(4), 'ON');
  assert.match(setup.titles.get(4) ?? '', /Escape/u);
  assert.equal(
    (setup.notices.at(-1) as { shortcut: string }).shortcut,
    'Ctrl+Shift+Y',
  );
  for (const selectionId of ['click-1', 'click-2']) {
    await setup.companion.handleMessage(
      { action: 'selection', selection: { id: selectionId } },
      pageSender,
    );
  }
  assert.equal(
    setup.sockets[0]?.sent.filter((message) => message.type === 'selection')
      .length,
    2,
  );
  assert.equal(setup.badges.get(4), 'ON');
  await setup.command();
  assert.equal(setup.injections.length, 1);
  assert.equal((setup.notices.at(-1) as { action: string }).action, 'stop');
  assert.equal(setup.badges.get(4), '');
  await assert.rejects(
    setup.companion.handleMessage(
      { action: 'selection', selection: { id: 'late' } },
      pageSender,
    ),
  );
  assert.equal(
    (await setup.companion.handleMessage({ action: 'status' }, popup))
      .connected,
    true,
  );
});

test('rapid shortcuts serialize activation and cancellation, including an inspector started from the popup', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await Promise.all([setup.command(), setup.command()]);
  assert.equal(setup.injections.length, 1);
  assert.equal(setup.badges.get(4), '');
  await setup.companion.handleMessage({ action: 'inspect' }, popup);
  await setup.command();
  assert.equal(setup.injections.length, 2);
  assert.equal(setup.badges.get(4), '');
  await setup.command('unregistered-command');
  assert.equal(setup.injections.length, 2);
});

test('Escape reports, navigation, destination changes and disconnect clear active indicators', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.command();
  await setup.companion.handleMessage({ action: 'stopped' }, pageSender);
  assert.equal(setup.badges.get(4), '');
  await setup.command();
  assert.equal(setup.badges.get(4), 'ON');
  await setup.navigate();
  assert.equal(setup.badges.get(4), '');
  await setup.command();
  setup.companion.updateSessions([{ ...first, revision: 'changed' }]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(setup.badges.get(4), '');
  await setup.command();
  await setup.companion.handleMessage({ action: 'disconnect' }, popup);
  assert.equal(setup.badges.get(4), '');
});

test('shortcut uses the command tab and does not cancel selection in another tab', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.command('toggle-inspector', pageSender.tab);
  const otherTab = { id: 5, url: 'https://example.com/' };
  await setup.command('toggle-inspector', otherTab);
  assert.equal(setup.badges.get(4), 'ON');
  assert.equal(setup.badges.get(5), 'ON');
  await setup.command('toggle-inspector', otherTab);
  assert.equal(setup.badges.get(4), 'ON');
  assert.equal(setup.badges.get(5), '');
});

test('shortcut reports missing pairing or ambiguous destinations without injecting or silently choosing', async () => {
  const setup = loadCompanion();
  await setup.command();
  assert.equal(setup.badges.get(4), '!');
  assert.equal(setup.injections.length, 0);
  assert.match(setup.titles.get(4) ?? '', /Open the Sideroom extension/u);
  setup.setAvailable([first, second]);
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.command();
  assert.equal(setup.injections.length, 0);
  assert.equal(
    (await setup.companion.handleMessage({ action: 'status' }, popup))
      .selectedId,
    '',
  );
  await setup.companion.handleMessage(
    { action: 'choose', id: second.id },
    popup,
  );
  await setup.command();
  assert.equal(setup.injections.length, 1);
  assert.equal(setup.badges.get(4), 'ON');
});

test('shortcut does not resume a paused connection', async () => {
  const setup = loadCompanion({ pairingAddresses: [address], paused: true });
  await setup.command();
  assert.equal(setup.sockets.length, 0);
  assert.equal(setup.injections.length, 0);
  assert.equal(setup.stored.paused, true);
  assert.equal(setup.badges.get(4), '!');
});

test('unsupported pages and injection failures stay inactive and a later shortcut can recover', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  await setup.command('toggle-inspector', { id: 4, url: 'edge://settings' });
  assert.equal(setup.injections.length, 0);
  assert.equal(setup.badges.get(4), '!');
  const executeScript = setup.chrome.scripting.executeScript;
  setup.chrome.scripting.executeScript = async () => {
    throw new Error('Cannot access this page.');
  };
  await setup.command();
  assert.equal(setup.badges.get(4), '!');
  assert.match(
    (await setup.companion.handleMessage({ action: 'status' }, popup)).notice,
    /Cannot access/u,
  );
  await assert.rejects(
    setup.companion.handleMessage(
      { action: 'selection', selection: { id: 'failed' } },
      pageSender,
    ),
  );
  setup.chrome.scripting.executeScript = executeScript;
  await setup.command();
  assert.equal(setup.badges.get(4), 'ON');
});

test('failed start message clears inspector bookkeeping so the next shortcut can start again', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  const sendMessage = setup.chrome.tabs.sendMessage;
  setup.chrome.tabs.sendMessage = async (tabId, message) => {
    if ((message as { action: string }).action === 'start') {
      throw new Error('Page was closed.');
    }
    await sendMessage(tabId, message);
  };
  await setup.command();
  assert.equal(setup.badges.get(4), '!');
  setup.chrome.tabs.sendMessage = sendMessage;
  await setup.command();
  assert.equal(setup.injections.length, 2);
  assert.equal(setup.badges.get(4), 'ON');
});

test('a destination change while reading the shortcut does not start a stale inspector', async () => {
  const setup = loadCompanion();
  await setup.companion.handleMessage({ action: 'connect', address }, popup);
  setup.chrome.commands.getAll = async () => {
    setup.companion.updateSessions([{ ...first, revision: 'new-branch' }]);
    return [{ name: 'toggle-inspector', shortcut: 'Alt+Shift+S' }];
  };
  await setup.command();
  assert.equal(setup.badges.get(4), '!');
  assert.equal(setup.notices.length, 0);
  assert.match(
    (await setup.companion.handleMessage({ action: 'status' }, popup)).notice,
    /destination changed/u,
  );
});
