import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { PERSONA_STATUS_KEY, PERSONA_TOOL_NAME } from './catalog.ts';
import { executePersona, type PersonaToolResult } from './execute.ts';
import {
  createPersonaGuardState,
  registerPersonaGuard,
  resetPersonaRun,
} from './guard.ts';
import { PERSONA_STATUS_LABEL } from './model.ts';
import { appendPersonaReminder } from './prompt.ts';

export const PERSONA_DESCRIPTION =
  "Read Sideroom's voice rules and hard prohibitions for user-facing answers.";

export const PERSONA_PROMPT_SNIPPET = 'Read the active Sideroom persona.';

// Pi loads extensions/*/index.ts through export default.
export default function registerPersona(pi: ExtensionAPI): void {
  const state = createPersonaGuardState();
  registerPersonaGuard(pi, state);

  pi.on('session_start', (_event, ctx) => publishStatus(ctx));

  pi.on('before_agent_start', (event, ctx) => {
    resetPersonaRun(state);
    publishStatus(ctx);
    const systemPrompt = appendPersonaReminder(event.systemPrompt);
    if (systemPrompt === event.systemPrompt) {
      return;
    }
    return { systemPrompt };
  });

  pi.registerTool({
    name: PERSONA_TOOL_NAME,
    label: 'Sideroom Persona',
    description: PERSONA_DESCRIPTION,
    promptSnippet: PERSONA_PROMPT_SNIPPET,
    parameters: Type.Object({}),
    executionMode: 'sequential',
    execute: async () => executePersona(),
    renderCall(_args, theme) {
      return new Text(
        theme.fg('toolTitle', theme.bold(PERSONA_TOOL_NAME)),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | PersonaToolResult['details']
        | undefined;
      const voices = details?.voiceRules.length ?? 0;
      const prohibitions = details?.prohibitions.length ?? 0;
      return new Text(
        theme.fg(
          'success',
          `${String(voices)} voice rules · ${String(prohibitions)} prohibitions`,
        ),
        0,
        0,
      );
    },
  });
}

function publishStatus(ctx: ExtensionContext): void {
  if (!ctx.hasUI) {
    return;
  }
  ctx.ui.setStatus(PERSONA_STATUS_KEY, PERSONA_STATUS_LABEL);
}
