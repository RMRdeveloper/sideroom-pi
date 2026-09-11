import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CheckCommand {
  readonly executable: string;
  readonly args: readonly string[];
  readonly display: string;
}

const SHELL_OPERATOR = {
  and: '&&',
  or: '||',
  pipe: '|',
  sequence: ';',
  background: '&',
} as const;

type ShellOperator = (typeof SHELL_OPERATOR)[keyof typeof SHELL_OPERATOR];

interface ShellSegment {
  readonly text: string;
  readonly operatorBefore: ShellOperator | undefined;
}

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
    existsSync(join(cwd, 'pyproject.toml')) ||
    existsSync(join(cwd, 'setup.py'))
  ) {
    return command('pytest', ['-q']);
  }
  if (existsSync(join(cwd, 'go.mod'))) {
    return command('go', ['test', './...']);
  }
  if (existsSync(join(cwd, 'Cargo.toml'))) {
    return command('cargo', ['test']);
  }
  if (hasMakeCheck(cwd)) {
    return command('make', ['check']);
  }
  return undefined;
}

export function commandMatches(text: string, check: CheckCommand): boolean {
  const target = collapseWhitespace(check.display);
  const segments = splitShellCommand(text);
  const hasUnsafeOperator = segments.some(
    ({ operatorBefore }) =>
      operatorBefore !== undefined && operatorBefore !== SHELL_OPERATOR.and,
  );
  if (hasUnsafeOperator) {
    return false;
  }

  return segments.some(({ text: segmentText }) =>
    simpleCommandMatches(segmentText, target),
  );
}

function simpleCommandMatches(text: string, target: string): boolean {
  const normalized = collapseWhitespace(text.trim());
  if (normalized === target) {
    return true;
  }
  return normalized.startsWith(`${target} `);
}

function splitShellCommand(commandText: string): ShellSegment[] {
  const segments: ShellSegment[] = [];
  let segmentStart = 0;
  let operatorBefore: ShellOperator | undefined;
  let quote = '';

  for (let index = 0; index < commandText.length; index += 1) {
    const character = commandText[index] ?? '';
    if (quote.length > 0) {
      if (character === '\\' && quote === '"') {
        index += 1;
        continue;
      }
      if (character === quote) {
        quote = '';
      }
      continue;
    }

    const startsQuote =
      character === "'" || character === '"' || character === '`';
    if (startsQuote) {
      quote = character;
      continue;
    }

    const operator = shellOperatorAt(commandText, index);
    if (operator === undefined) {
      continue;
    }
    segments.push({
      text: commandText.slice(segmentStart, index),
      operatorBefore,
    });
    operatorBefore = operator;
    index += operator.length - 1;
    segmentStart = index + 1;
  }

  segments.push({
    text: commandText.slice(segmentStart),
    operatorBefore,
  });
  return segments;
}

function shellOperatorAt(
  commandText: string,
  index: number,
): ShellOperator | undefined {
  const twoCharacterOperator = commandText.slice(index, index + 2);
  if (twoCharacterOperator === SHELL_OPERATOR.and) {
    return SHELL_OPERATOR.and;
  }
  if (twoCharacterOperator === SHELL_OPERATOR.or) {
    return SHELL_OPERATOR.or;
  }

  const character = commandText[index];
  if (character === SHELL_OPERATOR.pipe) {
    return SHELL_OPERATOR.pipe;
  }
  if (character === SHELL_OPERATOR.sequence) {
    return SHELL_OPERATOR.sequence;
  }
  if (character === SHELL_OPERATOR.background) {
    return SHELL_OPERATOR.background;
  }
  return undefined;
}

function detectPackageCommand(cwd: string): CheckCommand | undefined {
  const packagePath = join(cwd, 'package.json');
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
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
    return PACKAGE_MANAGER.pnpm;
  }
  if (existsSync(join(cwd, 'yarn.lock'))) {
    return PACKAGE_MANAGER.yarn;
  }
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) {
    return PACKAGE_MANAGER.bun;
  }
  return PACKAGE_MANAGER.npm;
}

function hasMakeCheck(cwd: string): boolean {
  const path = join(cwd, 'Makefile');
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

function collapseWhitespace(value: string): string {
  return value.replaceAll(/\s+/g, ' ');
}
