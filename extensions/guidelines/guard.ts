import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import {
  type ExtensionAPI,
  isReadToolResult,
  isToolCallEventType,
} from '@earendil-works/pi-coding-agent';
import {
  GUIDELINE_SKILL_PATH,
  GUIDELINES_TOOL_NAME,
  LANGUAGE_GUIDES,
  languageGuideFor,
} from './catalog.ts';
import type { GuidelinesToolResult } from './execute.ts';

export { GUIDELINE_SKILL_PATH } from './catalog.ts';

interface ReadInput {
  readonly path: string;
  readonly offset?: number;
  readonly limit?: number;
}

export interface GuidelineReadState {
  skillRead: boolean;
  readonly languageGuidesRead: Set<string>;
  readonly pendingLoads: Map<string, GuidelinesToolResult>;
}

export function createGuidelineReadState(): GuidelineReadState {
  return {
    skillRead: false,
    languageGuidesRead: new Set(),
    pendingLoads: new Map(),
  };
}

export function resetGuidelineReadState(state: GuidelineReadState): void {
  state.skillRead = false;
  state.languageGuidesRead.clear();
  state.pendingLoads.clear();
}

export function registerGuidelineGuard(
  pi: ExtensionAPI,
  state: GuidelineReadState,
): void {
  // This notification follows every tool_result handler, including redactors.
  pi.on('tool_execution_end', (event, ctx) => {
    if (event.toolName !== GUIDELINES_TOOL_NAME) {
      return;
    }
    const delivered = state.pendingLoads.get(event.toolCallId);
    state.pendingLoads.delete(event.toolCallId);
    const deliveredResult: Partial<GuidelinesToolResult> | undefined =
      event.result;
    if (
      event.isError ||
      event.parentToolCallId !== undefined ||
      delivered === undefined ||
      !Array.isArray(deliveredResult?.content) ||
      deliveredResult.content.length !== delivered.content.length ||
      !deliveredResult.content.every(
        (part, index) =>
          part.type === 'text' && part.text === delivered.content[index]?.text,
      )
    ) {
      return;
    }
    for (const path of delivered.details.paths) {
      recordGuidelineRead(state, path, ctx.cwd);
    }
  });

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
      pi
        .getActiveTools()
        .some((name) => name === 'read' || name === GUIDELINES_TOOL_NAME),
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
    return `Blocked ${targetPath}: the read tool is inactive and sideroom_guidelines is inactive. Enable either tool, then load ${requiredPaths.join(' and ')} before retrying the mutation.`;
  }

  return `Blocked ${targetPath}: call sideroom_guidelines with path ${JSON.stringify(targetPath)}, or read ${requiredPaths.join(' and ')} in full with the read tool in this agent run, then retry the mutation.`;
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
