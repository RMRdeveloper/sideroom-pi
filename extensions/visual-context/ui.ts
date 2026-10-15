import { fileURLToPath } from 'node:url';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import {
  candidateLabel,
  elementLabel,
  type PendingSelection,
  SOURCE_METHOD,
  VISUAL_WIDGET,
} from './model.ts';

export const BROWSER_EXTENSION_DIRECTORY = fileURLToPath(
  new URL('../../assets/visual-context/browser/', import.meta.url),
);

function pendingLabel({ resolution, chosen }: PendingSelection): string {
  if (chosen) {
    return `${candidateLabel(chosen)}${chosen.startColumn ? `:${String(chosen.startColumn)}` : ''} (${chosen.method === SOURCE_METHOD.compiler ? 'compiler location checked' : 'selected candidate'})`;
  }
  if (resolution.issue) {
    return resolution.issue;
  }
  const truncated = resolution.truncated ? ' · search truncated' : '';
  const capped = resolution.capped ? ' · more candidates' : '';
  return `${String(resolution.candidates.length)} candidates${truncated}${capped}`;
}

export function renderVisualWidget(
  pending: readonly PendingSelection[],
  theme: Theme,
): readonly string[] {
  return [
    '',
    theme.fg(
      'dim',
      `Browser elements (${String(pending.length)}) · F7: review`,
    ),
    ...pending.map((entry) =>
      theme.fg(
        entry.chosen ? 'accent' : 'muted',
        `${elementLabel(entry.selection)} — ${pendingLabel(entry)}`,
      ),
    ),
  ];
}

export function refreshVisualWidget(
  pending: readonly PendingSelection[],
  ctx: Pick<ExtensionContext, 'ui' | 'mode'>,
): void {
  if (ctx.mode !== 'tui') {
    return;
  }
  if (pending.length === 0) {
    ctx.ui.setWidget(VISUAL_WIDGET, undefined);
    return;
  }
  ctx.ui.setWidget(VISUAL_WIDGET, (_tui, theme) => ({
    render: () => [...renderVisualWidget(pending, theme)],
    invalidate() {},
  }));
}
