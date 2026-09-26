import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, posix, relative, sep } from 'node:path';
import ignore from 'ignore';
import { LANGUAGE, languageForPath } from '../rules/catalog.ts';
import {
  buildFileState,
  type JevFileState,
  type JevRelatedFile,
  stateFitsBudget,
} from './model.ts';

const MAX_RELATED_FILES = 4;
const MAX_SCAN_FILES = 1_024;
const MAX_SCAN_DEPTH = 10;
const MAX_CANDIDATE_BYTES = 32_000;
const IGNORE_FILES = ['.gitignore', '.ignore', '.fdignore'] as const;
const SENSITIVE_NAME =
  /secret|credential|password|token|private.?key|api.?key|auth.?key|(?:^|[._-])(?:env|private|key)(?:[._-]|$)/iu;
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'coverage']);

interface Candidate {
  readonly path: string;
  readonly body: string;
}

interface ScanResult {
  readonly candidates: readonly Candidate[];
  readonly partial: boolean;
}

// Keep the edited file complete. Other files are included whole or not at all.
export function buildContextualState(
  cwd: string,
  path: string,
  body: string,
  kind: string,
  lines: Parameters<typeof buildFileState>[3],
): JevFileState | undefined {
  const base = buildFileState(path, body, kind, lines);
  if (!stateFitsBudget(base)) {
    return undefined;
  }

  const scan = scanSourceFiles(cwd, path);
  const imported = references(path, body);
  const related: JevRelatedFile[] = [];
  let partial = scan.partial;
  const matches = scan.candidates
    .flatMap((candidate) => {
      const importedByTarget = matchesReference(imported, candidate.path);
      const consumesTarget = matchesReference(
        references(candidate.path, candidate.body),
        path,
      );
      if (!importedByTarget && !consumesTarget) {
        return [];
      }
      return [
        {
          ...candidate,
          relation: importedByTarget ? 'imported' : 'consumer',
        } as const,
      ];
    })
    .sort((left, right) => {
      if (left.relation !== right.relation) {
        return left.relation === 'imported' ? -1 : 1;
      }
      return compareText(left.path, right.path);
    });

  for (const candidate of matches) {
    if (related.length >= MAX_RELATED_FILES) {
      partial = true;
      break;
    }
    const next = [...related, candidate];
    if (!stateFitsBudget(buildFileState(path, body, kind, lines, next))) {
      partial = true;
      continue;
    }
    related.push(candidate);
  }
  if (
    [...imported].some(
      (name) =>
        !related.some((file) => matchesReference(new Set([name]), file.path)),
    )
  ) {
    partial = true;
  }
  while (
    related.length > 0 &&
    !stateFitsBudget(buildFileState(path, body, kind, lines, related, partial))
  ) {
    related.pop();
    partial = true;
  }
  const state = buildFileState(path, body, kind, lines, related, partial);
  return stateFitsBudget(state) ? state : undefined;
}

function scanSourceFiles(cwd: string, editedPath: string): ScanResult {
  const root = realpathSync(cwd);
  const candidates: Candidate[] = [];
  let visited = 0;
  let partial = false;

  function visit(
    directory: string,
    depth: number,
    patterns: readonly string[],
  ): void {
    if (depth > MAX_SCAN_DEPTH || visited >= MAX_SCAN_FILES) {
      partial = true;
      return;
    }
    const localPatterns = [...patterns, ...readIgnorePatterns(directory, root)];
    const matcher = ignore().add(localPatterns);
    const entries = readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => compareText(a.name, b.name),
    );
    for (const entry of entries) {
      if (visited >= MAX_SCAN_FILES) {
        partial = true;
        return;
      }
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (entry.name.startsWith('.') || SENSITIVE_NAME.test(entry.name)) {
        continue;
      }
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name) && !matcher.ignores(`${path}/`)) {
          visit(absolute, depth + 1, localPatterns);
        }
        continue;
      }
      if (
        !entry.isFile() ||
        matcher.ignores(path) ||
        path === editedPath ||
        languageForPath(path) === LANGUAGE.generic
      ) {
        continue;
      }
      visited += 1;
      if (statSync(absolute).size > MAX_CANDIDATE_BYTES) {
        partial = true;
        continue;
      }
      candidates.push({ path, body: readFileSync(absolute, 'utf8') });
    }
  }

  visit(root, 0, []);
  return { candidates, partial };
}

function readIgnorePatterns(directory: string, root: string): string[] {
  const prefix = relative(root, directory).split(sep).join('/');
  const rules: string[] = [];
  for (const name of IGNORE_FILES) {
    const file = join(directory, name);
    if (!exists(file)) {
      continue;
    }
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || (trimmed.startsWith('#') && !trimmed.startsWith('\\#'))) {
        continue;
      }
      const negative = line.startsWith('!');
      const pattern = (negative ? line.slice(1) : line).replace(/^\//u, '');
      rules.push(
        `${negative ? '!' : ''}${prefix ? `${prefix}/` : ''}${pattern}`,
      );
    }
  }
  return rules;
}

function exists(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function modulePath(path: string): string {
  const extension = extname(path);
  const withoutExtension = extension ? path.slice(0, -extension.length) : path;
  return withoutExtension.endsWith('/index')
    ? withoutExtension.slice(0, -'/index'.length)
    : withoutExtension;
}

function references(path: string, body: string): Set<string> {
  const names = new Set<string>();
  const language = languageForPath(path);
  const code = body.replace(/\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\n]*$/gmu, '');
  if (language === LANGUAGE.typescript || language === LANGUAGE.javascript) {
    const imports = [
      /^[ \t]*(?:import|export)\s+(?:\{[^}]*\}|[^\n;]+)\s*from\s*['"](\.[^'"]+)['"]/gmu,
      /^[ \t]*import\s*['"](\.[^'"]+)['"]/gmu,
      /^[ \t]*(?:(?:const|let|var)\s+[\w{} ,]+\s*=\s*)?require\s*\(\s*['"](\.[^'"]+)['"]/gmu,
    ];
    for (const pattern of imports) {
      for (const match of code.matchAll(pattern)) {
        const specifier = match[1];
        if (specifier) {
          names.add(
            modulePath(
              posix.normalize(posix.join(posix.dirname(path), specifier)),
            ),
          );
        }
      }
    }
  }
  if (language === LANGUAGE.python) {
    for (const match of code.matchAll(
      /^[ \t]*from\s+(\.+)([\w.]*)\s+import\b/gmu,
    )) {
      const dots = match[1]?.length ?? 0;
      const specifier = match[2]?.replaceAll('.', '/') ?? '';
      const parent = posix.resolve(
        '/',
        posix.dirname(path),
        ...Array(dots - 1).fill('..'),
      );
      names.add(modulePath(posix.join(parent.slice(1), specifier)));
    }
  }
  if (language === LANGUAGE.rust) {
    let sourceRoot = posix.dirname(path);
    if (path.startsWith('src/')) {
      sourceRoot = 'src';
    } else if (path.includes('/src/')) {
      sourceRoot = path.slice(0, path.indexOf('/src/') + '/src'.length);
    }
    for (const match of code.matchAll(
      /^[ \t]*(?:pub\s+)?(?:use|mod)\s+(crate::)?([\w:]+)\s*[;{]/gmu,
    )) {
      const specifier = match[2]?.replaceAll('::', '/');
      if (specifier) {
        const from = match[1] ? sourceRoot : posix.dirname(path);
        names.add(modulePath(posix.join(from, specifier)));
      }
    }
  }
  if (language === LANGUAGE.php) {
    for (const match of code.matchAll(
      /^[ \t]*(?:require|include)(?:_once)?\s*(?:\(?\s*__DIR__\s*\.\s*)?['"](\.[^'"]+|\/[^'"]+)['"]/gmu,
    )) {
      const specifier = match[1];
      if (specifier) {
        names.add(
          modulePath(
            posix.normalize(posix.join(posix.dirname(path), specifier)),
          ),
        );
      }
    }
  }
  if (language === LANGUAGE.java) {
    for (const match of code.matchAll(
      /^[ \t]*import\s+(?:static\s+)?([\w.]+)\s*;/gmu,
    )) {
      const specifier = match[1]?.replaceAll('.', '/');
      if (specifier) {
        names.add(specifier);
      }
    }
  }
  if (language === LANGUAGE.go) {
    for (const declaration of code.matchAll(
      /^[ \t]*import\s*(?:\(([^)]*)\)|"([^"\n]+)")/gmu,
    )) {
      const quoted = declaration[1] ?? `"${declaration[2] ?? ''}"`;
      for (const match of quoted.matchAll(/"([^"\n]+)"/gu)) {
        if (match[1]) {
          names.add(match[1]);
        }
      }
    }
  }
  return names;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function matchesReference(names: ReadonlySet<string>, path: string): boolean {
  const target = modulePath(path);
  if (names.has(target)) {
    return true;
  }
  for (const name of names) {
    if (path.endsWith('.java') && target.endsWith(`/${name}`)) {
      return true;
    }
    if (path.endsWith('.go')) {
      const packageParts = name.split('/');
      const packageSuffix = packageParts.slice(-2).join('/');
      if (
        packageParts.length >= 2 &&
        posix.dirname(path).endsWith(`/${packageSuffix}`)
      ) {
        return true;
      }
    }
  }
  return false;
}
