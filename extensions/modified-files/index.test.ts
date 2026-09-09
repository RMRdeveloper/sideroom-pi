import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
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
