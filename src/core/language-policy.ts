import { existsSync } from 'node:fs';
import path from 'node:path';

import type { Language } from './types.ts';

/** The policy assigned to one confirmed project-relative target file. */
export interface FilePolicy {
  readonly file: string;
  readonly policy: Language | 'shared';
}

/** Synthetic file label marking a policy inferred from repository evidence. */
export const INFERRED_SCOPE = '<inferred-repo-scope>';

/** A deterministic result of inspecting the request and bounded repository evidence. */
export type LanguagePolicyDetection =
  | { readonly kind: 'detected'; readonly policies: readonly FilePolicy[] }
  | {
      readonly kind: 'inferred';
      readonly policies: readonly FilePolicy[];
      readonly note: string;
    }
  | { readonly kind: 'clarification'; readonly reason: string };

/** Minimal filesystem seam for deterministic language-policy detection. */
export interface LanguagePolicyDetectorOptions {
  readonly cwd: string;
  readonly exists?: (file: string) => boolean;
}

/**
 * Detect per-file policy from explicit request paths; never infer a language from
 * natural-language intent. Pathless requests never require clarification: they
 * resolve repository evidence from the current directory upward and fall back to
 * the shared policy when no marker exists. PHP requires local Composer evidence
 * before Laravel policy can be selected.
 */
export function detectLanguagePolicies(
  request: string,
  options: LanguagePolicyDetectorOptions,
): LanguagePolicyDetection {
  const candidates = requestPaths(request);
  const files: string[] = [];
  for (const candidate of candidates) {
    const normalized = projectRelativePath(candidate, options.cwd);
    if (normalized === undefined) {
      return {
        kind: 'clarification',
        reason: 'Sideroom accepts targets only inside the current project.',
      };
    }
    files.push(normalized);
  }
  if (files.length === 0) {
    const exists = options.exists ?? existsSync;
    const inferred = inferPoliciesFromRepoEvidence(options.cwd, exists);
    if (inferred.length > 0) {
      return {
        kind: 'inferred',
        policies: inferred,
        note: `Inferred ${inferred.map(({ policy }) => policy).join(', ')} from repository evidence.`,
      };
    }
    return {
      kind: 'inferred',
      policies: [{ file: INFERRED_SCOPE, policy: 'shared' }],
      note: 'No repository evidence found; continuing with the shared engineering policy.',
    };
  }

  const exists = options.exists ?? existsSync;
  const policies: FilePolicy[] = [];
  for (const file of [...new Set(files)].sort()) {
    const policy = policyFor(file, options.cwd, exists);
    if (policy === undefined) {
      return {
        kind: 'clarification',
        reason: `Sideroom needs Laravel or Composer evidence before assigning a policy to ${file}.`,
      };
    }
    policies.push({ file, policy });
  }
  return { kind: 'detected', policies };
}

function inferPoliciesFromRepoEvidence(
  cwd: string,
  exists: (file: string) => boolean,
): FilePolicy[] {
  const inferred: FilePolicy[] = [];
  if (hasMarkerInTree(cwd, 'composer.json', exists)) {
    inferred.push({ file: INFERRED_SCOPE, policy: 'php-laravel' });
  }
  if (hasMarkerInTree(cwd, 'go.mod', exists)) {
    inferred.push({ file: INFERRED_SCOPE, policy: 'go' });
  }
  if (hasMarkerInTree(cwd, 'Cargo.toml', exists)) {
    inferred.push({ file: INFERRED_SCOPE, policy: 'rust' });
  }
  const packageDir = nearestMarkerDir(cwd, 'package.json', exists);
  if (packageDir !== undefined) {
    if (exists(path.join(packageDir, 'tsconfig.json'))) {
      inferred.push({ file: INFERRED_SCOPE, policy: 'typescript' });
    } else {
      inferred.push({ file: INFERRED_SCOPE, policy: 'javascript' });
    }
  }
  if (
    hasMarkerInTree(cwd, 'pyproject.toml', exists) ||
    hasMarkerInTree(cwd, 'setup.py', exists) ||
    hasMarkerInTree(cwd, 'setup.cfg', exists) ||
    hasMarkerInTree(cwd, 'requirements.txt', exists)
  ) {
    inferred.push({ file: INFERRED_SCOPE, policy: 'python' });
  }
  if (
    hasMarkerInTree(cwd, 'pom.xml', exists) ||
    hasMarkerInTree(cwd, 'build.gradle', exists) ||
    hasMarkerInTree(cwd, 'build.gradle.kts', exists)
  ) {
    inferred.push({ file: INFERRED_SCOPE, policy: 'java' });
  }
  return inferred;
}

/** Check one marker file in the current directory and every parent directory. */
function hasMarkerInTree(
  cwd: string,
  marker: string,
  exists: (file: string) => boolean,
): boolean {
  return nearestMarkerDir(cwd, marker, exists) !== undefined;
}

/** Find the nearest directory at or above cwd containing the marker file. */
function nearestMarkerDir(
  cwd: string,
  marker: string,
  exists: (file: string) => boolean,
): string | undefined {
  let current = path.resolve(cwd);
  while (true) {
    if (exists(path.join(current, marker))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function requestPaths(request: string): readonly string[] {
  return request
    .split(/\s+/)
    .map(normalizePathToken)
    .filter((token) => isPathLike(token));
}

function normalizePathToken(token: string): string {
  const markdownLink = /^\[[^\]]+\]\(([^)]+)\)[`,;.!?:]*$/.exec(token);
  const target = markdownLink?.[1] ?? token;
  return target.replace(/^[('"`]+/, '').replace(/[`),;.!?:]+$/, '');
}

function isPathLike(token: string): boolean {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(token)) {
    return false;
  }
  return (
    /\.[A-Za-z0-9]+$/.test(token) ||
    ['README', 'Dockerfile', 'Makefile'].includes(token)
  );
}

function projectRelativePath(
  candidate: string,
  cwd: string,
): string | undefined {
  if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate)) {
    return undefined;
  }
  const resolved = path.resolve(cwd, candidate);
  const relative = path.relative(cwd, resolved);
  if (
    relative.length === 0 ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`)
  ) {
    return undefined;
  }
  return relative.split(path.sep).join('/');
}

function policyFor(
  file: string,
  cwd: string,
  exists: (file: string) => boolean,
): FilePolicy['policy'] | undefined {
  const extension = path.extname(file).toLowerCase();
  if (isSharedPolicyPath(file, extension)) {
    return 'shared';
  }
  if (extension === '.ts' || extension === '.tsx') {
    return 'typescript';
  }
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    return 'javascript';
  }
  if (extension === '.py') {
    return 'python';
  }
  if (extension === '.java') {
    return 'java';
  }
  if (extension === '.go') {
    return 'go';
  }
  if (extension === '.rs') {
    return 'rust';
  }
  if (extension === '.php') {
    return hasMarkerInTree(cwd, 'composer.json', exists)
      ? 'php-laravel'
      : undefined;
  }
  return 'shared';
}

function isSharedPolicyPath(file: string, extension: string): boolean {
  const name = path.basename(file).toLowerCase();
  return extension === '.md' || name.includes('.config.');
}
