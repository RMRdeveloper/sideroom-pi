import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { projectRelativePath } from '../shared/file-path.ts';
import { isMissingFile } from '../shared/read-file.ts';
import {
  allowedPath,
  createPathPolicy,
  MAX_FILE_BYTES,
  type VisualPathPolicy,
} from './files.ts';
import { InvalidMarkup } from './markup.ts';
import { matchSource, sourceFingerprint, sourceMatches } from './match.ts';
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
const MAX_ENTRIES = 4_096;
const MAX_SOURCE_BYTES = 8_388_608;
const MAX_DEPTH = 16;

export function resolveSelection(
  cwd: string,
  selection: VisualSelection,
): SourceResolution {
  if (selection.source) {
    return resolveCompilerLocation({ cwd, selection });
  }
  return scanSource({ cwd, selection, paths: createPathPolicy(cwd) });
}

interface SourceScanInput {
  readonly cwd: string;
  readonly selection: VisualSelection;
  readonly paths: VisualPathPolicy;
}

function scanSource({
  cwd,
  selection,
  paths,
}: SourceScanInput): SourceResolution {
  const root = realpathSync(cwd);
  const candidates: SourceCandidate[] = [];
  let entriesRead = 0;
  let sourceBytes = 0;
  let truncated = false;
  let capped = false;
  function walk(directory: string, depth: number): void {
    if (depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      entriesRead += 1;
      if (entriesRead > MAX_ENTRIES || sourceBytes >= MAX_SOURCE_BYTES) {
        truncated = true;
        return;
      }
      const absolutePath = paths.allowedPath(join(directory, entry.name));
      if (!absolutePath) {
        continue;
      }
      const path = relative(root, absolutePath).split(sep).join('/');
      if (entry.isDirectory()) {
        walk(absolutePath, depth + 1);
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
        for (const candidate of sourceMatches({ path, source, selection })) {
          candidates.push(candidate);
          candidates.sort(compareCandidates);
          if (candidates.length > MAX_CANDIDATES) {
            capped = true;
            candidates.pop();
          }
        }
      } catch (cause) {
        if (cause instanceof InvalidMarkup) {
          truncated = true;
          continue;
        }
        throw new Error(`Cannot inspect visual source ${path}`, { cause });
      }
    }
  }
  walk(root, 0);
  return { candidates, truncated, capped };
}

function compareCandidates(
  left: SourceCandidate,
  right: SourceCandidate,
): number {
  return (
    right.score - left.score ||
    left.path.localeCompare(right.path) ||
    left.startLine - right.startLine
  );
}

interface CompilerLocationInput {
  readonly cwd: string;
  readonly selection: VisualSelection;
  readonly project?: string;
}

export function resolveCompilerLocation({
  cwd,
  selection,
  project,
}: CompilerLocationInput): SourceResolution {
  const location = selection.source;
  if (!location) {
    throw new Error('A compiler source location is required.');
  }
  const unresolved = (issue: string): SourceResolution => ({
    candidates: [],
    truncated: false,
    capped: false,
    issue,
  });
  if (!isAbsolute(location.path) && project === undefined) {
    return unresolved(
      'Associate this page with a project in F7 before resolving a relative compiler path.',
    );
  }
  const projectRoot = project === undefined ? cwd : allowedPath(cwd, project);
  if (!projectRoot || !statSync(projectRoot).isDirectory()) {
    return unresolved('The associated project is missing or excluded.');
  }
  const absolute = allowedPath(projectRoot, location.path);
  if (
    !absolute ||
    !allowedPath(cwd, absolute) ||
    !statSync(absolute).isFile() ||
    statSync(absolute).size > MAX_FILE_BYTES
  ) {
    return unresolved(
      'The compiler path is missing, excluded, outside the project, or too large.',
    );
  }
  const path = relative(realpathSync(cwd), absolute).split(sep).join('/');
  if (
    ![...SOURCE_EXTENSIONS, '.js', '.mjs', '.ts', '.mts'].includes(
      extname(path).toLowerCase(),
    )
  ) {
    return unresolved('The compiler path has an unsupported source format.');
  }
  try {
    const candidates = matchSource({
      path,
      source: readFileSync(absolute, 'utf8'),
      selection,
      location,
    });
    if (candidates.length !== 1) {
      return unresolved(
        'The compiler location does not match the selected tag in current local markup. Restart or refresh the development page.',
      );
    }
    return { candidates, truncated: false, capped: false };
  } catch (cause) {
    if (cause instanceof InvalidMarkup) {
      return unresolved(
        'The compiler source could not be parsed; its location was not accepted.',
      );
    }
    throw new Error(`Cannot verify compiler source ${path}`, { cause });
  }
}

export function resolveProjectSelection({
  cwd,
  selection,
  project,
}: CompilerLocationInput): SourceResolution {
  if (selection.source) {
    return resolveCompilerLocation({ cwd, selection, project });
  }
  if (project === undefined) {
    return resolveSelection(cwd, selection);
  }
  const workspaceRoot = realpathSync(cwd);
  const paths = createPathPolicy(workspaceRoot);
  const root = paths.allowedPath(project);
  if (!root || !statSync(root).isDirectory()) {
    return {
      candidates: [],
      truncated: false,
      capped: false,
      issue: 'The associated project is missing or excluded.',
    };
  }
  const resolution = scanSource({ cwd: root, selection, paths });
  return {
    ...resolution,
    candidates: resolution.candidates
      .filter((candidate) => paths.allowedPath(join(root, candidate.path)))
      .map((candidate) => ({
        ...candidate,
        path: relative(workspaceRoot, join(root, candidate.path))
          .split(sep)
          .join('/'),
      })),
  };
}

export function candidateIsCurrent(
  cwd: string,
  candidate: SourceCandidate,
): boolean {
  return currentCandidates(cwd, [candidate]).length === 1;
}

export function currentCandidates(
  cwd: string,
  candidates: readonly SourceCandidate[],
): readonly SourceCandidate[] {
  let paths: VisualPathPolicy | undefined;
  const versions = new Map<
    string,
    { readonly fingerprint: string; readonly lines: number } | undefined
  >();
  return candidates.filter((candidate) => {
    try {
      paths ??= createPathPolicy(cwd);
      const absolutePath = paths.allowedPath(candidate.path);
      if (!absolutePath) {
        return false;
      }
      if (!versions.has(absolutePath)) {
        let version:
          | { readonly fingerprint: string; readonly lines: number }
          | undefined;
        if (
          projectRelativePath(cwd, absolutePath) !== undefined &&
          statSync(absolutePath).size <= MAX_FILE_BYTES
        ) {
          const source = readFileSync(absolutePath, 'utf8');
          version = {
            fingerprint: sourceFingerprint(source),
            lines: source.split('\n').length,
          };
        }
        versions.set(absolutePath, version);
      }
      const version = versions.get(absolutePath);
      return (
        version !== undefined &&
        version.fingerprint === candidate.fingerprint &&
        candidate.endLine <= version.lines
      );
    } catch (cause) {
      if (isGone(cause)) {
        return false;
      }
      throw new Error(`Cannot verify selected source ${candidate.path}`, {
        cause,
      });
    }
  });
}

function isGone(cause: unknown): boolean {
  return (
    isMissingFile(cause) ||
    (cause instanceof Error && 'code' in cause && cause.code === 'ENOTDIR')
  );
}
