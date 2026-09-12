import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { executeAsk } from './execute.ts';
import {
  AskParamsSchema,
  type AskResult,
  prepareAskArguments,
  TOOL_NAME,
} from './model.ts';

export const ASK_DESCRIPTION =
  'Ask the user one or more questions in the language they are speaking. Use for clarifying requirements, getting preferences, or confirming decisions. Each question must include a recommended option, or several recommended options when it accepts multiple selections. For a single question, shows a simple option list. For multiple questions, shows a tab-based interface.';

export const ASK_PROMPT_SNIPPET =
  'Ask the user one or more questions with a recommended option, in their language.';

export const ASK_PROMPT_GUIDELINES = [
  'Use sideroom_ask to clarify requirements, preferences, or decisions with the user.',
  'When a non-trivial request is not yet a settled spec, follow the sideroom-grill skill before implementing; it owns the interview and drives sideroom_ask rounds.',
  'Each sideroom_ask question needs an id, a prompt, at least two options, and a recommendationIndex pointing at the recommended option.',
  'Write every sideroom_ask prompt, tab label, and option label or description in the language the user is speaking. Keep ids, option values, and tool code in English.',
  'sideroom_ask always adds Out of scope and a custom answer; do not include those options yourself, and in a multiple-selection question they replace the selections.',
  'For a genuinely plural sideroom_ask question, set selectionMode "multiple" with recommendedIndices (at least one) instead of recommendationIndex; never send both fields, and keep the single default otherwise.',
  'One sideroom_ask call is one batch; call it again if another round of questions is needed.',
  'sideroom_ask only works in the interactive TUI; it returns an error in print, JSON, or RPC modes.',
];

// Pi loads extensions/*/index.ts through export default.
export default function registerAsk(pi: ExtensionAPI): void {
  pi.registerTool({
    name: TOOL_NAME,
    label: 'Sideroom Ask',
    description: ASK_DESCRIPTION,
    promptSnippet: ASK_PROMPT_SNIPPET,
    promptGuidelines: ASK_PROMPT_GUIDELINES,
    parameters: AskParamsSchema,
    prepareArguments: prepareAskArguments,
    executionMode: 'sequential',
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) =>
      executeAsk(params, ctx),
    renderCall(args, theme) {
      const questions = args.questions;
      const count = questions.length;
      const labels = questions
        .map(
          (question, index) =>
            question.label || question.id || `Q${String(index + 1)}`,
        )
        .join(', ');
      let text = theme.fg('toolTitle', theme.bold(`${TOOL_NAME} `));
      text += theme.fg(
        'muted',
        `${String(count)} question${count !== 1 ? 's' : ''}`,
      );
      if (labels.length > 0) {
        text += theme.fg('dim', ` (${labels})`);
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, _options, theme) {
      const details = result.details as AskResult | undefined;
      if (details === undefined) {
        const text = result.content[0];
        return new Text(text?.type === 'text' ? text.text : '', 0, 0);
      }
      if (details.cancelled) {
        return new Text(theme.fg('warning', 'Cancelled'), 0, 0);
      }
      const lines = details.answers.map((answer) => {
        const mark = theme.fg('success', '✓ ');
        const id = theme.fg('accent', answer.id);
        if (answer.outOfScope) {
          return `${mark}${id}: ${theme.fg('muted', '(out of scope)')}`;
        }
        if (answer.wasCustom) {
          return `${mark}${id}: ${theme.fg('muted', '(wrote) ')}${answer.label}`;
        }
        if (answer.selections !== undefined && answer.selections.length > 0) {
          const picked = answer.selections
            .map(
              (selection) => `${String(selection.index)}. ${selection.label}`,
            )
            .join(', ');
          return `${mark}${id}: ${picked}`;
        }
        if (answer.index !== undefined) {
          return `${mark}${id}: ${String(answer.index)}. ${answer.label}`;
        }
        return `${mark}${id}: ${answer.label}`;
      });
      return new Text(lines.join('\n'), 0, 0);
    },
  });
}
