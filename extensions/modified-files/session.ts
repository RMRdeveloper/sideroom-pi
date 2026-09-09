import { resolve } from 'node:path';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import {
  isEditToolResult,
  isWriteToolResult,
} from '@earendil-works/pi-coding-agent';
import {
  type FileToolName,
  MODIFIED_FILES_SNAPSHOT_TYPE,
  MODIFIED_FILES_WIDGET_KEY,
  type ModifiedFile,
  readModifiedFilesSnapshot,
  recordModifiedFile,
  resolveModifiedPath,
} from './model.ts';
import { renderModifiedFilesWidget } from './ui.ts';

export interface ModifiedFilesStore {
  files: readonly ModifiedFile[];
}

type SessionBranch = ReturnType<
  ExtensionContext['sessionManager']['getBranch']
>;

export function createModifiedFilesStore(
  files: readonly ModifiedFile[] = [],
): ModifiedFilesStore {
  return { files };
}

export function reconstructModifiedFiles(
  branch: SessionBranch,
): readonly ModifiedFile[] {
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    const entry = branch[index];
    if (
      entry?.type !== 'custom' ||
      entry.customType !== MODIFIED_FILES_SNAPSHOT_TYPE
    ) {
      continue;
    }
    const files = readModifiedFilesSnapshot(entry.data);
    if (files !== undefined) {
      return files;
    }
  }
  return reconstructFromToolResults(branch);
}

export function restoreModifiedFiles(
  store: ModifiedFilesStore,
  ctx: Pick<ExtensionContext, 'sessionManager' | 'cwd'>,
): void {
  store.files = reconstructModifiedFiles(ctx.sessionManager.getBranch()).map(
    (file) => ({
      ...file,
      path: resolve(ctx.cwd, file.path),
    }),
  );
}

export function refreshModifiedFiles(
  store: ModifiedFilesStore,
  ctx: Pick<ExtensionContext, 'ui' | 'cwd'>,
): void {
  if (store.files.length === 0) {
    ctx.ui.setWidget(MODIFIED_FILES_WIDGET_KEY, undefined);
    return;
  }
  ctx.ui.setWidget(MODIFIED_FILES_WIDGET_KEY, (_tui, theme) => {
    const lines = renderModifiedFilesWidget(store.files, ctx.cwd, theme);
    return {
      render: () => lines ?? [],
      invalidate() {},
    };
  });
}

export function restoreAndRefreshModifiedFiles(
  store: ModifiedFilesStore,
  ctx: Pick<ExtensionContext, 'sessionManager' | 'ui' | 'cwd'>,
): void {
  restoreModifiedFiles(store, ctx);
  refreshModifiedFiles(store, ctx);
}

export function commitModifiedFiles(
  store: ModifiedFilesStore,
  pi: Pick<ExtensionAPI, 'appendEntry'>,
  ctx: Pick<ExtensionContext, 'ui' | 'cwd'>,
  files: readonly ModifiedFile[],
): void {
  store.files = files;
  pi.appendEntry(MODIFIED_FILES_SNAPSHOT_TYPE, { files });
  refreshModifiedFiles(store, ctx);
}

export function registerModifiedFilesEvents(
  pi: ExtensionAPI,
  store: ModifiedFilesStore,
): void {
  pi.on('session_start', (_event, ctx) =>
    restoreAndRefreshModifiedFiles(store, ctx),
  );
  pi.on('session_tree', (_event, ctx) =>
    restoreAndRefreshModifiedFiles(store, ctx),
  );
  pi.on('session_compact', (_event, ctx) =>
    restoreAndRefreshModifiedFiles(store, ctx),
  );
  pi.on('tool_result', (event, ctx) => {
    if (
      event.isError ||
      (!isEditToolResult(event) && !isWriteToolResult(event))
    ) {
      return;
    }
    const path = readToolPath(event.input);
    if (path === undefined) {
      return;
    }
    const resolvedPath = resolveModifiedPath(ctx.cwd, path);
    if (resolvedPath === undefined) {
      return;
    }
    const files = recordModifiedFile(store.files, resolvedPath, event.toolName);
    commitModifiedFiles(store, pi, ctx, files);
  });
}

function reconstructFromToolResults(
  branch: SessionBranch,
): readonly ModifiedFile[] {
  const calls = collectFileToolCalls(branch);
  let files: readonly ModifiedFile[] = [];

  for (const entry of branch) {
    const file = fileFromToolResult(entry, calls);
    if (file !== undefined) {
      files = recordModifiedFile(files, file.path, file.toolName);
    }
  }
  return files;
}

function collectFileToolCalls(
  branch: SessionBranch,
): Map<string, ModifiedFile> {
  const calls = new Map<string, ModifiedFile>();
  for (const entry of branch) {
    if (entry?.type !== 'message' || entry.message.role !== 'assistant') {
      continue;
    }
    for (const content of entry.message.content) {
      if (content.type !== 'toolCall') {
        continue;
      }
      const toolName = fileToolName(content.name);
      const path = readToolPath(content.arguments);
      if (toolName !== undefined && path !== undefined) {
        calls.set(content.id, { path, toolName });
      }
    }
  }
  return calls;
}

function fileFromToolResult(
  entry: SessionBranch[number] | undefined,
  calls: ReadonlyMap<string, ModifiedFile>,
): ModifiedFile | undefined {
  if (entry?.type !== 'message' || entry.message.role !== 'toolResult') {
    return undefined;
  }
  const message = entry.message;
  if (message.isError) {
    return undefined;
  }
  const toolName = fileToolName(message.toolName);
  const call = calls.get(message.toolCallId);
  if (toolName === undefined || call?.toolName !== toolName) {
    return undefined;
  }
  return call;
}

function fileToolName(value: string): FileToolName | undefined {
  if (value === 'edit' || value === 'write') {
    return value;
  }
  return undefined;
}

function readToolPath(input: Record<string, unknown>): string | undefined {
  return typeof input.path === 'string' ? input.path : undefined;
}
