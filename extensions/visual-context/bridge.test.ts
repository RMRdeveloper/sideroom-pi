import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { WebSocket } from 'ws';
import { connectSession } from './bridge.ts';
import {
  PROTOCOL_VERSION,
  type SessionDescriptor,
  type VisualSelection,
} from './model.ts';
import { endpoint, ensurePairing, pairingAddress } from './pairing.ts';

const ORIGIN = `chrome-extension://${'a'.repeat(32)}`;
const selection: VisualSelection = {
  id: 'button-1',
  page: 'http://localhost/account?token=private',
  element: { tag: 'button', elementId: '', classes: ['save'] },
  text: 'Save',
  ancestors: [],
};
const descriptor = (name: string): SessionDescriptor => ({
  id: randomUUID(),
  revision: randomUUID(),
  name,
  project: `/projects/${name}`,
  environment: 'linux',
});

async function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-pairing-'));
  const identity = await ensurePairing(directory);
  const sessions: Awaited<ReturnType<typeof connectSession>>[] = [];
  const browsers: WebSocket[] = [];
  t.after(async () => {
    for (const browser of browsers) {
      browser.terminate();
    }
    for (const session of sessions.toReversed()) {
      await session.close();
    }
    rmSync(directory, { recursive: true, force: true });
  });
  return {
    identity,
    directory,
    async pi({
      session,
      onSelection,
    }: {
      session: SessionDescriptor;
      onSelection: (selection: VisualSelection) => { candidates: number };
    }) {
      const bridge = await connectSession({
        identity,
        session,
        onSelection,
        onError: () => undefined,
      });
      sessions.push(bridge);
      return bridge;
    },
    async browser() {
      const socket = new WebSocket(endpoint(identity), { origin: ORIGIN });
      browsers.push(socket);
      await once(socket, 'open');
      const ready = once(socket, 'message');
      socket.send(
        JSON.stringify({
          type: 'authenticate',
          role: 'browser',
          version: PROTOCOL_VERSION,
          token: identity.token,
        }),
      );
      const available = JSON.parse(String((await ready)[0]))
        .sessions as SessionDescriptor[];
      return { socket, available };
    },
  };
}

function waitForMessage(
  socket: WebSocket,
  type: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', listener);
      reject(new Error(`Missing ${type} frame`));
    }, 5_000);
    function listener(bytes: unknown) {
      const message = JSON.parse(String(bytes));
      if (message.type === type) {
        clearTimeout(timeout);
        socket.off('message', listener);
        resolve(message);
      }
    }
    socket.on('message', listener);
  });
}

async function click({
  socket,
  target,
  element = selection,
}: {
  socket: WebSocket;
  target: SessionDescriptor;
  element?: VisualSelection;
}) {
  const receipt = waitForMessage(socket, 'received');
  socket.send(
    JSON.stringify({ type: 'selection', target, selection: element }),
  );
  return receipt;
}

test('one installation identity survives restart and concurrent creation without exposing the token in network URLs', async (t) => {
  const setup = await fixture(t);
  const identities = await Promise.all([
    ensurePairing(setup.directory),
    ensurePairing(setup.directory),
  ]);
  assert.deepEqual(identities, [setup.identity, setup.identity]);
  const fresh = mkdtempSync(join(tmpdir(), 'sideroom-concurrent-pairing-'));
  t.after(() => rmSync(fresh, { recursive: true, force: true }));
  const concurrent = await Promise.all([
    ensurePairing(fresh),
    ensurePairing(fresh),
  ]);
  assert.deepEqual(concurrent[0], concurrent[1]);
  if (process.platform !== 'win32') {
    assert.equal(
      statSync(join(fresh, 'sideroom-visual-context/connection.json')).mode &
        0o777,
      0o600,
    );
    assert.equal(
      statSync(join(fresh, 'sideroom-visual-context')).mode & 0o777,
      0o700,
    );
  }
  assert.ok(pairingAddress(setup.identity).endsWith(setup.identity.token));
  assert.ok(!endpoint(setup.identity).includes(setup.identity.token));
  assert.ok(
    !readFileSync(
      join(fresh, 'sideroom-visual-context/connection.json'),
      'utf8',
    ).includes('projects'),
  );
});

test('routes real browser selections only to the chosen Pi process and rejects an old conversation revision', async (t) => {
  const setup = await fixture(t);
  const first = descriptor('first');
  const second = descriptor('second');
  const observed: string[] = [];
  const firstBridge = await setup.pi({
    session: first,
    onSelection: (element) => {
      observed.push(element.page);
      return { candidates: 2 };
    },
  });
  await setup.pi({
    session: second,
    onSelection: () => {
      observed.push('second');
      return { candidates: 1 };
    },
  });
  const { socket, available } = await setup.browser();
  assert.equal(available.length, 2);
  assert.equal((await click({ socket, target: first })).candidates, 2);
  assert.deepEqual(observed, ['http://localhost/account']);
  const changed = {
    ...first,
    revision: randomUUID(),
    name: 'new conversation',
  };
  const updated = waitForMessage(socket, 'sessions');
  firstBridge.update(changed);
  await updated;
  const rejected = waitForMessage(socket, 'error');
  socket.send(JSON.stringify({ type: 'selection', target: first, selection }));
  assert.match(String((await rejected).message), /changed/u);
  assert.equal(observed.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 310));
  assert.equal((await click({ socket, target: second })).candidates, 1);
  assert.deepEqual(observed, ['http://localhost/account', 'second']);
});

test('another Pi process takes over when the broker owner closes, and the original pairing still works', async (t) => {
  const setup = await fixture(t);
  const owner = await setup.pi({
    session: descriptor('owner'),
    onSelection: () => ({ candidates: 0 }),
  });
  const survivor = descriptor('survivor');
  await setup.pi({ session: survivor, onSelection: () => ({ candidates: 3 }) });
  const initial = await setup.browser();
  const disconnected = once(initial.socket, 'close');
  await owner.close();
  await disconnected;
  await new Promise((resolve) => setTimeout(resolve, 1_300));
  const { socket, available } = await setup.browser();
  assert.deepEqual(
    available.map((session) => session.id),
    [survivor.id],
  );
  assert.equal((await click({ socket, target: survivor })).candidates, 3);
});

test('rejects page origins, role spoofing, wrong authorization, source claims and oversized frames', async (t) => {
  const setup = await fixture(t);
  const target = descriptor('protected');
  let calls = 0;
  await setup.pi({
    session: target,
    onSelection: () => {
      calls += 1;
      return { candidates: 0 };
    },
  });
  const page = new WebSocket(endpoint(setup.identity), {
    origin: 'http://localhost',
  });
  assert.match(String((await once(page, 'error'))[0]), /403/u);
  for (const authentication of [
    { role: 'browser', token: 'b'.repeat(64) },
    { role: 'pi', token: setup.identity.token },
  ]) {
    const socket = new WebSocket(endpoint(setup.identity), { origin: ORIGIN });
    await once(socket, 'open');
    const closed = once(socket, 'close');
    socket.send(
      JSON.stringify({
        type: 'authenticate',
        version: PROTOCOL_VERSION,
        ...authentication,
      }),
    );
    assert.equal((await closed)[0], 1008);
  }
  const { socket } = await setup.browser();
  const rejected = waitForMessage(socket, 'error');
  socket.send(
    JSON.stringify({
      type: 'selection',
      target,
      selection: { ...selection, path: '/etc/passwd' },
    }),
  );
  assert.match(String((await rejected).message), /Invalid browser selection/u);
  const closed = once(socket, 'close');
  socket.send('x'.repeat(9_000));
  assert.equal((await closed)[0], 1009);
  assert.equal(calls, 0);
});
