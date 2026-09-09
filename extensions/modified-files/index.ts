import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { TODO_WIDGET_REFRESH_EVENT } from '../todo/session.ts';
import {
  commitModifiedFiles,
  createModifiedFilesStore,
  refreshModifiedFiles,
  registerModifiedFilesEvents,
} from './session.ts';
import { createModifiedFilesOverlayController } from './ui.ts';

const SHORTCUT = 'f8';

// Pi loads extensions/*/index.ts through export default.
export default function registerModifiedFiles(pi: ExtensionAPI): void {
  const store = createModifiedFilesStore();
  const overlay = createModifiedFilesOverlayController(
    () => store.files,
    (ctx) => commitModifiedFiles(store, pi, ctx, []),
  );

  registerModifiedFilesEvents(pi, store);
  pi.events.on(TODO_WIDGET_REFRESH_EVENT, (value) => {
    if (isWidgetContext(value)) {
      refreshModifiedFiles(store, value);
    }
  });
  pi.registerShortcut(SHORTCUT, {
    description: 'Toggle edited files',
    handler: (ctx) => overlay.toggle(ctx),
  });
}

function isWidgetContext(
  value: unknown,
): value is Pick<ExtensionContext, 'ui' | 'cwd'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ui' in value &&
    'cwd' in value
  );
}
