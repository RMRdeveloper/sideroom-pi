import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type ExtensionAPI,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import { languageForPath, type RuleId, SEVERITY } from './catalog.ts';
import { evaluateAddedLines } from './checks.ts';
import {
  type AddedLine,
  addedLines,
  formatBlockReason,
  formatWarnings,
  type RuleViolation,
} from './model.ts';

const BLOCK_DEGRADE_AFTER = 3;
const CLEAN_RESET_AFTER = 5;

interface PendingWarnings {
  readonly path: string;
  readonly violations: readonly RuleViolation[];
}

export interface RulesState {
  readonly fires: Map<RuleId, number>;
  cleanChecks: number;
  readonly pendingWarnings: Map<string, PendingWarnings>;
}

interface ExtractedMutation {
  readonly path: string;
  readonly language: ReturnType<typeof languageForPath>;
  readonly lines: readonly AddedLine[];
}

export function createRulesState(): RulesState {
  return { fires: new Map(), cleanChecks: 0, pendingWarnings: new Map() };
}

export function resetRulesState(state: RulesState): void {
  state.fires.clear();
  state.cleanChecks = 0;
  state.pendingWarnings.clear();
}

export function registerRulesGuard(pi: ExtensionAPI, state: RulesState): void {
  pi.on('tool_call', (event, ctx) => {
    const mutation = extractMutation(event, ctx.cwd);
    if (mutation === undefined) {
      return undefined;
    }
    const violations = evaluateAddedLines(mutation.language, mutation.lines);
    return applyRulesOutcome(
      state,
      event.toolCallId,
      mutation.path,
      decideRules(state, violations),
    );
  });

  pi.on('tool_result', (event) => {
    if (!isWriteToolResult(event) && !isEditToolResult(event)) {
      return;
    }
    const pending = state.pendingWarnings.get(event.toolCallId);
    state.pendingWarnings.delete(event.toolCallId);
    if (pending === undefined || event.isError) {
      return;
    }
    return {
      content: [
        ...event.content,
        {
          type: 'text' as const,
          text: formatWarnings(pending.path, pending.violations),
        },
      ],
    };
  });
}

export interface RulesDecision {
  readonly blocking: readonly RuleViolation[];
  readonly warnings: readonly RuleViolation[];
}

export function decideRules(
  state: RulesState,
  violations: readonly RuleViolation[],
): RulesDecision {
  return {
    blocking: violations.filter(
      (item) =>
        item.severity === SEVERITY.block && !isDegraded(state, item.ruleId),
    ),
    warnings: violations.filter(
      (item) =>
        item.severity === SEVERITY.warn || isDegraded(state, item.ruleId),
    ),
  };
}

function applyRulesOutcome(
  state: RulesState,
  toolCallId: string,
  path: string,
  decision: RulesDecision,
): { block: true; reason: string } | undefined {
  if (decision.blocking.length > 0) {
    for (const item of decision.blocking) {
      incrementFires(state, item.ruleId);
    }
    return { block: true, reason: formatBlockReason(path, decision.blocking) };
  }

  registerCleanCheck(state);
  if (decision.warnings.length > 0) {
    state.pendingWarnings.set(toolCallId, {
      path,
      violations: decision.warnings,
    });
  }
  return undefined;
}

function extractMutation(
  event: ToolCallEvent,
  cwd: string,
): ExtractedMutation | undefined {
  if (isToolCallEventType('write', event)) {
    return extractWrite(event.input.path, event.input.content, cwd);
  }
  if (isToolCallEventType('edit', event)) {
    return extractEdit(event.input.path, event.input.edits);
  }
  return undefined;
}

function extractWrite(
  path: string,
  content: string,
  cwd: string,
): ExtractedMutation {
  const previous = readFileIfExists(resolve(cwd, path));
  return {
    path,
    language: languageForPath(path),
    lines: addedLines(previous, content),
  };
}

function extractEdit(
  path: string,
  edits: readonly { readonly oldText: string; readonly newText: string }[],
): ExtractedMutation {
  const lines: AddedLine[] = [];
  for (const edit of edits) {
    lines.push(...addedLines(edit.oldText, edit.newText));
  }
  return { path, language: languageForPath(path), lines };
}

function readFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isDegraded(state: RulesState, ruleId: RuleId): boolean {
  return (state.fires.get(ruleId) ?? 0) >= BLOCK_DEGRADE_AFTER;
}

function incrementFires(state: RulesState, ruleId: RuleId): void {
  state.fires.set(ruleId, (state.fires.get(ruleId) ?? 0) + 1);
}

function registerCleanCheck(state: RulesState): void {
  state.cleanChecks += 1;
  if (state.cleanChecks < CLEAN_RESET_AFTER) {
    return;
  }
  state.cleanChecks = 0;
  state.fires.clear();
}
