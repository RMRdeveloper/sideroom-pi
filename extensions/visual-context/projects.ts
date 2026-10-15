import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import ignore from 'ignore';
import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';
import {
  CONFIG_KINDS,
  CORE_PACKAGE,
  type ConfigKind,
  INSPECTOR_PACKAGE,
  LOADER_PACKAGE,
} from './compiler-config.ts';
import {
  allowedPath,
  excludedName,
  ignorePatterns,
  MAX_FILE_BYTES,
} from './files.ts';
import { cleanLabel } from './model.ts';

const MAX_PROJECT_DEPTH = 3;
const MAX_ENTRIES = 4_096;
const MAX_PROJECTS = 64;
const CONFIG_EXTENSIONS = ['ts', 'mts', 'js', 'mjs', 'cjs'];
const ManifestSchema = Type.Object({
  name: Type.Optional(Type.String()),
  packageManager: Type.Optional(Type.String()),
  dependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
  devDependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
  scripts: Type.Optional(Type.Record(Type.String(), Type.String())),
  workspaces: Type.Optional(Type.Unknown()),
});
export type ProjectManifest = Static<typeof ManifestSchema>;
export interface VisualProject {
  readonly path: string;
  readonly name: string;
  readonly config?: string;
  readonly kind?: ConfigKind;
  readonly manager: 'npm' | 'pnpm' | 'yarn' | 'bun';
  readonly installed: boolean;
}

export function readManifest(root: string): ProjectManifest {
  const path = allowedPath(root, 'package.json');
  if (!path || statSync(path).size > MAX_FILE_BYTES) {
    throw new Error(
      'The project needs a readable package.json within the file limit.',
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (cause) {
    throw new Error(`Cannot read project manifest at ${path}.`, { cause });
  }
  if (!Check(ManifestSchema, manifest)) {
    throw new Error(`Invalid project manifest in ${root}.`);
  }
  return manifest;
}

function packageManager(
  root: string,
  manifest: ProjectManifest,
): VisualProject['manager'] | undefined {
  if (manifest.packageManager) {
    const manager = manifest.packageManager.split('@')[0];
    if (
      manager === 'npm' ||
      manager === 'pnpm' ||
      manager === 'yarn' ||
      manager === 'bun'
    ) {
      return manager;
    }
    throw new Error(`Unsupported package manager: ${manifest.packageManager}`);
  }
  const locks = [
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
    ['bun', 'bun.lock'],
    ['bun', 'bun.lockb'],
    ['npm', 'package-lock.json'],
  ] as const;
  const managers = [
    ...new Set(
      locks
        .filter(([, file]) => allowedPath(root, file))
        .map(([manager]) => manager),
    ),
  ];
  if (managers.length > 1) {
    throw new Error(`Conflicting package-manager lockfiles in ${root}.`);
  }
  return managers[0];
}

interface ProjectManagerInput {
  readonly cwd: string;
  readonly root: string;
  readonly manifest: ProjectManifest;
}

function projectManager({
  cwd,
  root,
  manifest,
}: ProjectManagerInput): VisualProject['manager'] {
  const own = packageManager(root, manifest);
  if (own) {
    return own;
  }
  let ancestor = dirname(root);
  while (root !== cwd && allowedPath(cwd, ancestor)) {
    const parentManifest = allowedPath(cwd, join(ancestor, 'package.json'))
      ? readManifest(ancestor)
      : undefined;
    if (
      parentManifest?.workspaces ||
      allowedPath(cwd, join(ancestor, 'pnpm-workspace.yaml'))
    ) {
      const inherited = packageManager(ancestor, parentManifest ?? {});
      if (inherited) {
        return inherited;
      }
    }
    if (ancestor === cwd) {
      break;
    }
    ancestor = dirname(ancestor);
  }
  return 'npm';
}

export function inspectProject(cwd: string, project: string): VisualProject {
  const root = allowedPath(cwd, project);
  if (!root || !statSync(root).isDirectory()) {
    throw new Error(
      'Choose a non-ignored project inside the Pi working directory.',
    );
  }
  const manifest = readManifest(root);
  const configs = CONFIG_KINDS.flatMap((kind) =>
    CONFIG_EXTENSIONS.flatMap((extension) => {
      const config = `${kind}.config.${extension}`;
      return allowedPath(root, config) ? [{ kind, config }] : [];
    }),
  );
  const primaryKind = configs[0]?.kind;
  const primary = configs.filter((config) => config.kind === primaryKind);
  if (primary.length > 1) {
    throw new Error(
      `Multiple ${primaryKind} configuration files in ${project}; choose one configuration before setup.`,
    );
  }
  const config = primary[0];
  return {
    path: relative(cwd, root).split(sep).join('/') || '.',
    name: cleanLabel(manifest.name ?? project, 160),
    manager: projectManager({ cwd, root, manifest }),
    kind: config?.kind,
    config: config
      ? join(project, config.config).split(sep).join('/')
      : undefined,
    installed: Boolean(
      manifest.devDependencies?.[INSPECTOR_PACKAGE] ||
        manifest.dependencies?.[INSPECTOR_PACKAGE] ||
        manifest.devDependencies?.[CORE_PACKAGE] ||
        manifest.devDependencies?.[LOADER_PACKAGE] ||
        manifest.dependencies?.[CORE_PACKAGE] ||
        manifest.dependencies?.[LOADER_PACKAGE],
    ),
  };
}

export function discoverProjects(cwd: string): {
  readonly projects: readonly VisualProject[];
  readonly truncated: boolean;
  readonly issues: readonly string[];
} {
  const projects: VisualProject[] = [];
  const issues: string[] = [];
  let entries = 0;
  let truncated = false;
  function walk(directory: string, depth: number): void {
    if (depth > MAX_PROJECT_DEPTH || projects.length >= MAX_PROJECTS) {
      truncated = true;
      return;
    }
    const local = relative(cwd, directory).split(sep).join('/') || '.';
    if (allowedPath(cwd, join(local, 'package.json'))) {
      try {
        projects.push(inspectProject(cwd, local));
      } catch (cause) {
        issues.push(`${local}: ${String(cause)}`);
      }
    }
    const matcher = ignore().add(ignorePatterns(directory, cwd));
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      entries += 1;
      if (entries > MAX_ENTRIES || projects.length >= MAX_PROJECTS) {
        truncated = true;
        return;
      }
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        excludedName(entry.name)
      ) {
        continue;
      }
      const path = join(directory, entry.name);
      if (
        matcher.ignores(`${relative(cwd, path).split(sep).join('/')}/`) ||
        !allowedPath(cwd, relative(cwd, path))
      ) {
        continue;
      }
      walk(path, depth + 1);
    }
  }
  walk(cwd, 0);
  return { projects, truncated, issues };
}
