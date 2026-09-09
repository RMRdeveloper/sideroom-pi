import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  type AskParams,
  type AskQuestion,
  type AskResult,
  formatAnswerLines,
  parseAskParams,
  UI_UNAVAILABLE,
} from './model.ts';
import { runAskUi } from './ui.ts';

interface AskToolResult {
  readonly content: [{ readonly type: 'text'; readonly text: string }];
  readonly details: AskResult;
}

export async function executeAsk(
  params: AskParams,
  ctx: Pick<ExtensionContext, 'mode' | 'ui'>,
): Promise<AskToolResult> {
  const parsed = parseAskParams(params);
  if (!parsed.ok) {
    return cancelledResult(parsed.message);
  }
  if (ctx.mode !== 'tui') {
    return cancelledResult(UI_UNAVAILABLE, parsed.questions);
  }

  const result = await runAskUi(ctx.ui, parsed.questions);
  if (result.cancelled) {
    return {
      content: [{ type: 'text', text: 'User cancelled the questionnaire' }],
      details: result,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: formatAnswerLines(parsed.questions, result.answers).join('\n'),
      },
    ],
    details: result,
  };
}

function cancelledResult(
  message: string,
  questions: readonly AskQuestion[] = [],
): AskToolResult {
  return {
    content: [{ type: 'text', text: message }],
    details: { questions, answers: [], cancelled: true },
  };
}
