import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

function loadInspector() {
  const script = readFileSync(
    new URL('../../assets/visual-context/browser/content.js', import.meta.url),
    'utf8',
  );
  const window = new EventTarget();
  const nodes: InspectorNode[] = [];
  const notices: unknown[] = [];
  let receive:
    | ((message: { action: string; shortcut?: string }) => void)
    | undefined;
  class InspectorNode {
    localName = 'button';
    id = '';
    classList: string[] = [];
    parentElement?: InspectorNode;
    style = {};
    textContent = '';
    removed = false;
    attributes = new Map<string, string>();
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    }
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
    closest() {
      return null;
    }
    cloneNode() {
      return this;
    }
    querySelectorAll() {
      return [];
    }
    attachShadow() {
      return { append() {} };
    }
    remove() {
      this.removed = true;
    }
  }
  runInNewContext(script, {
    Element: InspectorNode,
    crypto: { randomUUID: () => 'selection-1' },
    location: { origin: 'http://localhost:5173', pathname: '/' },
    window: {
      addEventListener: window.addEventListener.bind(window),
      removeEventListener(
        type: string,
        listener: EventListener,
        capture = false,
      ) {
        // Node does not match capture listeners when removal uses a boolean.
        window.removeEventListener(type, listener, { capture });
      },
    },
    console,
    document: {
      createElement() {
        const node = new InspectorNode();
        nodes.push(node);
        return node;
      },
      documentElement: { append() {} },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener: typeof receive) {
            receive = listener;
          },
        },
        sendMessage: async (message: unknown) => {
          notices.push(message);
          return { ok: true };
        },
      },
    },
  });
  return {
    window,
    nodes,
    notices,
    element: () => new InspectorNode(),
    select: (element: InspectorNode) => {
      const event = new Event('click', { cancelable: true });
      Object.defineProperty(event, 'isTrusted', { value: true });
      Object.defineProperty(event, 'composedPath', { value: () => [element] });
      window.dispatchEvent(event);
    },
    receive: (message: { action: string; shortcut?: string }) =>
      receive?.(message),
    overlay: () =>
      nodes.find(
        (node) =>
          !node.removed && node.attributes.has('data-sideroom-inspector'),
      ),
  };
}

test('inspector intercepts page clicks only while active and Escape removes the overlay', () => {
  const setup = loadInspector();
  const pointerDown = () => new Event('pointerdown', { cancelable: true });
  assert.equal(setup.window.dispatchEvent(pointerDown()), true);
  setup.receive({ action: 'start', shortcut: 'Ctrl+Shift+Y' });
  assert.ok(setup.overlay());
  assert.equal(setup.window.dispatchEvent(pointerDown()), false);
  assert.match(
    setup.nodes.find((node) => node.attributes.get('role') === 'status')
      ?.textContent ?? '',
    /Ctrl\+Shift\+Y/u,
  );
  const escapeKey = new Event('keydown', { cancelable: true });
  Object.defineProperty(escapeKey, 'key', { value: 'Escape' });
  setup.window.dispatchEvent(escapeKey);
  assert.equal(escapeKey.defaultPrevented, true);
  assert.equal(setup.overlay(), undefined);
  assert.equal(setup.window.dispatchEvent(pointerDown()), true);
  assert.deepEqual(JSON.parse(JSON.stringify(setup.notices)), [
    { action: 'stopped' },
  ]);
  const laterEscape = new Event('keydown', { cancelable: true });
  Object.defineProperty(laterEscape, 'key', { value: 'Escape' });
  setup.window.dispatchEvent(laterEscape);
  assert.equal(laterEscape.defaultPrevented, false);
  assert.equal(setup.notices.length, 1);
});

test('captures only the selected element compiler marker, preserving Windows drive colons', async () => {
  const setup = loadInspector();
  setup.receive({ action: 'start' });
  const selected = setup.element();
  selected.setAttribute(
    'data-insp-path',
    'C:\\projects\\shop\\Button.tsx:12:5:button',
  );
  setup.select(selected);
  await Promise.resolve();
  const notice = JSON.parse(JSON.stringify(setup.notices[0]));
  assert.deepEqual(notice.selection.source, {
    path: 'C:\\projects\\shop\\Button.tsx',
    line: 12,
    column: 5,
  });
  const parent = setup.element();
  parent.setAttribute('data-insp-path', '/project/Parent.tsx:10:1:div');
  const child = setup.element();
  child.parentElement = parent;
  setup.select(child);
  await Promise.resolve();
  const childNotice = JSON.parse(JSON.stringify(setup.notices[1]));
  assert.equal(childNotice.selection.source, undefined);
  selected.setAttribute('data-insp-path', '/project/Button.tsx:0:5:button');
  setup.select(selected);
  await Promise.resolve();
  assert.equal(setup.notices.length, 2);
  assert.match(
    setup.nodes.find((node) => node.attributes.get('role') === 'status')
      ?.textContent ?? '',
    /Invalid compiler position/u,
  );
});

test('stop messages and pagehide remove overlays and restore page mouse events', () => {
  const setup = loadInspector();
  for (const stop of [
    () => setup.receive({ action: 'stop' }),
    () => setup.window.dispatchEvent(new Event('pagehide')),
  ]) {
    setup.receive({ action: 'start' });
    assert.ok(setup.overlay());
    stop();
    assert.equal(setup.overlay(), undefined);
    for (const type of ['pointerdown', 'mousedown', 'click']) {
      assert.equal(
        setup.window.dispatchEvent(new Event(type, { cancelable: true })),
        true,
      );
    }
  }
});
