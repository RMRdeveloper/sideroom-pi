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
  'Follow the sideroom-grill skill before non-trivial work without a settled spec. One sideroom_ask call is one batch; call again for another round.',
  'Read the repository first: reuse a consistent project fact. An architectural decision (boundaries, dependencies, cost, security, operations, persistence, public contracts, future change difficulty) is never settled silently: never assume it. Follow the sideroom-architecture skill; ask through sideroom_ask with practical consequences and a one-line justification for one recommendation. Name inconsistent patterns in the prompt. Take minor decisions yourself.',
  'Recommend evidence-backed long-term quality: maintainability and growth for known needs over initial speed. State the upfront cost; avoid speculative capacity. If decisive facts or figures are missing, ask for them first through sideroom_ask; recommend gathering evidence, not an unsupported solution.',
  'Write sideroom_ask prompts, tab labels, option labels, and option descriptions in the language the user is speaking; keep ids and option values in English.',
  'sideroom_ask always adds Out of scope and a write-your-own answer; never send them yourself. A single-selection question needs recommendationIndex; a multiple-selection question needs recommendedIndices and never recommendationIndex.',
  'sideroom_ask only works in the interactive TUI; it errors in print, JSON, and RPC modes.',
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
