import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projectRelativePath,
  resolveFileToolPath,
} from '../shared/file-path.ts';

export interface CheckCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly display: string;
}

export const CHECK_RESOLUTION = {
  detected: 'detected',
  absent: 'absent',
  unknown: 'unknown',
} as const;

export type CheckResolution =
  | {
    readonly kind: typeof CHECK_RESOLUTION.detected;
    readonly command: CheckCommand;
  }
  | { readonly kind: typeof CHECK_RESOLUTION.absent }
  | { readonly kind: typeof CHECK_RESOLUTION.unknown };

const DETECTION_FILE = {
  packageJson: 'package.json',
  pnpmLock: 'pnpm-lock.yaml',
  yarnLock: 'yarn.lock',
  bunLock: 'bun.lock',
  bunLockb: 'bun.lockb',
  pyproject: 'pyproject.toml',
  setupPy: 'setup.py',
  goMod: 'go.mod',
  cargoToml: 'Cargo.toml',
  makefile: 'Makefile',
} as const;

const DETECTION_FILES = new Set<string>(Object.values(DETECTION_FILE));
const detectedCommands = new Map<string, CheckCommand | undefined>();
const detectedTestSetups = new Map<string, boolean>();

export const PACKAGE_MANAGER = {
  npm: 'npm',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun',
} as const;

type PackageManager = (typeof PACKAGE_MANAGER)[keyof typeof PACKAGE_MANAGER];

const SCRIPT_PRIORITY = [
  'check',
  'test',
  'lint',
  'typecheck',
  'types',
] as const;

export function detectCheckCommand(cwd: string): CheckCommand | undefined {
  const packageCommand = detectPackageCommand(cwd);
  if (packageCommand !== undefined) {
    return packageCommand;
  }
  if (
    existsSync(join(cwd, DETECTION_FILE.pyproject)) ||
    existsSync(join(cwd, DETECTION_FILE.setupPy))
  ) {
    return command('pytest', ['-q']);
  }
  if (existsSync(join(cwd, DETECTION_FILE.goMod))) {
    return command('go', ['test', './...']);
  }
  if (existsSync(join(cwd, DETECTION_FILE.cargoToml))) {
    return command('cargo', ['test']);
  }
  if (hasMakeCheck(cwd)) {
    return command('make', ['check']);
  }
  return undefined;
}

export function commandMatches(text: string, check: CheckCommand): boolean {
  return collapseHorizontalSpace(text.trim()) === collapseHorizontalSpace(check.display);
}

export function resolveCheckCommand(cwd: string): CheckResolution {
  if (detectedCommands.has(cwd)) {
    const command = detectedCommands.get(cwd);
    return command === undefined
      ? { kind: CHECK_RESOLUTION.absent }
      : { kind: CHECK_RESOLUTION.detected, command };
  }
  try {
    const command = detectCheckCommand(cwd);
    detectedCommands.set(cwd, command);
    return command === undefined
      ? { kind: CHECK_RESOLUTION.absent }
      : { kind: CHECK_RESOLUTION.detected, command };
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return { kind: CHECK_RESOLUTION.unknown };
  }
}

export function resolveCachedTestSetup(cwd: string): boolean {
  const cached = detectedTestSetups.get(cwd);
  if (cached !== undefined) {
    return cached;
  }
  try {
    const hasTests = hasTestSetup(cwd);
    detectedTestSetups.set(cwd, hasTests);
    return hasTests;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return false;
  }
}

export function invalidateProjectDetection(cwd: string): void {
  detectedCommands.delete(cwd);
  detectedTestSetups.delete(cwd);
}

export function isDirectDetectionFile(cwd: string, path: string): boolean {
  let relativePath: string | undefined;
  try {
    const absolute = resolveFileToolPath(cwd, path);
    relativePath = absolute === undefined
      ? undefined
      : projectRelativePath(cwd, absolute);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return false;
  }
  return relativePath !== undefined && DETECTION_FILES.has(relativePath);
}

export function hasTestSetup(cwd: string): boolean {
  if (hasPackageTestScript(cwd)) {
    return true;
  }
  if (
    existsSync(join(cwd, DETECTION_FILE.pyproject)) ||
    existsSync(join(cwd, DETECTION_FILE.setupPy))
  ) {
    return true;
  }
  if (existsSync(join(cwd, DETECTION_FILE.goMod))) {
    return true;
  }
  return existsSync(join(cwd, DETECTION_FILE.cargoToml));
}

function hasPackageTestScript(cwd: string): boolean {
  const packagePath = join(cwd, DETECTION_FILE.packageJson);
  if (!existsSync(packagePath)) {
    return false;
  }
  return typeof readScripts(packagePath).test === 'string';
}

function detectPackageCommand(cwd: string): CheckCommand | undefined {
  const packagePath = join(cwd, DETECTION_FILE.packageJson);
  if (!existsSync(packagePath)) {
    return undefined;
  }

  const scripts = readScripts(packagePath);
  const script = SCRIPT_PRIORITY.find(
    (name) => typeof scripts[name] === 'string',
  );
  if (script === undefined) {
    return undefined;
  }

  const manager = packageManager(cwd);
  if (manager === PACKAGE_MANAGER.yarn) {
    return command(PACKAGE_MANAGER.yarn, [script]);
  }
  return command(manager, ['run', script]);
}

function readScripts(path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      scripts?: Record<string, unknown>;
    };
    return parsed.scripts ?? {};
  } catch (error) {
    throw new Error(`Failed to read scripts from ${path}`, { cause: error });
  }
}

function packageManager(cwd: string): PackageManager {
  if (existsSync(join(cwd, DETECTION_FILE.pnpmLock))) {
    return PACKAGE_MANAGER.pnpm;
  }
  if (existsSync(join(cwd, DETECTION_FILE.yarnLock))) {
    return PACKAGE_MANAGER.yarn;
  }
  if (
    existsSync(join(cwd, DETECTION_FILE.bunLockb)) ||
    existsSync(join(cwd, DETECTION_FILE.bunLock))
  ) {
    return PACKAGE_MANAGER.bun;
  }
  return PACKAGE_MANAGER.npm;
}

function hasMakeCheck(cwd: string): boolean {
  const path = join(cwd, DETECTION_FILE.makefile);
  if (!existsSync(path)) {
    return false;
  }
  try {
    return /^check:/m.test(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to read ${path}`, { cause: error });
  }
}

function command(executable: string, args: readonly string[]): CheckCommand {
  return {
    executable,
    args,
    display: [executable, ...args].join(' '),
  };
}

function collapseHorizontalSpace(value: string): string {
  return value.replaceAll(/[ \t]+/g, ' ');
}
