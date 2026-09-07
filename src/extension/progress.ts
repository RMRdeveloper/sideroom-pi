import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import type {
  PipelineObserver,
  PipelineStageEvent,
} from '../core/orchestrator.ts';

export const STATUS_KEY = 'sideroom';
const PROGRESS_WIDGET_KEY = 'sideroom-progress';
const PIPELINE_PHASES: readonly PipelineStageEvent['phase'][] = [
  'grilling',
  'planner',
  'implementer',
  'reviewer',
  'verifier',
  'fixer',
];
const PHASE_LABELS: Readonly<Record<PipelineStageEvent['phase'], string>> = {
  grilling: 'Grilling',
  planner: 'Planner',
  implementer: 'Implementer',
  reviewer: 'Reviewer',
  verifier: 'Verifier',
  fixer: 'Fixer',
  pipeline: 'Pipeline',
};

export function createObserver(
  trace: PipelineStageEvent[],
  progress: PipelineProgress,
): PipelineObserver {
  return (event) => {
    trace.push(event);
    progress.report(event);
  };
}

/** Render compact, durable progress for a run without involving Pi's parent agent. */
export class PipelineProgress {
  private activePhase: PipelineStageEvent['phase'] | undefined;
  private activeStatus: PipelineStageEvent['status'] | undefined;
  private activeTaskId: string | undefined;
  private activeRound: number | undefined;
  private message = 'starting isolated Pi SDK role sessions';
  private readonly running = new Set<PipelineStageEvent['phase']>();
  private readonly completed = new Set<PipelineStageEvent['phase']>();
  private readonly failed = new Set<PipelineStageEvent['phase']>();

  private readonly context: ExtensionCommandContext;

  constructor(context: ExtensionCommandContext) {
    this.context = context;
  }

  start(): void {
    this.render();
  }

  report(event: PipelineStageEvent): void {
    this.activePhase = event.phase;
    this.activeStatus = event.status;
    this.activeTaskId = event.taskId;
    this.activeRound = event.round;
    if (event.status === 'completed') {
      this.running.delete(event.phase);
      this.failed.delete(event.phase);
      this.completed.add(event.phase);
    } else if (event.status === 'failed') {
      this.running.delete(event.phase);
      this.completed.delete(event.phase);
      this.failed.add(event.phase);
    } else if (event.status === 'cancelled') {
      this.running.delete(event.phase);
      this.completed.delete(event.phase);
      this.failed.delete(event.phase);
    } else {
      this.completed.delete(event.phase);
      this.failed.delete(event.phase);
      this.running.add(event.phase);
    }
    this.message = stageMessage(event.status, describeStage(event));
    this.render();
  }

  awaitDecision(questionNumber: number, totalQuestions: number): void {
    this.activePhase = 'grilling';
    this.activeStatus = 'awaiting-input';
    this.completed.delete('grilling');
    this.failed.delete('grilling');
    this.running.add('grilling');
    this.message = `Grilling (round ${this.displayRound()}): awaiting your decision (question ${questionNumber}/${totalQuestions})`;
    this.render();
  }

  clear(): void {
    this.context.ui.setWidget(PROGRESS_WIDGET_KEY, undefined);
  }

  private displayRound(): number | string {
    return this.activeRound === undefined ? '?' : this.activeRound;
  }

  private render(): void {
    this.context.ui.setStatus(STATUS_KEY, `Sideroom: ${this.message}`);
    this.context.ui.setWidget(
      PROGRESS_WIDGET_KEY,
      [
        'Sideroom pipeline',
        `Status: ${this.message}`,
        `Focus: ${this.focusLine()}`,
        'Runtime: direct Pi SDK sessions · isolated roles · no fallback agents',
        '',
        ...PIPELINE_PHASES.map((phase) => this.renderPhase(phase)),
        ...this.renderPipelineNotice(),
      ],
      { placement: 'aboveEditor' },
    );
  }

  private focusLine(): string {
    if (this.activePhase === undefined) {
      return 'starting isolated Pi SDK role sessions';
    }
    return stageMessage(
      this.activeStatus ?? 'started',
      describeStage({
        phase: this.activePhase,
        status: this.activeStatus ?? 'started',
        ...(this.activeTaskId === undefined
          ? {}
          : { taskId: this.activeTaskId }),
        ...(this.activeRound === undefined ? {} : { round: this.activeRound }),
      }),
    );
  }

  private renderPhase(phase: PipelineStageEvent['phase']): string {
    const label = PHASE_LABELS[phase];
    if (this.activePhase === phase && this.activeStatus !== undefined) {
      const detail = describeStage({
        phase,
        status: this.activeStatus,
        ...(this.activeTaskId === undefined
          ? {}
          : { taskId: this.activeTaskId }),
        ...(this.activeRound === undefined ? {} : { round: this.activeRound }),
      });
      if (this.activeStatus === 'awaiting-input') {
        return `● ${detail} — awaiting your decision`;
      }
      if (this.activeStatus === 'failed') {
        return `✗ ${detail} — failed`;
      }
      if (this.activeStatus === 'cancelled') {
        return `○ ${detail} — cancelled`;
      }
      if (this.activeStatus === 'completed') {
        return `✓ ${detail}`;
      }
      return `● ${detail} — running`;
    }
    if (this.failed.has(phase)) {
      return `✗ ${label} — failed`;
    }
    if (this.running.has(phase)) {
      return `● ${label} — running`;
    }
    if (this.completed.has(phase)) {
      return `✓ ${label}`;
    }
    return `○ ${label}`;
  }

  private renderPipelineNotice(): readonly string[] {
    if (this.activePhase === 'pipeline' || this.failed.has('pipeline')) {
      return [`✗ ${PHASE_LABELS.pipeline} — ${this.message}`];
    }
    return [];
  }
}

function describeStage(event: PipelineStageEvent): string {
  const label = PHASE_LABELS[event.phase];
  const task = event.taskId === undefined ? '' : ` ${event.taskId}`;
  const round = event.round === undefined ? '' : ` (round ${event.round})`;
  return `${label}${task}${round}`;
}

function stageMessage(
  status: PipelineStageEvent['status'],
  subject: string,
): string {
  if (status === 'awaiting-input') {
    return `${subject}: awaiting your decisions`;
  }
  if (status === 'completed') {
    return `${subject}: completed`;
  }
  if (status === 'failed') {
    return `${subject}: failed`;
  }
  if (status === 'cancelled') {
    return `${subject}: cancelled`;
  }
  return `${subject}: running`;
}
