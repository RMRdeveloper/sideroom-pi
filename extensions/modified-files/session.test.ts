import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  commitModifiedFiles,
  createModifiedFilesStore,
  reconstructModifiedFiles,
  registerModifiedFilesEvents,
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
