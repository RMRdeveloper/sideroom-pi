import {
  type ExtensionAPI,
  isEditToolResult,
  isToolCallEventType,
  isWriteToolResult,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import { resolveFileToolPath } from '../shared/file-path.ts';
import { readFileIfExists } from '../shared/read-file.ts';
import { languageForPath, type RuleId, SEVERITY } from './catalog.ts';
import { evaluateContextualChange } from './checks.ts';
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
  readonly note: string | undefined;
}

export interface RulesState {
  readonly fires: Map<RuleId, number>;
  cleanChecks: number;
  readonly pendingWarnings: Map<string, PendingWarnings>;
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
    const violations = mutation.source === undefined
      ? []
      : evaluateContextualChange(
        mutation.language,
        mutation.source,
        mutation.lines,
      );
    const decision = decideRules(state, violations);
    return applyRulesOutcome(state, event.toolCallId, mutation.path, {
      ...decision,
      note: mutation.uncertain
        ? 'This edit could not be checked against the surrounding file, so it was not blocked. Check the change yourself before relying on it.'
        : undefined,
    });
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
    const findings = pending.violations.length === 0
      ? pending.note ?? ''
      : `${formatWarnings(pending.path, pending.violations)}${
        pending.note === undefined ? '' : `\n${pending.note}`
      }`;
    return {
      content: [
        ...event.content,
        {
          type: 'text' as const,
          text: findings,
        },
      ],
    };
  });
}

export interface RulesDecision {
  readonly blocking: readonly RuleViolation[];
  readonly warnings: readonly RuleViolation[];
  readonly note: string | undefined;
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
    note: undefined,
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
  if (decision.warnings.length > 0 || decision.note !== undefined) {
    state.pendingWarnings.set(toolCallId, {
      path,
      violations: decision.warnings,
      note: decision.note,
    });
  }
  return undefined;
}

function extractMutation(
  event: ToolCallEvent,
  cwd: string,
): ProposedChange | undefined {
  if (isToolCallEventType('write', event)) {
    return extractWrite(event.input.path, event.input.content, cwd);
  }
  if (isToolCallEventType('edit', event)) {
    return extractEdit(event.input.path, event.input.edits, cwd);
  }
  return undefined;
}

interface ProposedChange {
  readonly path: string;
  readonly language: ReturnType<typeof languageForPath>;
  readonly lines: readonly AddedLine[];
  readonly source: string | undefined;
  readonly uncertain: boolean;
}

function extractWrite(
  path: string,
  content: string,
  cwd: string,
): ProposedChange {
  const previous = readExisting(cwd, path);
  return {
    path,
    language: languageForPath(path),
    lines: addedLines(previous, content),
    source: content,
    uncertain: false,
  };
}

function extractEdit(
  path: string,
  edits: readonly { readonly oldText: string; readonly newText: string }[],
  cwd: string,
): ProposedChange {
  const previous = readExisting(cwd, path);
  const proposed = previous === undefined
    ? undefined
    : applyEdits(previous, edits);
  return {
    path,
    language: languageForPath(path),
    lines: proposed === undefined
      ? []
      : addedLines(previous, proposed),
    source: proposed,
    uncertain: proposed === undefined,
  };
}

function readExisting(cwd: string, path: string): string | undefined {
  const absolute = resolveFileToolPath(cwd, path);
  if (absolute === undefined) {
    return undefined;
  }
  return readFileIfExists(absolute);
}

function applyEdits(
  source: string,
  edits: readonly { readonly oldText: string; readonly newText: string }[],
): string | undefined {
  let next = source;
  for (const edit of edits) {
    const start = next.indexOf(edit.oldText);
    if (start < 0 || next.indexOf(edit.oldText, start + edit.oldText.length) >= 0) {
      return undefined;
    }
    next = `${next.slice(0, start)}${edit.newText}${next.slice(start + edit.oldText.length)}`;
  }
  return next;
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
