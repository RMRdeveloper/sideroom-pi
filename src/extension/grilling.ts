import type { ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { Key, matchesKey, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import type { GrillingAnswer, GrillingQuestion } from '../core/grilling.ts';
import {
  chooseOption,
  createGrillingState,
  effectiveOptions,
  type GrillingScreenState,
  moveQuestion,
  renderGrillingLines,
  setCustom,
  toAnswers as toGrillingAnswers,
  toggleOutOfScope,
} from '../core/grilling-ui.ts';
import type { PipelineProgress } from './progress.ts';

const RECOMMENDED_PREFIX = '✓ Recommended: ';
const CUSTOM_ANSWER = 'Write a custom answer';
const GRILLING_WIDGET_KEY = 'sideroom-grilling';
const OUT_OF_SCOPE_ANSWER = 'Out of scope';

/** Result reported by the batch grilling component. */
export type GrillingOverlayResult =
  | { readonly kind: 'confirmed'; readonly state: GrillingScreenState }
  | {
      readonly kind: 'edit';
      readonly question: number;
      readonly state: GrillingScreenState;
    }
  | { readonly kind: 'cancelled'; readonly state: GrillingScreenState };

export async function answerQuestions(
  questions: readonly GrillingQuestion[],
  context: ExtensionCommandContext,
  progress: PipelineProgress,
): Promise<readonly GrillingAnswer[] | undefined> {
  if (!context.hasUI || context.mode !== 'tui') {
    return undefined;
  }
  try {
    if (typeof context.ui.custom === 'function') {
      try {
        const batched = await answerBatchOverlay(questions, context, progress);
        if (batched !== undefined) {
          return batched;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        context.ui.notify(
          `Sideroom could not render the grilling batch (${message}); using sequential questions instead.`,
          'warning',
        );
      }
    }
    return await answerSequential(questions, context, progress);
  } finally {
    context.ui.setWidget(GRILLING_WIDGET_KEY, undefined);
  }
}

/**
 * Answer the whole round in a single component. Returns undefined when the
 * component is cancelled, unavailable, or fails, so the caller falls back to
 * sequential selects.
 */
async function answerBatchOverlay(
  questions: readonly GrillingQuestion[],
  context: ExtensionCommandContext,
  progress: PipelineProgress,
): Promise<readonly GrillingAnswer[] | undefined> {
  progress.awaitDecision(1, questions.length);
  let state = createGrillingState(questions);
  for (;;) {
    const result = await context.ui.custom<GrillingOverlayResult>(
      (tui, _theme, _keybindings, done) =>
        createGrillingOverlay(questions, state, done, tui),
    );
    if (result === undefined) {
      return undefined;
    }
    state = result.state;
    if (result.kind === 'confirmed') {
      return toGrillingAnswers(state, questions);
    }
    if (result.kind === 'cancelled') {
      return undefined;
    }
    const target = questions[result.question];
    if (target === undefined) {
      continue;
    }
    const prefill = state.selections[result.question]?.customText ?? '';
    const edited = await context.ui.editor(
      `Sideroom Grilling — custom answer (Q${String(result.question + 1)} — ${target.title})`,
      prefill,
    );
    if (edited !== undefined && edited.trim().length > 0) {
      state = setCustom(state, questions, result.question, edited.trim());
    }
  }
}

/**
 * Batch grilling component. It replaces the editor rather than using Pi's
 * experimental transparent overlay, which prevents background content from
 * bleeding through the question list.
 */
function createGrillingOverlay(
  questions: readonly GrillingQuestion[],
  initial: GrillingScreenState,
  done: (result: GrillingOverlayResult) => void,
  tui: { requestRender(): void } | undefined,
): {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
} {
  let current = initial;
  let cachedLines: string[] | undefined;
  let cachedWidth: number | undefined;
  const refresh = (): void => {
    cachedLines = undefined;
    cachedWidth = undefined;
    tui?.requestRender();
  };
  return {
    render(width: number): string[] {
      if (cachedLines === undefined || cachedWidth !== width) {
        cachedLines = wrapGrillingLines(
          renderGrillingLines(current, questions),
          width,
        );
        cachedWidth = width;
      }
      return cachedLines;
    },
    handleInput(data: string): void {
      if (matchesKey(data, Key.enter) || data === '\r') {
        const target = questions[current.active];
        const selection = current.selections[current.active];
        if (
          target !== undefined &&
          selection?.selected === target.options.length + 1
        ) {
          done({ kind: 'edit', question: current.active, state: current });
          return;
        }
        done({ kind: 'confirmed', state: current });
        return;
      }
      if (matchesKey(data, Key.escape)) {
        done({ kind: 'cancelled', state: current });
        return;
      }
      if (matchesKey(data, Key.up)) {
        current = moveQuestion(current, -1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        current = moveQuestion(current, 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.left)) {
        current = stepOption(questions, current, -1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.right)) {
        current = stepOption(questions, current, 1);
        refresh();
        return;
      }
      if (matchesKey(data, 'o') || matchesKey(data, Key.shift('o'))) {
        current = toggleOutOfScope(current, questions, current.active);
        refresh();
        return;
      }

      const digit = parseDigit(data);
      if (digit !== undefined) {
        const target = questions[current.active];
        if (target !== undefined && digit < target.options.length) {
          current = chooseOption(current, questions, current.active, digit);
          refresh();
        }
      }
    },
    invalidate: refresh,
  };
}

/** Preserve ANSI styles while ensuring every grilling line fits the viewport. */
function wrapGrillingLines(lines: readonly string[], width: number): string[] {
  const renderWidth = Math.max(1, width);
  return lines.flatMap((line) => wrapTextWithAnsi(line, renderWidth));
}

/** Step the focused question across its effective options, clamped at both ends. */
function stepOption(
  questions: readonly GrillingQuestion[],
  state: GrillingScreenState,
  delta: number,
): GrillingScreenState {
  const target = questions[state.active];
  if (target === undefined) {
    return state;
  }
  const options = effectiveOptions(target);
  const selection = state.selections[state.active];
  const at =
    selection === undefined ? target.recommendationIndex : selection.selected;
  const clamped = Math.min(Math.max(at, 0), options.length - 1);
  const next = Math.min(Math.max(clamped + delta, 0), options.length - 1);
  return chooseOption(state, questions, state.active, next);
}

/** Parse a `1`-`3` digit into a zero-based option index. */
function parseDigit(data: string): number | undefined {
  if (data === '1' || data === '2' || data === '3') {
    return Number(data) - 1;
  }
  return undefined;
}

/** Sequential fallback: one select per question with out-of-scope inline. */
async function answerSequential(
  questions: readonly GrillingQuestion[],
  context: ExtensionCommandContext,
  progress: PipelineProgress,
): Promise<readonly GrillingAnswer[]> {
  const answers = new Map<string, string>();
  for (const [index, question] of questions.entries()) {
    const questionNumber = index + 1;
    progress.awaitDecision(questionNumber, questions.length);
    const answer = await answerQuestion(
      question,
      questionNumber,
      questions.length,
      context,
    );
    answers.set(question.id, answer);
  }
  return toAnswers(questions, answers);
}

function toAnswers(
  questions: readonly GrillingQuestion[],
  answers: ReadonlyMap<string, string>,
): readonly GrillingAnswer[] {
  return questions.map((question) => ({
    id: question.id,
    answer: answers.get(question.id) ?? '',
  }));
}

/** Ask one question: full detail goes to the widget, the select stays short. */
async function answerQuestion(
  question: GrillingQuestion,
  questionNumber: number,
  totalQuestions: number,
  context: ExtensionCommandContext,
): Promise<string> {
  const prompt = formatQuestionPrompt(question);
  context.ui.setWidget(
    GRILLING_WIDGET_KEY,
    formatQuestionDetail(question, questionNumber, totalQuestions),
    { placement: 'aboveEditor' },
  );
  const recommendedOption =
    question.options[question.recommendationIndex] ?? question.recommendation;
  const recommendedChoice = `${RECOMMENDED_PREFIX}${recommendedOption}`;
  const choices = question.options.map((option, index) =>
    index === question.recommendationIndex ? recommendedChoice : option,
  );
  const choice = await context.ui.select(prompt, [
    ...choices,
    OUT_OF_SCOPE_ANSWER,
    CUSTOM_ANSWER,
  ]);
  if (choice === undefined) {
    return question.recommendation;
  }
  if (choice === recommendedChoice) {
    return question.recommendation;
  }
  if (choice === OUT_OF_SCOPE_ANSWER) {
    return OUT_OF_SCOPE_ANSWER;
  }
  if (choice === CUSTOM_ANSWER) {
    const answer = await context.ui.input(
      `${prompt}\n\nCustom answer — state your decision and accepted trade-off`,
      'State your decision and accepted trade-off',
    );
    if (answer === undefined || answer.trim().length === 0) {
      return question.recommendation;
    }
    return answer;
  }
  if (question.options.includes(choice)) {
    return choice;
  }
  return question.recommendation;
}

/** Short select title: the full detail lives in the grilling widget. */
export function formatQuestionPrompt(
  _question: GrillingQuestion,
  questionNumber?: number,
  totalQuestions?: number,
): string {
  if (questionNumber !== undefined && totalQuestions !== undefined) {
    return `Sideroom Grilling question ${String(questionNumber)}/${String(totalQuestions)}`;
  }
  return 'Sideroom Grilling';
}

/** Full question detail published to the widget above the editor before each select. */
export function formatQuestionDetail(
  question: GrillingQuestion,
  questionNumber: number,
  totalQuestions: number,
): string[] {
  return [
    `Question ${questionNumber}/${totalQuestions}`,
    question.title,
    'Consequence and context',
    question.question,
    'Recommendation (with trade-off)',
    question.recommendation,
    'Options',
    ...question.options.map((option, index) =>
      index === question.recommendationIndex
        ? `✓ ${index + 1}. ${option} (recommended)`
        : `${index + 1}. ${option}`,
    ),
  ];
}
