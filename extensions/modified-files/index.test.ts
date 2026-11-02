import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import { TODO_WIDGET_REFRESH_EVENT } from '../todo/session.ts';
import registerModifiedFiles from './index.ts';

test('registers the shortcut and reapplies the files widget after TODO refreshes', () => {
  const handlers = new Map<string, EventHandler>();
  const eventHandlers = new Map<string, (value: unknown) => void>();
  const shortcuts: Array<{
    key: string;
    handler: (ctx: ExtensionContext) => void;
  }> = [];
  const snapshots: unknown[] = [];
  const widgets: Array<{ key: string; content: unknown }> = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry(_type: string, data: unknown) {
      snapshots.push(data);
    },
    registerShortcut(
      key: string,
      shortcut: { handler: (ctx: ExtensionContext) => void },
    ) {
      shortcuts.push({ key, handler: shortcut.handler });
    },
    events: {
      on(channel: string, handler: (value: unknown) => void) {
        eventHandlers.set(channel, handler);
        return () => {};
      },
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: 'tui',
    cwd: '/work',
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;

  registerModifiedFiles(api);
  const toolResult = handlers.get('tool_result');
  const todoRefreshed = eventHandlers.get(TODO_WIDGET_REFRESH_EVENT);
  assert.ok(toolResult);
  assert.ok(todoRefreshed);

  toolResult(
    {
      toolName: 'edit',
      input: { path: 'src/app.ts' },
      isError: false,
    } as never,
    ctx,
  );
  todoRefreshed(ctx);

  assert.deepEqual(
    shortcuts.map((shortcut) => shortcut.key),
    ['f8'],
  );
  assert.deepEqual(snapshots, [
    { files: [{ path: '/work/src/app.ts', toolName: 'edit' }] },
  ]);
  assert.equal(widgets.at(-1)?.key, 'sideroom-modified-files');
});

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

interface Shortcut {
  key: string;
  description: string;
  handler: (ctx: ExtensionContext) => void;
}

interface OverlayComponent {
  render(width: number): string[];
  handleInput(data: string): void;
}

type OverlayFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: () => void,
) => OverlayComponent;

interface ExtensionHarness {
  ctx: ExtensionContext;
  widgets: Array<{ key: string; content: unknown }>;
  snapshots: unknown[];
  shortcuts: Shortcut[];
  refreshHandlers: Map<string, (value: unknown) => void>;
  toolResult(event: unknown): void;
  openOverlay(): OverlayComponent;
}

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function link(path: string, label: string): string {
  return `\u001B]8;;${pathToFileURL(path).href}\u0007${label}\u001B]8;;\u0007`;
}

function createHarness(): ExtensionHarness {
  const handlers = new Map<string, EventHandler>();
  const refreshHandlers = new Map<string, (value: unknown) => void>();
  const shortcuts: Shortcut[] = [];
  const snapshots: unknown[] = [];
  const widgets: Array<{ key: string; content: unknown }> = [];
  let overlayFactory: OverlayFactory | undefined;
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry(_type: string, data: unknown) {
      snapshots.push(data);
    },
    registerShortcut(key: string, shortcut: Omit<Shortcut, 'key'>) {
      shortcuts.push({ key, ...shortcut });
    },
    events: {
      on(channel: string, handler: (value: unknown) => void) {
        refreshHandlers.set(channel, handler);
        return () => {};
      },
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    mode: 'tui',
    cwd: '/work',
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
      custom(factory: OverlayFactory) {
        overlayFactory = factory;
        return Promise.resolve();
      },
    },
  } as unknown as ExtensionContext;

  registerModifiedFiles(api);

  return {
    ctx,
    widgets,
    snapshots,
    shortcuts,
    refreshHandlers,
    toolResult(event) {
      const handler = handlers.get('tool_result');
      if (handler === undefined) {
        throw new Error('tool_result handler is not registered');
      }
      handler(event as never, ctx);
    },
    openOverlay() {
      const shortcut = shortcuts[0];
      if (shortcut === undefined) {
        throw new Error('f8 is not registered');
      }
      shortcut.handler(ctx);
      if (overlayFactory === undefined) {
        throw new Error('overlay was not opened');
      }
      return overlayFactory({ requestRender() {} }, identityTheme, {}, () => {});
    },
  };
}

test('opens the overlay from f8 with the tracked files', () => {
  const harness = createHarness();

  assert.deepEqual(
    harness.shortcuts.map((shortcut) => shortcut.key),
    ['f8'],
  );
  assert.equal(harness.shortcuts[0]?.description, 'Toggle edited files');

  harness.toolResult({
    toolName: 'edit',
    input: { path: 'src/app.ts' },
    isError: false,
  });
  const rendered = harness.openOverlay().render(40).join('\n');

  assert.ok(rendered.includes(link('/work/src/app.ts', 'src/app.ts')));
});

test('clears the tracked files from the overlay', () => {
  const harness = createHarness();
  harness.toolResult({
    toolName: 'write',
    input: { path: 'src/app.ts' },
    isError: false,
  });

  const overlay = harness.openOverlay();
  assert.ok(overlay.render(40).join('\n').includes(' write '));

  overlay.handleInput('r');

  assert.deepEqual(harness.snapshots.at(-1), { files: [] });
  assert.equal(harness.widgets.at(-1)?.content, undefined);
});

test('reapplies the widget after a todo refresh with a widget context', () => {
  const harness = createHarness();
  harness.toolResult({
    toolName: 'edit',
    input: { path: 'src/app.ts' },
    isError: false,
  });
  const before = harness.widgets.length;
  const refresh = harness.refreshHandlers.get(TODO_WIDGET_REFRESH_EVENT);
  assert.ok(refresh);

  refresh(harness.ctx);

  assert.equal(harness.widgets.length, before + 1);
  assert.equal(harness.widgets.at(-1)?.key, 'sideroom-modified-files');
  assert.equal(typeof harness.widgets.at(-1)?.content, 'function');
});

test('ignores todo refresh values that are not widget contexts', () => {
  const harness = createHarness();
  harness.toolResult({
    toolName: 'edit',
    input: { path: 'src/app.ts' },
    isError: false,
  });
  const before = harness.widgets.length;
  const refresh = harness.refreshHandlers.get(TODO_WIDGET_REFRESH_EVENT);
  assert.ok(refresh);

  for (const value of [
    42,
    null,
    undefined,
    'text',
    { cwd: '/work' },
    { ui: harness.ctx.ui },
    { '': 1, cwd: '/work' },
    { ui: harness.ctx.ui, '': 1 },
  ]) {
    refresh(value);
  }

  assert.equal(harness.widgets.length, before);
});
