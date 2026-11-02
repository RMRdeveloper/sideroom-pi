import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@earendil-works/pi-coding-agent';
import {
  commitModifiedFiles,
  createModifiedFilesStore,
  reconstructModifiedFiles,
  refreshModifiedFiles,
  registerModifiedFilesEvents,
  restoreAndRefreshModifiedFiles,
  restoreModifiedFiles,
} from './session.ts';

const files = [{ path: '/work/app.ts', toolName: 'edit' }] as const;

test('reconstructs the latest snapshot, including an intentionally empty list', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      toolCallEntry('write-1', 'write', 'old.ts'),
      toolResultEntry('write-1', 'write', false),
      customEntry({ files }),
      customEntry({ files: [] }),
    ] as never),
    [],
  );
});

test('falls back to successful write and edit tool results when no snapshot exists', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      toolCallEntry('write-1', 'write', 'src/old.ts'),
      toolCallEntry('edit-1', 'edit', 'src/app.ts'),
      toolResultEntry('write-1', 'write', false),
      toolResultEntry('edit-1', 'edit', false),
      toolCallEntry('failed-1', 'write', 'src/failed.ts'),
      toolResultEntry('failed-1', 'write', true),
    ] as never),
    [
      { path: 'src/app.ts', toolName: 'edit' },
      { path: 'src/old.ts', toolName: 'write' },
    ],
  );
});

test('records only successful write and edit results in the session snapshot', () => {
  const handlers = new Map<string, EventHandler>();
  const snapshots: unknown[] = [];
  const widgets: Array<{ key: string; content: unknown }> = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry(_type: string, data: unknown) {
      snapshots.push(data);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: '/work',
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;
  const store = createModifiedFilesStore();

  registerModifiedFilesEvents(api, store);
  const result = handlers.get('tool_result');
  assert.ok(result);
  result(
    {
      toolName: 'write',
      input: { path: 'src/app.ts' },
      isError: false,
    } as never,
    ctx,
  );
  result(
    {
      toolName: 'edit',
      input: { path: 'src/failing.ts' },
      isError: true,
    } as never,
    ctx,
  );
  result(
    {
      toolName: 'bash',
      input: { command: 'touch src/shell.ts' },
      isError: false,
    } as never,
    ctx,
  );

  assert.deepEqual(store.files, [
    { path: '/work/src/app.ts', toolName: 'write' },
  ]);
  assert.deepEqual(snapshots, [{ files: store.files }]);
  assert.equal(widgets.at(-1)?.key, 'sideroom-modified-files');

  commitModifiedFiles(store, api, ctx, []);
  assert.deepEqual(store.files, []);
  assert.deepEqual(snapshots.at(-1), { files: [] });
  assert.equal(widgets.at(-1)?.content, undefined);
});

type EventHandler = (event: never, ctx: ExtensionContext) => unknown;

const identityTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

interface WidgetComponent {
  render(): string[];
  invalidate(): void;
}

type WidgetFactory = (tui: unknown, theme: unknown) => WidgetComponent;

function link(path: string, label: string): string {
  return `\u001B]8;;${pathToFileURL(path).href}\u0007${label}\u001B]8;;\u0007`;
}

function messageEntry(
  role: string,
  content: readonly unknown[] = [],
): unknown {
  return { type: 'message', message: { role, content } };
}

test('ignores custom entries whose type or snapshot key does not match', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      { type: 'custom', customType: 'other', data: { files } },
    ] as never),
    [],
  );
  assert.deepEqual(
    reconstructModifiedFiles([
      {
        type: 'message',
        customType: 'sideroom-modified-files',
        data: { files },
        message: { role: 'user', content: [] },
      },
    ] as never),
    [],
  );
});

test('reads a snapshot stored in the first branch entry', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      customEntry({ files }),
      messageEntry('user'),
    ] as never),
    files,
  );
});

test('skips an unreadable snapshot and keeps scanning older entries', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      customEntry({ files }),
      customEntry({ files: 'src' }),
    ] as never),
    files,
  );
});

test('reads only file tool calls whose arguments carry a path', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      { type: 'custom', customType: 'other', data: {} },
      messageEntry('assistant', [{ type: 'text', text: 'planning' }]),
      toolCallEntry('write-1', 'write', 'src/kept.ts'),
      toolResultEntry('write-1', 'write', false),
      {
        type: 'message',
        message: {
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'edit-empty', name: 'edit', arguments: {} },
          ],
        },
      },
      toolResultEntry('edit-empty', 'edit', false),
      toolCallEntry('bash-1', 'bash', 'src/shell.ts'),
      toolResultEntry('bash-1', 'bash', false),
      toolResultEntry('ghost', 'edit', false),
      toolCallEntry('write-2', 'write', 'src/mismatch.ts'),
      toolResultEntry('write-2', 'edit', false),
    ] as never),
    [{ path: 'src/kept.ts', toolName: 'write' }],
  );
});

test('ignores tool-result shaped messages that are not tool results', () => {
  assert.deepEqual(
    reconstructModifiedFiles([
      toolCallEntry('user-1', 'edit', 'src/ghost.ts'),
      {
        type: 'message',
        message: {
          role: 'user',
          content: [],
          toolCallId: 'user-1',
          toolName: 'edit',
          isError: false,
        },
      },
    ] as never),
    [],
  );
});

test('restores snapshot paths against the working directory and refreshes the widget', () => {
  const widgets: Array<{ key: string; content: unknown }> = [];
  const ctx = {
    cwd: '/work',
    sessionManager: {
      getBranch: () => [
        customEntry({ files: [{ path: 'src/app.ts', toolName: 'edit' }] }),
      ],
    },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;
  const store = createModifiedFilesStore();

  restoreAndRefreshModifiedFiles(store, ctx);

  assert.deepEqual(store.files, [
    { path: '/work/src/app.ts', toolName: 'edit' },
  ]);
  assert.equal(widgets.length, 1);
  const widget = widgets[0]?.content;
  assert.equal(typeof widget, 'function');
  const createWidget = widget as WidgetFactory;
  const component = createWidget(undefined, identityTheme);
  assert.deepEqual(component.render(), [
    '',
    '── Edited files this session (1) ──',
    ` edit ${link('/work/src/app.ts', 'src/app.ts')}`,
    'F8: view all',
  ]);
  component.invalidate();
});

test('unsets the widget when the store is empty', () => {
  const widgets: Array<{ key: string; content: unknown }> = [];
  const store = createModifiedFilesStore();

  refreshModifiedFiles(store, {
    cwd: '/work',
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext);

  assert.deepEqual(widgets, [
    { key: 'sideroom-modified-files', content: undefined },
  ]);
});

test('restores files on session start, tree change, and compaction', () => {
  const handlers = new Map<string, EventHandler>();
  const widgets: Array<{ key: string; content: unknown }> = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: '/work',
    sessionManager: {
      getBranch: () => [
        customEntry({ files: [{ path: 'src/app.ts', toolName: 'edit' }] }),
      ],
    },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;
  const store = createModifiedFilesStore();

  registerModifiedFilesEvents(api, store);

  for (const name of ['session_start', 'session_tree', 'session_compact']) {
    store.files = [];
    const handler = handlers.get(name);
    assert.ok(handler);
    handler({} as never, ctx);
    assert.deepEqual(store.files, [
      { path: '/work/src/app.ts', toolName: 'edit' },
    ]);
  }
  assert.equal(widgets.length, 3);
  assert.deepEqual(
    widgets.map((widget) => widget.key),
    ['sideroom-modified-files', 'sideroom-modified-files', 'sideroom-modified-files'],
  );
});

test('ignores results without a usable file path', () => {
  const handlers = new Map<string, EventHandler>();
  const snapshots: unknown[] = [];
  const widgets: Array<{ key: string; content: unknown }> = [];
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    appendEntry(_type: string, data: unknown) {
      snapshots.push(data);
    },
  } as unknown as ExtensionAPI;
  const ctx = {
    cwd: '/work',
    sessionManager: { getBranch: () => [] },
    ui: {
      setWidget(key: string, content: unknown) {
        widgets.push({ key, content });
      },
    },
  } as unknown as ExtensionContext;
  const store = createModifiedFilesStore();

  registerModifiedFilesEvents(api, store);
  const handleToolResult = handlers.get('tool_result');
  assert.ok(handleToolResult);
  for (const event of [
    { toolName: 'bash', input: { path: 'src/shell.ts' }, isError: false },
    { toolName: 'edit', input: {}, isError: false },
    { toolName: 'edit', input: { path: 42 }, isError: false },
    { toolName: 'edit', input: { path: '   ' }, isError: false },
  ]) {
    handleToolResult(event as never, ctx);
  }

  assert.deepEqual(store.files, []);
  assert.deepEqual(snapshots, []);
  assert.deepEqual(widgets, []);
});

test('restores files without refreshing the widget', () => {
  const widgets: unknown[] = [];
  const ctx = {
    cwd: '/work',
    sessionManager: {
      getBranch: () => [
        customEntry({ files: [{ path: 'src/a.ts', toolName: 'write' }] }),
      ],
    },
    ui: {
      setWidget(_key: string, content: unknown) {
        widgets.push(content);
      },
    },
  } as unknown as ExtensionContext;
  const store = createModifiedFilesStore();

  restoreModifiedFiles(store, ctx);

  assert.deepEqual(store.files, [{ path: '/work/src/a.ts', toolName: 'write' }]);
  assert.deepEqual(widgets, []);
});

function customEntry(data: unknown): unknown {
  return { type: 'custom', customType: 'sideroom-modified-files', data };
}

function toolCallEntry(id: string, name: string, path: string): unknown {
  return {
    type: 'message',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id, name, arguments: { path } }],
    },
  };
}

function toolResultEntry(
  id: string,
  toolName: string,
  isError: boolean,
): unknown {
  return {
    type: 'message',
    message: { role: 'toolResult', toolCallId: id, toolName, isError },
  };
}
