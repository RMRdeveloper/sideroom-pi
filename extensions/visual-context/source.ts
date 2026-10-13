import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import ignore from 'ignore';
import { projectRelativePath } from '../shared/file-path.ts';
import { isMissingFile } from '../shared/read-file.ts';
import { InvalidMarkup } from './markup.ts';
import { matchSource, sourceFingerprint } from './match.ts';
import {
  MAX_CANDIDATES,
  type SourceCandidate,
  type SourceResolution,
  type VisualSelection,
} from './model.ts';

const SOURCE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.vue',
  '.svelte',
  '.astro',
  '.jsx',
  '.tsx',
]);
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'vendor',
]);
const IGNORE_FILES = ['.gitignore', '.ignore', '.fdignore'];
const MAX_ENTRIES = 4_096;
const MAX_FILE_BYTES = 262_144;
const MAX_SOURCE_BYTES = 8_388_608;
const MAX_DEPTH = 16;
const SENSITIVE_NAME =
  /secret|credential|password|private.?key|(?:^|[._-])env(?:[._-]|$)/iu;

export function resolveSelection(
  cwd: string,
  selection: VisualSelection,
): SourceResolution {
  const root = realpathSync(cwd);
  const candidates: SourceCandidate[] = [];
  let entriesRead = 0;
  let sourceBytes = 0;
  let truncated = false;
  function walk({
    directory,
    patterns,
    depth,
  }: {
    readonly directory: string;
    readonly patterns: readonly string[];
    readonly depth: number;
  }): void {
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    const localPatterns = [...patterns, ...ignorePatterns(directory, root)];
    const matcher = ignore().add(localPatterns);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      entriesRead += 1;
      if (entriesRead > MAX_ENTRIES || sourceBytes >= MAX_SOURCE_BYTES) {
        truncated = true;
        return;
      }
      if (
        entry.name.startsWith('.') ||
        [...entry.name].some(
          (character) =>
            character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ) ||
        SENSITIVE_NAME.test(entry.name) ||
        entry.isSymbolicLink()
      ) {
        continue;
      }
      const absolutePath = join(directory, entry.name);
      const path = relative(root, absolutePath).split(sep).join('/');
      if (matcher.ignores(entry.isDirectory() ? `${path}/` : path)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) {
          walk({
            directory: absolutePath,
            patterns: localPatterns,
            depth: depth + 1,
          });
        }
        continue;
      }
      if (
        !entry.isFile() ||
        !SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())
      ) {
        continue;
      }
      const size = statSync(absolutePath).size;
      if (size > MAX_FILE_BYTES || sourceBytes + size > MAX_SOURCE_BYTES) {
        truncated = true;
        continue;
      }
      sourceBytes += size;
      const source = readFileSync(absolutePath, 'utf8');
      try {
        candidates.push(...matchSource({ path, source, selection }));
      } catch (cause) {
        if (cause instanceof InvalidMarkup) {
          truncated = true;
          continue;
        }
        throw new Error(`Cannot inspect visual source ${path}`, { cause });
      }
    }
  }
  walk({ directory: root, patterns: [], depth: 0 });
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.path.localeCompare(right.path) ||
      left.startLine - right.startLine,
  );
  return {
    candidates: candidates.slice(0, MAX_CANDIDATES),
    truncated,
    capped: candidates.length > MAX_CANDIDATES,
  };
}

function ignorePatterns(directory: string, root: string): readonly string[] {
  const prefix = relative(root, directory).split(sep).join('/');
  const patterns: string[] = [];
  for (const file of IGNORE_FILES) {
    let source: string;
    try {
      source = readFileSync(join(directory, file), 'utf8');
    } catch (cause) {
      if (isMissingFile(cause)) {
        continue;
      }
      throw new Error(`Cannot read ignore file ${file}`, { cause });
    }
    for (const line of source.split(/\r?\n/u)) {
      if (!line || line.startsWith('#')) {
        continue;
      }
      const negated = line.startsWith('!');
      const pattern = negated ? line.slice(1) : line;
      const nested = prefix
        ? `${prefix}/${pattern.startsWith('/') ? pattern.slice(1) : pattern.includes('/') ? pattern : `**/${pattern}`}`
        : pattern;
      patterns.push(`${negated ? '!' : ''}${nested}`);
    }
  }
  return patterns;
}

export function candidateIsCurrent(
  cwd: string,
  candidate: SourceCandidate,
): boolean {
  try {
    const absolutePath = realpathSync(join(cwd, candidate.path));
    if (
      projectRelativePath(cwd, absolutePath) === undefined ||
      statSync(absolutePath).size > MAX_FILE_BYTES
    ) {
      return false;
    }
    const source = readFileSync(absolutePath, 'utf8');
    return (
      sourceFingerprint(source) === candidate.fingerprint &&
      candidate.endLine <= source.split('\n').length
    );
  } catch (cause) {
    if (isGone(cause)) {
      return false;
    }
    throw new Error(`Cannot verify selected source ${candidate.path}`, {
      cause,
    });
  }
}

// A path that turned into a file on the way reports ENOTDIR, which means the
// remembered source is gone rather than unreadable.
function isGone(cause: unknown): boolean {
  return (
    isMissingFile(cause) ||
    (cause instanceof Error && 'code' in cause && cause.code === 'ENOTDIR')
  );
}
