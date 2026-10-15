import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  candidateLabel,
  cleanLabel,
  elementLabel,
  type PendingSelection,
  type SourceCandidate,
} from './model.ts';
import type { discoverProjects, VisualProject } from './projects.ts';

type DialogUI = Pick<ExtensionContext['ui'], 'select' | 'notify'>;
export type VisualAction =
  | { readonly action: 'pair' }
  | { readonly action: 'stop' }
  | { readonly action: 'clear' }
  | { readonly action: 'review'; readonly entry: PendingSelection };
export type SourceAction =
  | { readonly action: 'remove' | 'associate' }
  | { readonly action: 'choose'; readonly candidate: SourceCandidate };
interface VisualDialogInput {
  readonly ui: DialogUI;
  readonly pending: readonly PendingSelection[];
  readonly connected: boolean;
}

export async function chooseVisualAction({
  ui,
  pending,
  connected,
}: VisualDialogInput): Promise<VisualAction | undefined> {
  const options: readonly (VisualAction & { readonly label: string })[] = [
    { label: 'Pair browser', action: 'pair' },
    ...pending.map((entry): VisualAction & { readonly label: string } => ({
      label: `Review ${elementLabel(entry.selection)} [${entry.selection.id}]`,
      action: 'review',
      entry,
    })),
    { label: 'Remove all pending elements', action: 'clear' },
    ...(connected
      ? [{ label: 'Disconnect browser', action: 'stop' as const }]
      : []),
  ];
  const choice = await ui.select(
    'Browser context',
    options.map((option) => option.label),
  );
  return options.find((option) => option.label === choice);
}

export async function chooseSourceAction(
  ui: DialogUI,
  entry: PendingSelection,
): Promise<SourceAction | undefined> {
  const options: readonly (SourceAction & { readonly label: string })[] = [
    ...entry.resolution.candidates.map(
      (candidate): SourceAction & { readonly label: string } => ({
        label: `${candidateLabel(candidate)} · ${candidate.reasons.join(', ')}`,
        action: 'choose',
        candidate,
      }),
    ),
    { label: 'Associate this page with a project', action: 'associate' },
    { label: 'Remove this element', action: 'remove' },
  ];
  const choice = await ui.select(
    entry.selection.source
      ? 'Review compiler location'
      : 'Choose a source candidate — origin is inferred',
    options.map((option) => option.label),
  );
  return options.find((option) => option.label === choice);
}

export async function chooseProject(
  ui: DialogUI,
  discovery: ReturnType<typeof discoverProjects>,
): Promise<VisualProject | undefined> {
  if (discovery.projects.length === 0) {
    ui.notify(
      cleanLabel(`No projects were found. ${discovery.issues.join(' ')}`, 512),
      'warning',
    );
    return undefined;
  }
  const labels = discovery.projects.map(
    (project) => `${project.path} — ${project.name}`,
  );
  const choice = await ui.select(
    discovery.truncated
      ? 'Choose project — discovery reached a limit'
      : 'Choose project for this page origin',
    labels,
  );
  return discovery.projects[labels.indexOf(choice ?? '')];
}
