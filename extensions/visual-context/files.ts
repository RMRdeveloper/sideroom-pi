import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';
import { isMissingFile } from '../shared/read-file.ts';

export const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'vendor',
]);
export const MAX_FILE_BYTES = 262_144;
export const SENSITIVE_NAME =
  /secret|credential|password|private.?key|(?:^|[._-])env(?:[._-]|$)/iu;
const IGNORE_FILES = ['.gitignore', '.ignore', '.fdignore'];

export function ignorePatterns(
  directory: string,
  root: string,
): readonly string[] {
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
      let nested = pattern;
      if (prefix && pattern.startsWith('/')) {
        nested = `${prefix}/${pattern.slice(1)}`;
      } else if (prefix && pattern.replace(/\/$/u, '').includes('/')) {
        nested = `${prefix}/${pattern}`;
      } else if (prefix) {
        nested = `${prefix}/**/${pattern}`;
      }
      patterns.push(`${negated ? '!' : ''}${nested}`);
    }
  }
  return patterns;
}

export function excludedName(name: string): boolean {
  return (
    name.startsWith('.') ||
    SENSITIVE_NAME.test(name) ||
    [...name].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    SKIP_DIRECTORIES.has(name)
  );
}

export interface VisualPathPolicy {
  readonly allowedPath: (path: string) => string | undefined;
}

// Reuse ignore rules only within one synchronous operation. File metadata is
// always read again: a remembered path must not authorize a replacement symlink.
export function createPathPolicy(cwd: string): VisualPathPolicy {
  const root = realpathSync(cwd);
  const policies = new Map<
    string,
    {
      readonly patterns: readonly string[];
      readonly matcher: ReturnType<typeof ignore>;
    }
  >();
  return { allowedPath: resolvePath };

  function resolvePath(path: string): string | undefined {
    const absolute = resolve(root, path);
    const local = relative(root, absolute);
    if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
      return undefined;
    }
    let directory = root;
    let patterns: readonly string[] = [];
    const parts = local.split(sep).filter(Boolean);
    for (const [index, name] of parts.entries()) {
      if (excludedName(name)) {
        return undefined;
      }
      let policy = policies.get(directory);
      if (!policy) {
        const inherited = [...patterns, ...ignorePatterns(directory, root)];
        policy = { patterns: inherited, matcher: ignore().add(inherited) };
        policies.set(directory, policy);
      }
      patterns = policy.patterns;
      const next = join(directory, name);
      let entry: ReturnType<typeof lstatSync>;
      try {
        entry = lstatSync(next);
      } catch (cause) {
        if (
          isMissingFile(cause) ||
          (cause instanceof Error &&
            'code' in cause &&
            cause.code === 'ENOTDIR')
        ) {
          return undefined;
        }
        throw new Error(`Cannot inspect visual path ${local}`, { cause });
      }
      const childPath = relative(root, next).split(sep).join('/');
      if (
        entry.isSymbolicLink() ||
        policy.matcher.ignores(
          entry.isDirectory() ? `${childPath}/` : childPath,
        )
      ) {
        return undefined;
      }
      if (index < parts.length - 1 && !entry.isDirectory()) {
        return undefined;
      }
      directory = next;
    }
    return absolute;
  }
}

// Browser paths are untrusted, including paths reported by compiler plugins.
export function allowedPath(cwd: string, path: string): string | undefined {
  return createPathPolicy(cwd).allowedPath(path);
}
