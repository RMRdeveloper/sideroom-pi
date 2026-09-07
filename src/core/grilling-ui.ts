import type { GrillingAnswer, GrillingQuestion } from './grilling.ts';

/** Label appended to the effective options for marking a question out-of-scope. */
export const OUT_OF_SCOPE_LABEL = 'Out of scope';

/** Label appended to the effective options for writing a custom answer. */
export const CUSTOM_LABEL = 'Write a custom answer';

/** Answer recorded when a grilling question is marked out-of-scope. */
export const OUT_OF_SCOPE_ANSWER = 'Out of scope';

/**
 * Per-question screen state. `selected` is an index into
 * `effectiveOptions()`; `outOfScope` mirrors the out-of-scope row so the `o`
 * toggle preserves the previous selection.
 */
interface GrillingQuestionState {
  readonly selected: number;
  readonly customText?: string;
  readonly outOfScope: boolean;
}

/** Batch grilling screen state: focused question plus one entry per question. */
export interface GrillingScreenState {
  readonly active: number;
  readonly selections: readonly GrillingQuestionState[];
}

/** Effective options shown for one question: base options plus scope rows. */
export function effectiveOptions(question: GrillingQuestion): string[] {
  return [...question.options, OUT_OF_SCOPE_LABEL, CUSTOM_LABEL];
}

/** Initial screen state with every question set to its recommendation. */
export function createGrillingState(
  questions: readonly GrillingQuestion[],
): GrillingScreenState {
  return {
    active: 0,
    selections: questions.map((question) => ({
      selected: question.recommendationIndex,
      customText: undefined,
      outOfScope: false,
    })),
  };
}

/** Move the focused question, wrapping around both ends of the round. */
export function moveQuestion(
  state: GrillingScreenState,
  delta: number,
): GrillingScreenState {
  if (state.selections.length === 0) {
    return state;
  }
  const count = state.selections.length;
  const next = (((state.active + delta) % count) + count) % count;
  return { ...state, active: next };
}

/**
 * Choose an effective-option row for one question. Choosing the out-of-scope
 * row arms the flag; any other row clears it. Unknown questions are ignored.
 */
export function chooseOption(
  state: GrillingScreenState,
  questions: readonly GrillingQuestion[],
  question: number,
  option: number,
): GrillingScreenState {
  const selection = state.selections[question];
  const target = questions[question];
  if (selection === undefined || target === undefined) {
    return state;
  }
  const last = effectiveOptions(target).length - 1;
  const clamped = Math.min(Math.max(option, 0), last);
  return {
    ...state,
    selections: state.selections.map((entry, index) => {
      if (index !== question) {
        return entry;
      }
      return {
        ...entry,
        selected: clamped,
        outOfScope: clamped === target.options.length,
      };
    }),
  };
}

/** Flip the out-of-scope flag for one question, keeping its current selection. */
export function toggleOutOfScope(
  state: GrillingScreenState,
  questions: readonly GrillingQuestion[],
  question: number,
): GrillingScreenState {
  const selection = state.selections[question];
  if (selection === undefined || questions[question] === undefined) {
    return state;
  }
  return {
    ...state,
    selections: state.selections.map((entry, index) => {
      if (index !== question) {
        return entry;
      }
      return { ...entry, outOfScope: !entry.outOfScope };
    }),
  };
}

/** Store a custom answer and point the question at the custom row. */
export function setCustom(
  state: GrillingScreenState,
  questions: readonly GrillingQuestion[],
  question: number,
  text: string,
): GrillingScreenState {
  const selection = state.selections[question];
  const target = questions[question];
  if (selection === undefined || target === undefined) {
    return state;
  }
  return {
    ...state,
    selections: state.selections.map((entry, index) => {
      if (index !== question) {
        return entry;
      }
      return {
        ...entry,
        selected: target.options.length + 1,
        customText: text,
        outOfScope: false,
      };
    }),
  };
}

/**
 * Convert screen state to answers. Out-of-scope resolves to `Out of scope`,
 * the custom row resolves to its text (falling back to the recommendation
 * when empty), and anything unknown falls back to the recommendation.
 */
export function toAnswers(
  state: GrillingScreenState,
  questions: readonly GrillingQuestion[],
): GrillingAnswer[] {
  return questions.map((question, index) => {
    const selection = state.selections[index];
    if (selection === undefined) {
      return { id: question.id, answer: question.recommendation };
    }
    if (
      selection.outOfScope ||
      selection.selected === question.options.length
    ) {
      return { id: question.id, answer: OUT_OF_SCOPE_ANSWER };
    }
    if (selection.selected === question.options.length + 1) {
      const custom = (selection.customText ?? '').trim();
      if (custom.length > 0) {
        return { id: question.id, answer: custom };
      }
      return { id: question.id, answer: question.recommendation };
    }
    const option = question.options[selection.selected];
    if (option === undefined) {
      return { id: question.id, answer: question.recommendation };
    }
    return { id: question.id, answer: option };
  });
}

/** Render the batch screen as a focused question card and compact status list. */
export function renderGrillingLines(
  state: GrillingScreenState,
  questions: readonly GrillingQuestion[],
  round?: number,
): string[] {
  const lines = [
    round === undefined
      ? 'Sideroom Grilling — answer every question'
      : `Sideroom Grilling — Round ${String(round)}`,
    '',
  ];
  const activeQuestion = questions[state.active];
  const activeSelection = state.selections[state.active];
  if (activeQuestion !== undefined) {
    lines.push(
      `Question ${String(state.active + 1)} of ${String(questions.length)}`,
    );
    lines.push(activeQuestion.title);
    lines.push(activeQuestion.question);
    lines.push('Options');
    effectiveOptions(activeQuestion).forEach((option, optionIndex) => {
      const bullet = isSelected(activeSelection, activeQuestion, optionIndex)
        ? '●'
        : '○';
      const label =
        optionIndex < activeQuestion.options.length
          ? `${String(optionIndex + 1)}. `
          : '';
      const recommendation =
        optionIndex === activeQuestion.recommendationIndex
          ? ' ✓ recommended'
          : '';
      lines.push(`  ${bullet} ${label}${option}${recommendation}`);
    });
    const custom = (activeSelection?.customText ?? '').trim();
    if (custom.length > 0) {
      lines.push(`    → "${custom}"`);
    }
  }
  lines.push('', 'Questions');
  questions.forEach((question, index) => {
    const selection = state.selections[index];
    const marker = index === state.active ? '●' : '○';
    const scope = selection?.outOfScope === true ? ' [out of scope]' : '';
    lines.push(`  ${marker} Q${String(index + 1)} — ${question.title}${scope}`);
  });
  lines.push('');
  lines.push(
    '[↑↓] question [←→/1-3] option [o] toggle out of scope [Enter] edit custom answer/confirm [Esc] cancel and use sequential questions',
  );
  return lines;
}

/** Resolve which effective row carries the selection bullet. */
function isSelected(
  selection: GrillingQuestionState | undefined,
  question: GrillingQuestion,
  optionIndex: number,
): boolean {
  if (selection === undefined) {
    return optionIndex === question.recommendationIndex;
  }
  if (selection.outOfScope) {
    return optionIndex === question.options.length;
  }
  return selection.selected === optionIndex;
}
