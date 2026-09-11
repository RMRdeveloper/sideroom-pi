import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, resolve } from 'node:path';
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
  pi.on('tool_result', (event, ctx) => {
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
    recordGuidelineRead(state, input.path, ctx.cwd);
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
  cwd: string = process.cwd(),
): void {
  if (path === undefined) {
    return;
  }

  const canonicalPath = canonicalizePath(path, cwd);
  if (canonicalPath === canonicalCatalogPath(GUIDELINE_SKILL_PATH)) {
    state.skillRead = true;
    return;
  }

  for (const guide of LANGUAGE_GUIDES) {
    if (canonicalPath === canonicalCatalogPath(guide.path)) {
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
  const normalizedPath = stripLeadingAt(path)
    .replaceAll('\\', '/')
    .toLowerCase();
  return LANGUAGE_GUIDES.find(({ extensions }) =>
    extensions.some((extension) => normalizedPath.endsWith(extension)),
  )?.path;
}

const canonicalCatalogPaths = new Map<string, string>();

function canonicalCatalogPath(path: string): string {
  const cached = canonicalCatalogPaths.get(path);
  if (cached !== undefined) {
    return cached;
  }
  const canonical = realpathOr(path);
  canonicalCatalogPaths.set(path, canonical);
  return canonical;
}

function canonicalizePath(path: string, cwd: string): string {
  const expanded = expandHome(stripLeadingAt(path));
  const absolute = isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  return realpathOr(normalize(absolute));
}

function realpathOr(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return path;
  }
}

function expandHome(path: string): string {
  if (path === '~') {
    return homedir();
  }
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function stripLeadingAt(path: string): string {
  return path.startsWith('@') ? path.slice(1) : path;
}
