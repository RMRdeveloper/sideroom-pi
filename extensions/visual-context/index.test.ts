import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { WebSocket } from 'ws';
import registerVisualContext from './index.ts';
import { PROTOCOL_VERSION, parseSelection, VISUAL_SNAPSHOT } from './model.ts';
import {
  createVisualStore,
  prepareContext,
  receiveSelection,
  restorePending,
} from './session.ts';

const selection = parseSelection({
  id: 'save-1',
  page: 'http://localhost/account',
  element: { tag: 'button', elementId: '', classes: ['account-save'] },
  text: 'Save profile',
  ancestors: [],
});

type Handler = (event: never, ctx: ExtensionContext) => unknown;

function createHarness(root: string) {
  const handlers = new Map<string, Handler>();
  const snapshots: { type: 'custom'; customType: string; data: unknown }[] = [];
  const notices: string[] = [];
  const widgets = new Map<string, unknown>();
  let shortcut: ((ctx: ExtensionContext) => Promise<void>) | undefined;
  let pairingAddress = '';
  let choice: (
    options: readonly string[],
  ) => string | undefined | Promise<string | undefined> = (options) =>
    options[0];
  let idle = true;
  let trusted = true;
  const api = {
    registerTool: () => {},
    on: (event: string, handler: Handler) => handlers.set(event, handler),
    appendEntry: (customType: string, payload: unknown) =>
      snapshots.push({ type: 'custom', customType, data: payload }),
    registerShortcut: (
      _key: string,
      options: { handler: (ctx: ExtensionContext) => Promise<void> },
    ) => {
      shortcut = options.handler;
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: root,
    mode: 'tui',
    isIdle: () => idle,
    isProjectTrusted: () => trusted,
    sessionManager: {
      getBranch: () => snapshots,
      getSessionId: () => 'conversation',
      getSessionName: () => undefined,
    },
    ui: {
      select: async (_title: string, options: readonly string[]) =>
        choice(options),
      editor: async (_title: string, content: string) => {
        pairingAddress = content;
        return content;
      },
      notify: (message: string) => notices.push(message),
      setWidget: (key: string, widget: unknown) => widgets.set(key, widget),
    },
  } as unknown as ExtensionContext;
  registerVisualContext(api, join(root, '.pi-global-fixture'));
  return {
    api,
    ctx,
    handlers,
    snapshots,
    notices,
    widgets,
    pairingAddress: () => pairingAddress,
    shortcut: () => {
      assert.ok(shortcut);
      return shortcut(ctx);
    },
    choose: (select: typeof choice) => {
      choice = select;
    },
    setIdle: (value: boolean) => {
      idle = value;
    },
    setTrusted: (value: boolean) => {
      trusted = value;
    },
    dispatch: (event: string, payload: unknown = {}) =>
      handlers.get(event)?.(payload as never, ctx),
  };
}

test('real bridge → source → candidate review → next user input, with no click-triggered run', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-flow-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'Account.vue'),
    '<template>\n<button class="account-save">Save profile</button>\n</template>',
  );
  const harness = createHarness(root);
  t.after(async () => {
    await harness.dispatch('session_shutdown');
  });
  await harness.dispatch('session_start');
  await harness.shortcut();
  const address = new URL(harness.pairingAddress());
  const token = address.hash.slice(1);
  address.hash = '';
  const socket = new WebSocket(address.href, {
    origin: `chrome-extension://${'a'.repeat(32)}`,
  });
  t.after(() => socket.terminate());
  await once(socket, 'open');
  const ready = once(socket, 'message');
  socket.send(
    JSON.stringify({
      type: 'authenticate',
      role: 'browser',
      version: PROTOCOL_VERSION,
      token,
    }),
  );
  const target = JSON.parse(String((await ready)[0])).sessions[0];
  const receipt = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'selection', selection, target }));
  assert.equal(JSON.parse(String((await receipt)[0])).candidates, 1);
  assert.equal(harness.snapshots.at(-1)?.customType, VISUAL_SNAPSHOT);
  assert.equal(harness.handlers.has('agent_before_settle'), false);
  harness.choose(
    (options) =>
      options.find((option) => option.startsWith('Review ')) ??
      options.find((option) => option.startsWith('Account.vue:')),
  );
  await harness.shortcut();
  const image = { type: 'image', data: 'image-payload', mimeType: 'image/png' };
  const transformed = harness.dispatch('input', {
    source: 'interactive',
    text: 'Make this button smaller.',
    images: [image],
  }) as { action: string; text: string; images: unknown[] };
  assert.equal(transformed.action, 'transform');
  assert.match(transformed.text, /^Make this button smaller\./u);
  assert.match(transformed.text, /Account.vue:2-2/u);
  assert.match(transformed.text, /user-selected candidate/u);
  assert.deepEqual(transformed.images, [image]);
  await harness.dispatch('before_agent_start', { prompt: transformed.text });
  assert.equal(
    harness.dispatch('input', { source: 'interactive', text: 'Next request.' }),
    undefined,
  );
  assert.deepEqual(harness.snapshots.at(-1)?.data, { pending: [] });
});

test('preserves pending selections through compaction and does not consume on busy, extension or shell input', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-pending-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'Account.html'),
    '<button class="account-save">Save profile</button>',
  );
  const harness = createHarness(root);
  const store = createVisualStore();
  receiveSelection({ store, pi: harness.api, cwd: root, selection });
  harness.dispatch('session_compact');
  for (const payload of [
    { source: 'extension', text: 'steer' },
    { source: 'interactive', text: '!git status' },
    { source: 'interactive', text: '/help' },
    { source: 'interactive', text: 'Follow up', streamingBehavior: 'followUp' },
  ]) {
    assert.equal(harness.dispatch('input', payload), undefined);
  }
  harness.setIdle(false);
  assert.equal(
    harness.dispatch('input', { source: 'interactive', text: 'During run' }),
    undefined,
  );
  harness.setIdle(true);
  const transformed = harness.dispatch('input', {
    source: 'interactive',
    text: 'Change this',
  }) as { text: string };
  assert.match(transformed.text, /Account.html:1-1/u);
});

test('restores only the active branch, respects empty snapshots and discards obsolete candidates', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-restore-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'Account.html');
  writeFileSync(file, '<button class="account-save">Save profile</button>');
  const harness = createHarness(root);
  const store = createVisualStore();
  receiveSelection({ store, pi: harness.api, cwd: root, selection });
  const restored = createVisualStore();
  restorePending({ store: restored, ctx: harness.ctx });
  assert.equal(restored.pending.length, 1);
  writeFileSync(file, '<button>Changed</button>');
  restorePending({ store: restored, ctx: harness.ctx });
  assert.deepEqual(restored.pending[0]?.resolution.candidates, []);
  const context = prepareContext({
    store: restored,
    cwd: root,
  });
  assert.doesNotMatch(context?.text ?? '', /Account.html:1-1/u);
  harness.api.appendEntry(VISUAL_SNAPSHOT, { pending: [] });
  restorePending({ store: restored, ctx: harness.ctx });
  assert.deepEqual(restored.pending, []);
});

test('never opens a bridge for an untrusted project', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-trust-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const harness = createHarness(root);
  harness.setTrusted(false);
  await harness.shortcut();
  assert.equal(harness.pairingAddress(), '');
  assert.match(harness.notices[0] ?? '', /Trust this project/u);
});

test('does not lose existing pending selections when the five-element cap is reached', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-cap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const harness = createHarness(root);
  const store = createVisualStore();
  for (let index = 0; index < 5; index += 1) {
    receiveSelection({
      store,
      pi: harness.api,
      cwd: root,
      selection: { ...selection, id: `element-${String(index)}` },
    });
  }
  assert.throws(() =>
    receiveSelection({ store, pi: harness.api, cwd: root, selection }),
  );
  assert.equal(store.pending.length, 5);
  assert.equal(harness.snapshots.length, 5);
});

test('failed prompt startup keeps attachments pending, and new clicks are not consumed by an earlier input', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const harness = createHarness(root);
  const store = createVisualStore();
  receiveSelection({ store, pi: harness.api, cwd: root, selection });
  harness.dispatch('session_compact');
  const first = harness.dispatch('input', {
    source: 'interactive',
    text: 'First attempt',
  }) as { text: string };
  assert.match(first.text, /Browser elements/u);
  const retry = harness.dispatch('input', {
    source: 'interactive',
    text: 'Retry after login',
  }) as { text: string };
  assert.match(retry.text, /Browser elements/u);
  receiveSelection({
    store,
    pi: harness.api,
    cwd: root,
    selection: { ...selection, id: 'later-click' },
  });
  harness.dispatch('session_compact');
  harness.dispatch('before_agent_start', { prompt: retry.text });
  const snapshot = harness.snapshots.at(-1)?.data as {
    pending: { selection: { id: string } }[];
  };
  assert.deepEqual(
    snapshot.pending.map((entry) => entry.selection.id),
    ['later-click'],
  );
  const next = harness.dispatch('input', {
    source: 'interactive',
    text: 'Next request',
  }) as { text: string };
  assert.match(next.text, /Browser elements/u);
});

test('F7 ignores source choices from another session and preserves pending elements on cancellation or stale source', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-dialog-'));
  const harness = createHarness(root);
  t.after(async () => {
    await harness.dispatch('session_shutdown');
    rmSync(root, { recursive: true, force: true });
  });
  const file = join(root, 'Save.html');
  writeFileSync(file, '<button class="account-save">Save profile</button>');
  receiveSelection({
    store: createVisualStore(),
    pi: harness.api,
    cwd: root,
    selection,
  });
  await harness.dispatch('session_start');
  const answer = Promise.withResolvers<string | undefined>();
  const opened = Promise.withResolvers<string>();
  harness.choose((options) => {
    const review = options.find((option) => option.startsWith('Review '));
    if (review) {
      return review;
    }
    opened.resolve(options[0] ?? '');
    return answer.promise;
  });
  const review = harness.shortcut();
  const label = await opened.promise;
  await harness.dispatch('session_tree');
  const count = harness.snapshots.length;
  answer.resolve(label);
  await review;
  assert.equal(harness.snapshots.length, count);
  harness.choose((options) =>
    options.find((option) => option.startsWith('Review ')),
  );
  await harness.shortcut();
  assert.equal(harness.snapshots.length, count);
  harness.choose((options) => {
    const entry = options.find((option) => option.startsWith('Review '));
    if (entry) {
      return entry;
    }
    writeFileSync(file, '<button>Changed</button>');
    return options[0];
  });
  await harness.shortcut();
  assert.equal(harness.snapshots.length, count);
  assert.match(harness.notices.at(-1) ?? '', /source changed/u);
});

test('keeps the browser connected across tree navigation and joins again on Pi restart without another pairing dialog', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-lifecycle-'));
  const harness = createHarness(root);
  const restartedSession: { current?: ReturnType<typeof createHarness> } = {};
  t.after(async () => {
    await harness.dispatch('session_shutdown');
    await restartedSession.current?.dispatch('session_shutdown');
    rmSync(root, { recursive: true, force: true });
  });
  await harness.dispatch('session_start');
  await harness.shortcut();
  const address = new URL(harness.pairingAddress());
  const token = address.hash.slice(1);
  address.hash = '';
  async function browser() {
    const socket = new WebSocket(address.href, {
      origin: `chrome-extension://${'a'.repeat(32)}`,
    });
    t.after(() => socket.terminate());
    await once(socket, 'open');
    const ready = once(socket, 'message');
    socket.send(
      JSON.stringify({
        type: 'authenticate',
        role: 'browser',
        version: PROTOCOL_VERSION,
        token,
      }),
    );
    return { socket, target: JSON.parse(String((await ready)[0])).sessions[0] };
  }
  const initial = await browser();
  const sessionsChanged = once(initial.socket, 'message');
  await harness.dispatch('session_tree');
  const refreshed = JSON.parse(String((await sessionsChanged)[0])).sessions[0];
  assert.equal(initial.socket.readyState, WebSocket.OPEN);
  assert.equal(refreshed.id, initial.target.id);
  assert.notEqual(refreshed.revision, initial.target.revision);
  const rejected = once(initial.socket, 'message');
  initial.socket.send(
    JSON.stringify({ type: 'selection', selection, target: initial.target }),
  );
  assert.equal(JSON.parse(String((await rejected)[0])).type, 'error');
  assert.equal(harness.snapshots.length, 0);
  const closed = once(initial.socket, 'close');
  await harness.dispatch('session_shutdown');
  await closed;
  const restarted = createHarness(root);
  restartedSession.current = restarted;
  await restarted.dispatch('session_start');
  assert.equal(restarted.pairingAddress(), '');
  const next = await browser();
  const receipt = once(next.socket, 'message');
  next.socket.send(
    JSON.stringify({ type: 'selection', selection, target: next.target }),
  );
  assert.equal(JSON.parse(String((await receipt)[0])).type, 'received');
  assert.equal(restarted.snapshots.length, 1);
  assert.ok(!JSON.stringify(restarted.snapshots).includes(token));
});
