import { readFileSync, realpathSync } from 'node:fs';
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

const MISSING_READ_ID = 'read';

interface PendingRead {
  readonly path: string;
  readonly cwd: string;
  readonly partial: boolean;
}

export interface GuidelineReadState {
  skillRead: boolean;
  readonly languageGuidesRead: Set<string>;
  readonly pendingLoads: Map<string, GuidelinesToolResult>;
  readonly pendingReads: Map<string, PendingRead>;
}

export function createGuidelineReadState(): GuidelineReadState {
  return {
    skillRead: false,
    languageGuidesRead: new Set(),
    pendingLoads: new Map(),
    pendingReads: new Map(),
  };
}

export function resetGuidelineReadState(state: GuidelineReadState): void {
  state.skillRead = false;
  state.languageGuidesRead.clear();
  state.pendingLoads.clear();
  state.pendingReads.clear();
}

export function registerGuidelineGuard(
  pi: ExtensionAPI,
  state: GuidelineReadState,
): void {

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
    if (!isReadToolResult(event)) {
      return;
    }

    const input = event.input as unknown as ReadInput;
    state.pendingReads.set(event.toolCallId ?? MISSING_READ_ID, {
      path: input.path,
      cwd: ctx.cwd,
      partial:
        event.isError ||
        input.offset !== undefined ||
        input.limit !== undefined ||
        event.details?.truncation?.truncated === true,
    });
  });

  pi.on('tool_execution_end', (event) => {
    if (event.toolName !== 'read') {
      return;
    }
    const pending = state.pendingReads.get(event.toolCallId ?? MISSING_READ_ID);
    state.pendingReads.delete(event.toolCallId ?? MISSING_READ_ID);
    if (
      pending === undefined ||
      pending.partial ||
      event.isError ||
      event.parentToolCallId !== undefined ||
      !finalReadMatchesFile(event.result, pending.path, pending.cwd)
    ) {
      return;
    }
    recordGuidelineRead(state, pending.path, pending.cwd);
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

function finalReadMatchesFile(
  toolResult: unknown,
  path: string,
  cwd: string,
): boolean {
  const delivered = textFromResult(toolResult);
  if (delivered === undefined) {
    return false;
  }
  try {
    return delivered === readFileSync(canonicalizePath(path, cwd), 'utf8');
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return false;
  }
}

function textFromResult(toolResult: unknown): string | undefined {
  if (
    typeof toolResult !== 'object' ||
    toolResult === null ||
    !('content' in toolResult) ||
    !Array.isArray(toolResult.content) ||
    toolResult.content.length === 0
  ) {
    return undefined;
  }
  const texts: string[] = [];
  for (const part of toolResult.content) {
    if (
      typeof part !== 'object' ||
      part === null ||
      !('type' in part) ||
      part.type !== 'text' ||
      !('text' in part) ||
      typeof part.text !== 'string'
    ) {
      return undefined;
    }
    texts.push(part.text);
  }
  return texts.join('');
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
    return `Blocked ${targetPath}: the read tool is inactive and sideroom_guidelines is inactive, so the required guide cannot be loaded. Enable either tool, then load ${requiredPaths.join(' and ')} and save again.`;
  }

  return [
    `Blocked ${targetPath}: the required guide is not loaded yet.`,
    `Load it with sideroom_guidelines (path ${JSON.stringify(targetPath)}), or read ${requiredPaths.join(' and ')} in full with the read tool in this agent run.`,
    'Then save again.',
  ].join('\n');
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
