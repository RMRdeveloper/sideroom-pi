import type { AskAnswer, AskQuestion, AskSelection } from './model.ts';

/**
 * Sorted ascending so the answer and its rendering stay stable no matter the
 * order the user toggled the options in.
 */
export function toggleSelection(
  selected: readonly number[],
  optionIndex: number,
): number[] {
  if (selected.includes(optionIndex)) {
    return selected.filter((index) => index !== optionIndex);
  }
  return [...selected, optionIndex].sort((left, right) => left - right);
}

export function answerFromSelections(
  question: AskQuestion,
  selected: readonly number[],
): AskAnswer {
  const selections = selected.map((optionIndex) =>
    toSelection(question, optionIndex),
  );
  const [first] = selections;
  if (first === undefined) {
    throw new Error(`Question '${question.id}' needs at least one selection`);
  }
  return {
    id: question.id,
    value: first.value,
    label: first.label,
    index: first.index,
    wasCustom: false,
    outOfScope: false,
    selections,
  };
}

function toSelection(question: AskQuestion, optionIndex: number): AskSelection {
  const option = question.options[optionIndex];
  if (option === undefined) {
    throw new Error(
      `Unknown option index ${String(optionIndex)} for question '${question.id}'`,
    );
  }
  return { value: option.value, label: option.label, index: optionIndex + 1 };
}
