import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { GUIDELINE_SKILL_PATH, GUIDELINES_TOOL_NAME } from './catalog.ts';
import { executeGuidelines } from './execute.ts';
import {
  createGuidelineReadState,
  registerGuidelineGuard,
  resetGuidelineReadState,
} from './guard.ts';
import { appendGuidelinesReminder } from './prompt.ts';
import {
  createReviewState,
  registerReviewGuard,
  resetReviewTurn,
} from './review.ts';

export default function registerGuidelines(pi: ExtensionAPI): void {
  const readState = createGuidelineReadState();
  registerGuidelineGuard(pi, readState);

  pi.registerTool({
    name: GUIDELINES_TOOL_NAME,
    label: 'Sideroom Guidelines',
    description:
      'Before write or edit, load the complete Sideroom coding skill and the language guide for the target path. Unsupported languages load only the general skill. Call directly, not from another tool. Reuse loaded guides in this agent run; reload after compaction or a new run. Full reads of the packaged documents through read remain supported.',
    parameters: Type.Object({
      path: Type.String({
        minLength: 1,
        description:
          'Path of the file you will change; the file need not exist.',
      }),
    }),
    exposure: 'model-only',
    executionMode: 'sequential',
    async execute(toolCallId, { path }, signal) {
      signal?.throwIfAborted();
      const loadedPaths = new Set(readState.languageGuidesRead);
      if (readState.skillRead) {
        loadedPaths.add(GUIDELINE_SKILL_PATH);
      }
      const loaded = executeGuidelines(path, { loadedPaths });
      signal?.throwIfAborted();

      readState.pendingLoads.set(toolCallId, {
        content: loaded.content.map((part) => ({ ...part })),
        details: { paths: [...loaded.details.paths] },
      });
      return loaded;
    },
  });

  const reviewState = createReviewState();
  registerReviewGuard(pi, reviewState);
  pi.on('session_start', () => {
    resetGuidelineReadState(readState);
    resetReviewTurn(reviewState);
  });

  pi.on('before_agent_start', (event) => {
    resetGuidelineReadState(readState);
    const systemPrompt = appendGuidelinesReminder(event.systemPrompt);
    if (systemPrompt === event.systemPrompt) {
      return;
    }
    return { systemPrompt };
  });

  pi.on('session_compact', () => {
    resetGuidelineReadState(readState);
  });
}
