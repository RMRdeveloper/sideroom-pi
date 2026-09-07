import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { createPipeline } from '../app.ts';
import type { PipelineStageEvent } from '../core/orchestrator.ts';
import type { PipelineResult } from '../core/types.ts';
import { formatPiCommandHelp, parsePiCommand } from '../pi-command.ts';
import { answerQuestions } from './grilling.ts';
import { preflightLanguagePolicies } from './preflight.ts';
import { createObserver, PipelineProgress, STATUS_KEY } from './progress.ts';
import { modelReference, recordRun, registerRunRenderers } from './report.ts';

const PROGRESS_WIDGET_KEY = 'sideroom-progress';
const GRILLING_WIDGET_KEY = 'sideroom-grilling';

/** Register the global `/sideroom` Pi command. */
export default function registerSideroom(pi: ExtensionAPI): void {
  let running = false;
  let activeRun: AbortController | undefined;

  const clearUi = (context: Pick<ExtensionContext, 'ui'>): void => {
    context.ui.setStatus(STATUS_KEY, undefined);
    context.ui.setWidget(PROGRESS_WIDGET_KEY, undefined);
    context.ui.setWidget(GRILLING_WIDGET_KEY, undefined);
  };
  const cancelActiveRun = (): void => {
    activeRun?.abort(
      new Error('Sideroom run cancelled by Pi session lifecycle'),
    );
    activeRun = undefined;
    running = false;
  };

  registerRunRenderers(pi);
  pi.on('session_start', (_event, context) => {
    cancelActiveRun();
    clearUi(context);
  });
  pi.on('session_shutdown', (_event, context) => {
    cancelActiveRun();
    clearUi(context);
  });

  pi.registerCommand('sideroom', {
    description: 'Run the isolated Sideroom coding pipeline in this Pi project',
    getArgumentCompletions: (prefix) => {
      const options = [
        {
          value: '--read-only',
          label: '--read-only',
          description: 'Do not grant write-capable tools',
        },
        {
          value: '--max-fix-passes',
          label: '--max-fix-passes',
          description: 'Set the maximum repair passes',
        },
        { value: '--help', label: '--help', description: 'Show command help' },
      ];
      return options.filter(({ value }) => value.startsWith(prefix));
    },
    handler: async (args, context) => {
      if (running) {
        context.ui.notify('A Sideroom run is already in progress.', 'warning');
        return;
      }
      const command = parsePiCommand(args);
      if (command.kind === 'help') {
        context.ui.notify(formatPiCommandHelp(), 'info');
        return;
      }
      if (command.kind === 'error') {
        context.ui.notify(`Sideroom: ${command.message}`, 'error');
        return;
      }

      const request = await requestFor(command.request, context);
      if (request === undefined) {
        return;
      }
      const preflight = await preflightLanguagePolicies(request, context);
      if (preflight === undefined) {
        return;
      }

      running = true;
      const controller = new AbortController();
      activeRun = controller;
      const unlinkSignal = linkAbortSignal(context.signal, controller);
      const trace: PipelineStageEvent[] = [];
      const progress = new PipelineProgress(context);
      const observe = createObserver(trace, progress);
      const model = modelReference(context);
      progress.start();
      try {
        const result = await createPipeline({
          dir: context.cwd,
          policies: preflight.policies,
          ...(model === undefined ? {} : { model }),
          ...(command.maxFixPasses === undefined
            ? {}
            : { maxFixPasses: command.maxFixPasses }),
          allowWrite: command.allowWrite,
          signal: controller.signal,
          onStage: observe,
        }).run(preflight.request, (questions) =>
          answerQuestions(questions, context, progress),
        );
        recordRun(pi, context, preflight.policies, result, trace);
      } catch (error) {
        const cancelled = controller.signal.aborted || isAbortError(error);
        const message = cancelled
          ? 'Sideroom run cancelled.'
          : error instanceof Error
            ? error.message
            : String(error);
        const result: PipelineResult = {
          status: cancelled ? 'cancelled' : 'failed',
          implementations: [],
          findings: [],
          summary: message,
        };
        recordRun(pi, context, preflight.policies, result, [
          ...trace,
          { phase: 'pipeline', status: cancelled ? 'cancelled' : 'failed' },
        ]);
      } finally {
        unlinkSignal();
        if (activeRun === controller) {
          activeRun = undefined;
          running = false;
        }
        progress.clear();
        clearUi(context);
      }
    },
  });
}

async function requestFor(
  request: string | undefined,
  context: ExtensionCommandContext,
): Promise<string | undefined> {
  if (request !== undefined && request.trim().length > 0) {
    return request;
  }
  if (!context.hasUI) {
    context.ui.notify('Sideroom needs a request after /sideroom.', 'error');
    return undefined;
  }
  const response = await context.ui.input(
    'What should Sideroom build?',
    'Describe the change',
  );
  return response === undefined || response.trim().length === 0
    ? undefined
    : response;
}

function linkAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (source === undefined) {
    return () => undefined;
  }
  const abort = (): void => target.abort(source.reason);
  if (source.aborted) {
    abort();
    return () => undefined;
  }
  source.addEventListener('abort', abort, { once: true });
  return () => source.removeEventListener('abort', abort);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
