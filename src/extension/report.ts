import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import type { FilePolicy } from '../core/language-policy.ts';
import type { PipelineStageEvent } from '../core/orchestrator.ts';
import type { PipelineResult } from '../core/types.ts';

const VERSION = '6.0.0';
export const TRACE_TYPE = 'sideroom:run';

interface RunDetails {
  readonly version: string;
  readonly source: string;
  readonly cwd: string;
  readonly policyMap: readonly FilePolicy[];
  readonly model?: string;
  readonly status: PipelineResult['status'];
  readonly trace: readonly PipelineStageEvent[];
  readonly files: readonly string[];
  readonly findings: PipelineResult['findings'];
  readonly summary: string;
}

export function modelReference(
  context: ExtensionCommandContext,
): string | undefined {
  const scoped = context.scopedModels;
  if (scoped.length === 0) {
    return toModelReference(context.model);
  }
  const current = toModelReference(context.model);
  const selected = scoped.find(
    ({ model }) => toModelReference(model) === current,
  );
  return toModelReference(selected?.model ?? scoped[0]?.model);
}

/** Register compact transcript and expandable TUI-only run-history renderers. */
export function registerRunRenderers(pi: ExtensionAPI): void {
  pi.registerMessageRenderer<Pick<RunDetails, 'status'>>(
    TRACE_TYPE,
    (message, options, theme) => {
      const content =
        typeof message.content === 'string' ? message.content : 'Sideroom run';
      return new Text(
        theme.fg(
          message.details?.status === 'failed' ? 'error' : 'success',
          content,
        ),
        options.outputPad,
        0,
      );
    },
  );
  pi.registerEntryRenderer<RunDetails>(TRACE_TYPE, (entry, options, theme) => {
    const details = entry.data;
    if (details === undefined) {
      return undefined;
    }
    const compact = formatCompactRun(details);
    const text = options.expanded
      ? `${compact}\n\n${JSON.stringify(details, null, 2)}`
      : compact;
    return new Text(theme.fg('accent', text), 0, 0);
  });
}

export function recordRun(
  pi: ExtensionAPI,
  context: ExtensionCommandContext,
  policies: readonly FilePolicy[],
  result: PipelineResult,
  trace: readonly PipelineStageEvent[],
): void {
  const files = [
    ...new Set(result.implementations.flatMap((item) => item.filesChanged)),
  ];
  const details: RunDetails = {
    version: VERSION,
    source: 'sideroom-pi-extension',
    cwd: context.cwd,
    policyMap: policies,
    ...(modelReference(context) === undefined
      ? {}
      : { model: modelReference(context) }),
    status: result.status,
    trace,
    files,
    findings: result.findings,
    summary: result.summary,
  };
  pi.appendEntry(TRACE_TYPE, details);
  pi.sendMessage(
    {
      customType: TRACE_TYPE,
      display: true,
      content: formatCompactRun(details),
      details: { status: result.status },
    },
    { triggerTurn: false },
  );
}

function formatCompactRun(details: RunDetails): string {
  const phases = details.trace
    .filter((event) => event.status === 'completed')
    .map((event) => event.phase)
    .filter((phase, index, values) => values.indexOf(phase) === index);
  return [
    `Sideroom ${details.status}`,
    `Roles completed: ${phases.length === 0 ? '-' : phases.join(', ')}`,
    `Files changed: ${details.files.length === 0 ? '-' : details.files.join(', ')}`,
    `Findings: ${String(details.findings.length)}`,
    truncateSummary(details.summary),
  ].join('\n');
}

function truncateSummary(value: string): string {
  const maxLength = 1_000;
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function toModelReference(
  model: { readonly provider: string; readonly id: string } | undefined,
): string | undefined {
  return model === undefined ? undefined : `${model.provider}/${model.id}`;
}
