import { relative, resolve } from 'node:path';

export const MAX_TRACKED_FILES = 100;
export const MODIFIED_FILES_SNAPSHOT_TYPE = 'sideroom-modified-files';
export const MODIFIED_FILES_WIDGET_KEY = 'sideroom-modified-files';

export const FILE_TOOL_NAME = {
  edit: 'edit',
  write: 'write',
} as const;

export type FileToolName = (typeof FILE_TOOL_NAME)[keyof typeof FILE_TOOL_NAME];

export interface ModifiedFile {
  readonly path: string;
  readonly toolName: FileToolName;
}

export function recordModifiedFile(
  files: readonly ModifiedFile[],
  path: string,
  toolName: FileToolName,
): readonly ModifiedFile[] {
  return [
    { path, toolName },
    ...files.filter((file) => file.path !== path),
  ].slice(0, MAX_TRACKED_FILES);
}

export function resolveModifiedPath(
  cwd: string,
  path: string,
): string | undefined {
  const normalized = path.trim().replace(/^@/, '');
  if (normalized.length === 0) {
    return undefined;
  }
  return resolve(cwd, normalized);
}

export function displayModifiedPath(cwd: string, path: string): string {
  const displayPath = relative(cwd, path);
  if (displayPath === '' || displayPath.startsWith('..')) {
    return `external: ${path}`;
  }
  return displayPath;
}

export function readModifiedFilesSnapshot(
  value: unknown,
): readonly ModifiedFile[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    return undefined;
  }

  const files: ModifiedFile[] = [];
  for (const file of value.files) {
    if (!isRecord(file) || typeof file.path !== 'string') {
      return undefined;
    }
    if (
      file.toolName !== FILE_TOOL_NAME.edit &&
      file.toolName !== FILE_TOOL_NAME.write
    ) {
      return undefined;
    }
    files.push({ path: file.path, toolName: file.toolName });
  }
  return files;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
