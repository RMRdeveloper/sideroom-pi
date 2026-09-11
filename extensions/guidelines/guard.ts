import {
  type ExtensionAPI,
  isReadToolResult,
  isToolCallEventType,
} from '@earendil-works/pi-coding-agent';
import { GUIDELINE_SKILL_PATH, LANGUAGE_GUIDES } from './catalog.ts';

export { GUIDELINE_SKILL_PATH } from './catalog.ts';

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
    if (
      input.offset !== undefined ||
      input.limit !== undefined ||
      event.details?.truncation?.truncated === true
    ) {
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

    const reason = mutationBlockReason(
      state,
      event.input.path,
      pi.getActiveTools().includes('read'),
    );
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

  for (const guide of LANGUAGE_GUIDES) {
    if (normalizedPath === normalizePath(guide.path)) {
      state.languageGuidesRead.add(guide.path);
      return;
    }
  }
}

export function mutationBlockReason(
  state: GuidelineReadState,
  targetPath: string,
  readToolAvailable = true,
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
  if (!readToolAvailable) {
    return `Blocked ${targetPath}: the read tool is inactive, so the guidelines gate cannot be satisfied. Enable read, then read ${requiredPaths.join(' and ')} before retrying the mutation.`;
  }

  return `Blocked ${targetPath}: read ${requiredPaths.join(' and ')} with the read tool in this agent run, then retry the mutation.`;
}

function languageGuideFor(path: string): string | undefined {
  const normalizedPath = normalizePath(path).toLowerCase();
  return LANGUAGE_GUIDES.find(({ extensions }) =>
    extensions.some((extension) => normalizedPath.endsWith(extension)),
  )?.path;
}

function normalizePath(path: string): string {
  return path.replace(/^@/, '').replaceAll('\\', '/');
}
