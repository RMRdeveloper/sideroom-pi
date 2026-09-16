import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE_URL_PREFIX = 'file://';
const MISSING_PATH_ERROR_CODE = {
  file: 'ENOENT',
  directory: 'ENOTDIR',
} as const;
const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

// File guards must resolve the model's path exactly as Pi's built-in tools do.
export function resolveFileToolPath(
  cwd: string,
  path: string,
): string | undefined {
  const normalizedPath = normalizeFileToolPath(path);
  if (normalizedPath.length === 0) {
    return undefined;
  }

  const localPath = normalizedPath.startsWith(FILE_URL_PREFIX)
    ? fileURLToPath(normalizedPath)
    : normalizedPath;
  const absolutePath = isAbsolute(localPath)
    ? resolve(localPath)
    : resolve(cwd, localPath);
  return realpathOr(absolutePath);
}

function normalizeFileToolPath(path: string): string {
  const normalizedSpaces = path.replace(UNICODE_SPACES, ' ');
  const withoutAtPrefix = normalizedSpaces.startsWith('@')
    ? normalizedSpaces.slice(1)
    : normalizedSpaces;
  return expandHome(normalizeWindowsShellPath(withoutAtPrefix));
}

function normalizeWindowsShellPath(path: string): string {
  if (
    process.platform !== 'win32' ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\')
  ) {
    return path;
  }

  const match = path.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
  const drive = match?.[1];
  if (drive === undefined) {
    return path;
  }
  const suffix = match?.[2]?.replaceAll('/', '\\') ?? '';
  return `${drive.toUpperCase()}:\\${suffix}`;
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function realpathOr(path: string): string {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === MISSING_PATH_ERROR_CODE.file ||
        error.code === MISSING_PATH_ERROR_CODE.directory)
    ) {
      return path;
    }
    throw error;
  }
}
