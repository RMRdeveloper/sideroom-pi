import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ExtensionAPI,
  isReadToolResult,
  isToolCallEventType,
} from '@earendil-works/pi-coding-agent';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const GUIDELINE_SKILL_PATH = join(
  PACKAGE_ROOT,
  'skills/sideroom-guidelines/SKILL.md',
);
const LANGUAGE_GUIDE_DIRECTORY = join(
  PACKAGE_ROOT,
  'skills/sideroom-guidelines/references/languages',
);
const LANGUAGE_GUIDE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.go': join(LANGUAGE_GUIDE_DIRECTORY, 'go.md'),
  '.java': join(LANGUAGE_GUIDE_DIRECTORY, 'java.md'),
  '.php': join(LANGUAGE_GUIDE_DIRECTORY, 'php-laravel.md'),
  '.py': join(LANGUAGE_GUIDE_DIRECTORY, 'python.md'),
  '.rs': join(LANGUAGE_GUIDE_DIRECTORY, 'rust.md'),
  '.ts': join(LANGUAGE_GUIDE_DIRECTORY, 'typescript.md'),
  '.tsx': join(LANGUAGE_GUIDE_DIRECTORY, 'typescript.md'),
};

interface ReadInput {
  readonly path: string;
  readonly offset?: number;
  readonly limit?: number;
}

export interface GuidelineReadState {
  skillRead: boolean;
  readonly languageGuidesRead: Set<string>;
}

export function createGuidelineReadState(): GuidelineReadState {
  return { skillRead: false, languageGuidesRead: new Set() };
}

export function resetGuidelineReadState(state: GuidelineReadState): void {
  state.skillRead = false;
  state.languageGuidesRead.clear();
}

export function registerGuidelineGuard(
  pi: ExtensionAPI,
  state: GuidelineReadState,
): void {
  pi.on('tool_result', (event) => {
    if (!isReadToolResult(event) || event.isError) {
      return;
    }

    // SAFETY: Pi validates built-in read arguments before emitting tool_result.
    const input = event.input as unknown as ReadInput;
    if (input.offset !== undefined || input.limit !== undefined) {
      return;
    }
    recordGuidelineRead(state, input.path);
  });

  pi.on('tool_call', (event) => {
    if (
      !isToolCallEventType('edit', event) &&
      !isToolCallEventType('write', event)
    ) {
      return;
    }

    const reason = mutationBlockReason(state, event.input.path);
    if (reason === undefined) {
      return;
    }
    return { block: true, reason };
  });
}

export function recordGuidelineRead(
  state: GuidelineReadState,
  path: string | undefined,
): void {
  if (path === undefined) {
    return;
  }

  const normalizedPath = normalizePath(path);
  if (normalizedPath === normalizePath(GUIDELINE_SKILL_PATH)) {
    state.skillRead = true;
    return;
  }

  for (const guidePath of new Set(Object.values(LANGUAGE_GUIDE_BY_EXTENSION))) {
    if (normalizedPath === normalizePath(guidePath)) {
      state.languageGuidesRead.add(guidePath);
      return;
    }
  }
}

export function mutationBlockReason(
  state: GuidelineReadState,
  targetPath: string,
): string | undefined {
  const requiredPaths: string[] = [];
  if (!state.skillRead) {
    requiredPaths.push(GUIDELINE_SKILL_PATH);
  }

  const guidePath = languageGuideFor(targetPath);
  if (guidePath !== undefined && !state.languageGuidesRead.has(guidePath)) {
    requiredPaths.push(guidePath);
  }

  if (requiredPaths.length === 0) {
    return undefined;
  }

  return `Blocked ${targetPath}: read ${requiredPaths.join(' and ')} with the read tool in this agent run, then retry the edit.`;
}

function languageGuideFor(path: string): string | undefined {
  const normalizedPath = normalizePath(path).toLowerCase();
  const extension = Object.keys(LANGUAGE_GUIDE_BY_EXTENSION).find((candidate) =>
    normalizedPath.endsWith(candidate),
  );
  return extension === undefined
    ? undefined
    : LANGUAGE_GUIDE_BY_EXTENSION[extension];
}

function normalizePath(path: string): string {
  return path.replace(/^@/, '').replaceAll('\\', '/');
}
