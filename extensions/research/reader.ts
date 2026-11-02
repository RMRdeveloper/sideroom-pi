import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, opendir, realpath, stat, type FileHandle } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const GIT_METADATA = '.git';
const MAX_FILE_BYTES = 64_000;
const MAX_DIRECTORY_ENTRIES = 200;
const MAX_SCANNED_ENTRIES = 1_024;
const MAX_LINE_LENGTH = 2_000;
const MAX_LINES = 200;

function allowedName(name: string): boolean {
  return name !== GIT_METADATA && ![...name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

function checkName(name: string): void {
  if (!allowedName(name)) {
    throw new Error('This path is not available for research.');
  }
}

function checkedParts(root: string, path: string): string[] {
  if (isAbsolute(path)) {
    throw new Error('Use a path relative to the project.');
  }
  const target = resolve(root, path);
  const inside = relative(root, target);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error('The path is outside the project.');
  }
  const parts = inside.split(sep).filter(Boolean);
  for (const part of parts) {
    checkName(part);
  }
  return parts;
}

const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

interface ResearchRoot {
  readonly path: string;
  readonly device: number;
  readonly inode: number;
}

interface OpenResearchPathRequest {
  readonly root: ResearchRoot;
  readonly path: string;
  readonly directory: boolean;
  readonly signal?: AbortSignal;
}

async function openResearchPath({ root, path, directory, signal }: OpenResearchPathRequest): Promise<FileHandle> {
  signal?.throwIfAborted();
  const parts = checkedParts(root.path, path);
  const opened: FileHandle[] = [];
  let target: FileHandle | undefined;
  let failure: unknown;
  let failed = false;
  try {
    const base = await open(root.path, DIRECTORY_FLAGS);
    opened.push(base);
    const identity = await base.stat();
    signal?.throwIfAborted();
    if (identity.dev !== root.device || identity.ino !== root.inode) {
      throw new Error('The project directory changed. Start research again.');
    }
    let current = base;
    for (const [index, part] of parts.entries()) {
      signal?.throwIfAborted();
      const flags = directory || index < parts.length - 1 ? DIRECTORY_FLAGS : FILE_FLAGS;
      current = await open(`/proc/self/fd/${String(current.fd)}/${part}`, flags);
      opened.push(current);
    }
    signal?.throwIfAborted();
    target = opened.pop();
    if (target === undefined) {
      throw new Error('The project directory could not be opened.');
    }
  } catch (cause) {
    failed = true;
    failure = cause instanceof Error && 'code' in cause && (cause.code === 'ELOOP' || cause.code === 'ENOTDIR')
      ? new Error('Symbolic links and non-directory parents are not available for research.', { cause })
      : cause;
  }
  const closures = await Promise.allSettled(opened.reverse().map(async (handle) => handle.close()));
  const closeErrors = closures.flatMap((closure) => closure.status === 'rejected' ? [closure.reason] : []);
  if (!failed && signal?.aborted) {
    failed = true;
    failure = signal.reason;
  }
  if (closeErrors.length > 0 || failed) {
    if (target !== undefined) {
      try {
        await target.close();
      } catch (cause) {
        closeErrors.push(cause);
      }
    }
    if (closeErrors.length > 0) {
      throw new AggregateError(failed ? [failure, ...closeErrors] : closeErrors, 'Research file handles could not be closed.');
    }
    throw failure;
  }
  if (target === undefined) {
    throw new Error('The project directory could not be opened.');
  }
  return target;
}

async function readBoundedFile(file: FileHandle, signal?: AbortSignal): Promise<Buffer> {
  const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
  let length = 0;
  while (length < buffer.length) {
    signal?.throwIfAborted();
    const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
    if (bytesRead === 0) {
      break;
    }
    length += bytesRead;
  }
  signal?.throwIfAborted();
  if (length > MAX_FILE_BYTES) {
    throw new Error('Only regular files of at most 64000 bytes can be read.');
  }
  return buffer.subarray(0, length);
}

async function listDirectory(directory: FileHandle, signal?: AbortSignal): Promise<string> {
  const stream = await opendir(`/proc/self/fd/${String(directory.fd)}`);
  const visible: string[] = [];
  let visited = 0;
  let limited = false;
  for await (const entry of stream) {
    signal?.throwIfAborted();
    if (visited >= MAX_SCANNED_ENTRIES) {
      limited = true;
      break;
    }
    visited += 1;
    if (allowedName(entry.name) && !entry.isSymbolicLink()) {
      visible.push(`${entry.name}${entry.isDirectory() ? '/' : ''}`);
    }
  }
  visible.sort();
  const shown = visible.slice(0, MAX_DIRECTORY_ENTRIES);
  if (shown.length < visible.length) {
    shown.push(`Only the first ${String(MAX_DIRECTORY_ENTRIES)} entries from the scanned entries are shown.`);
  }
  if (limited) {
    shown.push(`Stopped after scanning ${String(MAX_SCANNED_ENTRIES)} entries; the directory listing is incomplete.`);
  }
  return shown.join('\n');
}

export interface ResearchFileEvidence {
  readonly path: string;
  readonly sha256: string;
}

export interface ResearchReaderOptions {
  readonly onRead?: (evidence: ResearchFileEvidence) => void;
}

export interface ResearchReadRange {
  readonly path: string;
  readonly offset?: number;
  readonly signal?: AbortSignal;
}

export interface ResearchLines {
  readonly lines: readonly string[];
  readonly offset: number;
  readonly hasMore: boolean;
}

export interface ResearchReader {
  list(path: string, signal?: AbortSignal): Promise<string>;
  read(path: string, signal?: AbortSignal): Promise<string>;
  readRange(request: ResearchReadRange): Promise<string>;
  readLines(request: ResearchReadRange): Promise<ResearchLines>;
}

function formatResearchLines({ lines, offset, hasMore }: ResearchLines): string {
  const shown = lines.map((line, index) => {
    const text = line.length > MAX_LINE_LENGTH ? `${line.slice(0, MAX_LINE_LENGTH)} [line truncated]` : line;
    return `${String(offset + index)}: ${text}`;
  });
  if (shown.length === 0) {
    shown.push(`No lines at or after ${String(offset)}.`);
  } else if (hasMore) {
    shown.push(offset === 1
      ? `Only the first ${String(MAX_LINES)} lines are shown.`
      : `Only lines ${String(offset)} through ${String(offset + MAX_LINES - 1)} are shown; later lines remain.`);
  }
  return shown.join('\n');
}

export async function createResearchReader(cwd: string, options: ResearchReaderOptions = {}): Promise<ResearchReader> {
  if (process.platform !== 'linux') {
    throw new Error('Research is available only on Linux and WSL.');
  }
  const path = await realpath(cwd);
  const identity = await stat(path);
  const root: ResearchRoot = { path, device: identity.dev, inode: identity.ino };

  async function readLines({ path, offset = 1, signal }: ResearchReadRange): Promise<ResearchLines> {
    if (!Number.isSafeInteger(offset) || offset < 1 || offset > MAX_FILE_BYTES + 1) {
      throw new Error('The line offset must be between 1 and 64001.');
    }
    signal?.throwIfAborted();
    const file = await openResearchPath({ root, path, directory: false, signal });
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) {
        throw new Error('Only regular files of at most 64000 bytes can be read.');
      }
      const bytes = await readBoundedFile(file, signal);
      if (bytes.includes(0)) {
        throw new Error('Binary files are not available for research.');
      }
      let body: string;
      try {
        body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch (cause) {
        throw new Error('The file is not valid UTF-8 text.', { cause });
      }
      const lines = body.split('\n');
      const start = offset - 1;
      const selected = lines.slice(start, start + MAX_LINES);
      const evidence = {
        path: relative(root.path, resolve(root.path, path)).split(sep).join('/'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
      options.onRead?.(evidence);
      return { lines: selected, offset, hasMore: start + selected.length < lines.length };
    } finally {
      await file.close();
    }
  }

  return {
    async list(path, signal) {
      signal?.throwIfAborted();
      const directory = await openResearchPath({ root, path, directory: true, signal });
      try {
        return await listDirectory(directory, signal);
      } finally {
        await directory.close();
      }
    },
    async read(path, signal) {
      return formatResearchLines(await readLines({ path, signal }));
    },
    async readRange(request) {
      return formatResearchLines(await readLines(request));
    },
    readLines,
  };
}
