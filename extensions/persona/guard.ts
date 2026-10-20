import {
  type ExtensionAPI,
  type ExtensionContext,
  isToolCallEventType,
  type ToolCallEvent,
} from '@earendil-works/pi-coding-agent';
import { resolveFileToolPath } from '../shared/file-path.ts';
import { readFileIfExists } from '../shared/read-file.ts';
import {
  registerSettleGuard,
  registerSettleSupplement,
  SETTLE_PRIORITY,
  withHiddenSteer,
} from '../shared/settle.ts';
import {
  PERSONA_STEER_TYPE,
  type ProhibitionId,
  TEXT_SCOPE,
} from './catalog.ts';
import {
  addedLinesMissingFrom,
  artifactViolations,
  findViolations,
} from './checks.ts';
import {
  assistantMessageText,
  formatArtifactSteer,
  formatBlockReason,
  formatSteer,
} from './model.ts';

const BLOCK_DEGRADE_AFTER = 3;
const CLEAN_RESET_AFTER = 5;

const STEER_LIMIT_PER_RUN = 3;

interface ExtractedMutation {
  readonly path: string;
  readonly addedLines: readonly string[];
}

export interface PersonaGuardState {
  readonly fires: Map<ProhibitionId, number>;
  cleanMutations: number;
  steersThisRun: number;
  blocksThisRun: number;
  pendingProse: string | undefined;
}

export function createPersonaGuardState(): PersonaGuardState {
  return {
    fires: new Map(),
    cleanMutations: 0,
    steersThisRun: 0,
    blocksThisRun: 0,
    pendingProse: undefined,
  };
}

export function resetPersonaRun(state: PersonaGuardState): void {
  state.steersThisRun = 0;
  state.blocksThisRun = 0;
  state.pendingProse = undefined;
}

export function registerPersonaGuard(
  pi: ExtensionAPI,
  state: PersonaGuardState,
  report: (ctx: ExtensionContext) => void,
): void {
  pi.on('tool_call', (event, ctx) => {
    const mutation = extractMutation(event, ctx.cwd);
    if (mutation === undefined) {
      return undefined;
    }
    const blockDecision = applyArtifactOutcome(pi, state, mutation);
    if (blockDecision !== undefined) {
      report(ctx);
    }
    return blockDecision;
  });

  pi.on('message_end', (event) => {
    if (event.message.role !== 'assistant') {
      return undefined;
    }
    state.pendingProse = undefined;
    if (event.message.stopReason !== 'stop') {
      return undefined;
    }
    const violations = findViolations(
      assistantMessageText(event.message.content),
      TEXT_SCOPE.prose,
    );
    if (violations.length === 0) {
      return undefined;
    }

    state.pendingProse = formatSteer(violations);
    return undefined;
  });

  const pending = () =>
    state.pendingProse !== undefined &&
    state.steersThisRun < STEER_LIMIT_PER_RUN;
  const prepare = (ctx: ExtensionContext) => {
    if (
      state.pendingProse === undefined ||
      state.steersThisRun >= STEER_LIMIT_PER_RUN
    ) {
      return undefined;
    }
    const content = state.pendingProse;
    state.pendingProse = undefined;
    state.steersThisRun += 1;
    report(ctx);
    return { customType: PERSONA_STEER_TYPE, content };
  };
  registerSettleSupplement(pi, prepare);
  registerSettleGuard(pi, {
    priority: SETTLE_PRIORITY.persona,
    pending,
    handle: (event, ctx) => {
      const message = prepare(ctx);
      if (message === undefined) {
        return;
      }
      return withHiddenSteer({ event, ...message });
    },
  });
}

function applyArtifactOutcome(
  pi: ExtensionAPI,
  state: PersonaGuardState,
  mutation: ExtractedMutation,
): { block: true; reason: string } | undefined {
  const violations = artifactViolations(mutation.addedLines);
  if (violations.length === 0) {
    registerCleanMutation(state);
    return undefined;
  }

  const blocking = violations.filter(
    (violation) => !isDegraded(state, violation.prohibition.id),
  );
  if (blocking.length > 0) {
    state.blocksThisRun += 1;
    for (const violation of blocking) {
      incrementFires(state, violation.prohibition.id);
    }
    return { block: true, reason: formatBlockReason(mutation.path, blocking) };
  }

  sendPersonaSteer(pi, state, formatArtifactSteer(mutation.path, violations));
  return undefined;
}

function extractMutation(
  event: ToolCallEvent,
  cwd: string,
): ExtractedMutation | undefined {
  if (isToolCallEventType('write', event)) {
    const absolutePath = resolveFileToolPath(cwd, event.input.path);
    if (absolutePath === undefined) {
      return undefined;
    }
    const previous = readFileIfExists(absolutePath);
    return {
      path: event.input.path,
      addedLines: addedLinesMissingFrom(previous, event.input.content),
    };
  }
  if (isToolCallEventType('edit', event)) {
    const addedLines = event.input.edits.flatMap((edit) =>
      addedLinesMissingFrom(edit.oldText, edit.newText),
    );
    return { path: event.input.path, addedLines };
  }
  return undefined;
}

function isDegraded(state: PersonaGuardState, id: ProhibitionId): boolean {
  return (state.fires.get(id) ?? 0) >= BLOCK_DEGRADE_AFTER;
}

function incrementFires(state: PersonaGuardState, id: ProhibitionId): void {
  state.fires.set(id, (state.fires.get(id) ?? 0) + 1);
}

function sendPersonaSteer(
  pi: Pick<ExtensionAPI, 'sendMessage'>,
  state: PersonaGuardState,
  content: string,
): void {
  if (state.steersThisRun >= STEER_LIMIT_PER_RUN) {
    return;
  }
  state.steersThisRun += 1;
  pi.sendMessage(
    { customType: PERSONA_STEER_TYPE, content, display: false },
    { triggerTurn: false, deliverAs: 'steer' },
  );
}

function registerCleanMutation(state: PersonaGuardState): void {
  state.cleanMutations += 1;
  if (state.cleanMutations < CLEAN_RESET_AFTER) {
    return;
  }
  state.cleanMutations = 0;
  state.fires.clear();
}
