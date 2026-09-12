import { type Static, Type } from 'typebox';
import { Check, Errors } from 'typebox/value';

export const TOOL_NAME = 'sideroom_ask';
export const OUT_OF_SCOPE_VALUE = 'Out of scope';
export const OUT_OF_SCOPE_LABEL = 'Out of scope';
export const CUSTOM_VALUE = '__other__';
export const CUSTOM_LABEL = 'Write a custom answer';
export const UI_UNAVAILABLE =
  'Error: UI not available (running in non-interactive mode)';

export const SINGLE_SELECTION_MODE = 'single';
export const MULTIPLE_SELECTION_MODE = 'multiple';

export type SelectionMode =
  | typeof SINGLE_SELECTION_MODE
  | typeof MULTIPLE_SELECTION_MODE;

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;
const MAX_TAB_LABEL_LENGTH = 16;
const MAX_OPTION_LABEL_LENGTH = 60;

const QuestionOptionSchema = Type.Object({
  value: Type.String({ description: 'The value returned when selected' }),
  label: Type.String({
    maxLength: MAX_OPTION_LABEL_LENGTH,
    description: `Display label for the option, with at most ${String(MAX_OPTION_LABEL_LENGTH)} characters`,
  }),
  description: Type.Optional(
    Type.String({ description: 'Optional description shown below the label' }),
  ),
});

const QuestionSchema = Type.Object({
  id: Type.String({ description: 'Unique identifier for this question' }),
  label: Type.Optional(
    Type.String({
      maxLength: MAX_TAB_LABEL_LENGTH,
      description: `Short contextual label of at most ${String(MAX_TAB_LABEL_LENGTH)} characters for the tab bar, e.g. 'Scope' (defaults to Q1, Q2)`,
    }),
  ),
  prompt: Type.String({ description: 'The full question text to display' }),
  options: Type.Array(QuestionOptionSchema, {
    minItems: 2,
    maxItems: MAX_OPTIONS,
    description: `Two to ${String(MAX_OPTIONS)} mutually exclusive options`,
  }),
  selectionMode: Type.Optional(
    Type.Union(
      [
        Type.Literal(SINGLE_SELECTION_MODE),
        Type.Literal(MULTIPLE_SELECTION_MODE),
      ],
      {
        description:
          "'single' (default) answers with one option; 'multiple' answers with one or more",
      },
    ),
  ),
  recommendationIndex: Type.Optional(
    Type.Integer({
      minimum: 0,
      description:
        "Required for a 'single' question: index into options pointing at the recommended option",
    }),
  ),
  recommendedIndices: Type.Optional(
    Type.Array(Type.Integer({ minimum: 0 }), {
      minItems: 1,
      description:
        "Required for a 'multiple' question: indexes of every recommended option, at least one",
    }),
  ),
});

export const AskParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: MAX_QUESTIONS,
    description: `One to ${String(MAX_QUESTIONS)} questions to ask the user in this batch`,
  }),
});

export type AskParams = Static<typeof AskParamsSchema>;
export type QuestionOption = AskParams['questions'][number]['options'][number];

export interface AskQuestion {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly options: readonly QuestionOption[];
  readonly selectionMode: SelectionMode;
  readonly recommendedIndices: readonly number[];
}

export interface AskSelection {
  readonly value: string;
  readonly label: string;
  readonly index: number;
}

export interface AskAnswer {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly wasCustom: boolean;
  readonly outOfScope: boolean;
  readonly index?: number;
  readonly selections?: readonly AskSelection[];
}

export interface AskResult {
  readonly questions: readonly AskQuestion[];
  readonly answers: readonly AskAnswer[];
  readonly cancelled: boolean;
}

export type RenderOption = QuestionOption & {
  readonly isOther?: boolean;
  readonly isOutOfScope?: boolean;
  readonly isRecommended?: boolean;
};

export type ParseAskResult =
  | { readonly ok: true; readonly questions: readonly AskQuestion[] }
  | { readonly ok: false; readonly message: string };

interface JsonWireObject {
  readonly [key: string]: JsonWireValue | undefined;
}

type JsonWireValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonWireValue[]
  | JsonWireObject;

export function prepareAskArguments(args: unknown): AskParams {
  return decodeAskWireArgs(args) as AskParams;
}

function decodeAskWireArgs(args: unknown): JsonWireValue {
  if (!isJsonWireObject(args)) {
    return toJsonWireValue(args);
  }

  const questions = decodeAskQuestions(args.questions);
  if (questions === args.questions) {
    return args;
  }

  return { ...args, questions };
}

function decodeAskQuestions(
  value: JsonWireValue | undefined,
): JsonWireValue | undefined {
  if (value === undefined) {
    return value;
  }

  const parsed = decodeJsonWireField(value);
  if (!Array.isArray(parsed)) {
    return parsed;
  }

  let changed = parsed !== value;
  const questions = parsed.map((question) => {
    const decoded = decodeAskQuestion(question);
    if (decoded !== question) {
      changed = true;
    }
    return decoded;
  });
  if (!changed) {
    return value;
  }
  return questions;
}

function decodeAskQuestion(question: JsonWireValue): JsonWireValue {
  if (!isJsonWireObject(question)) {
    return question;
  }

  const options = decodeJsonWireField(question.options);
  if (options === question.options) {
    return question;
  }

  return { ...question, options };
}

function decodeJsonWireField(
  value: JsonWireValue | undefined,
): JsonWireValue | undefined {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value) as JsonWireValue;
  } catch {
    return value;
  }
}

function isJsonWireObject(value: unknown): value is JsonWireObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toJsonWireValue(value: unknown): JsonWireValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonWireValue);
  }
  if (isJsonWireObject(value)) {
    return value;
  }
  return null;
}

export function parseAskParams(value: unknown): ParseAskResult {
  const decoded = decodeAskWireArgs(value);
  if (!Check(AskParamsSchema, decoded)) {
    return { ok: false, message: schemaErrorMessage(decoded) };
  }

  const seen = new Set<string>();
  for (const question of decoded.questions) {
    if (seen.has(question.id)) {
      return {
        ok: false,
        message: `Error: Duplicate question id: ${question.id}`,
      };
    }
    seen.add(question.id);
    const failure = recommendationError(question);
    if (failure !== undefined) {
      return { ok: false, message: failure };
    }
  }

  return { ok: true, questions: normalizeQuestions(decoded.questions) };
}

export function normalizeQuestions(
  questions: AskParams['questions'],
): AskQuestion[] {
  return questions.map((question, index) => {
    const label = question.label;
    const selectionMode = selectionModeOf(question);
    return {
      id: question.id,
      label:
        label !== undefined && label.trim().length > 0
          ? label
          : `Q${String(index + 1)}`,
      prompt: question.prompt,
      options: question.options,
      selectionMode,
      recommendedIndices: recommendedIndicesFor(question, selectionMode),
    };
  });
}

function selectionModeOf(
  question: AskParams['questions'][number],
): SelectionMode {
  return question.selectionMode === MULTIPLE_SELECTION_MODE
    ? MULTIPLE_SELECTION_MODE
    : SINGLE_SELECTION_MODE;
}

function recommendedIndicesFor(
  question: AskParams['questions'][number],
  selectionMode: SelectionMode,
): readonly number[] {
  if (selectionMode === MULTIPLE_SELECTION_MODE) {
    return question.recommendedIndices ?? [];
  }
  if (question.recommendationIndex === undefined) {
    return [];
  }
  return [question.recommendationIndex];
}

function recommendationError(
  question: AskParams['questions'][number],
): string | undefined {
  if (selectionModeOf(question) === SINGLE_SELECTION_MODE) {
    if (question.recommendationIndex === undefined) {
      return `Error: Question '${question.id}' requires recommendationIndex`;
    }
    if (question.recommendedIndices !== undefined) {
      return `Error: Question '${question.id}' is a single-selection question; remove recommendedIndices`;
    }
    if (question.recommendationIndex >= question.options.length) {
      return `Error: recommendationIndex ${String(question.recommendationIndex)} is out of range for question '${question.id}'`;
    }
    return undefined;
  }
  if (question.recommendedIndices === undefined) {
    return `Error: Question '${question.id}' is a multiple-selection question and requires recommendedIndices`;
  }
  if (question.recommendationIndex !== undefined) {
    return `Error: Question '${question.id}' is a multiple-selection question; remove recommendationIndex`;
  }
  const outOfRange = question.recommendedIndices.find(
    (optionIndex) => optionIndex >= question.options.length,
  );
  if (outOfRange !== undefined) {
    return `Error: recommendedIndices ${String(outOfRange)} is out of range for question '${question.id}'`;
  }
  return undefined;
}

export function renderOptions(question: AskQuestion): RenderOption[] {
  const options: RenderOption[] = question.options.map((option, index) => ({
    ...option,
    isRecommended: question.recommendedIndices.includes(index),
  }));
  options.push({
    value: OUT_OF_SCOPE_VALUE,
    label: OUT_OF_SCOPE_LABEL,
    isOutOfScope: true,
  });
  options.push({
    value: CUSTOM_VALUE,
    label: CUSTOM_LABEL,
    isOther: true,
  });
  return options;
}

export function formatAnswerLines(
  questions: readonly AskQuestion[],
  answers: readonly AskAnswer[],
): string[] {
  return answers.map((answer) => {
    const question = questions.find((entry) => entry.id === answer.id);
    const questionLabel = question?.label ?? answer.id;
    if (answer.outOfScope) {
      return `${questionLabel}: Out of scope`;
    }
    if (answer.wasCustom) {
      return `${questionLabel}: user wrote: ${answer.label}`;
    }
    const selections = answer.selections;
    if (selections !== undefined && selections.length > 0) {
      const picked = selections
        .map((selection) => `${String(selection.index)}. ${selection.label}`)
        .join(', ');
      return `${questionLabel}: user selected: ${picked}`;
    }
    if (answer.index !== undefined) {
      return `${questionLabel}: user selected: ${String(answer.index)}. ${answer.label}`;
    }
    return `${questionLabel}: user selected: ${answer.label}`;
  });
}

function schemaErrorMessage(value: unknown): string {
  const [error] = Errors(AskParamsSchema, value);
  if (error === undefined) {
    return 'Error: Invalid sideroom_ask parameters';
  }
  if (error.instancePath === '/questions') {
    if (error.keyword === 'minItems') {
      return 'Error: No questions provided';
    }
    if (error.keyword === 'maxItems') {
      return `Error: A questionnaire batch may include at most ${String(MAX_QUESTIONS)} questions`;
    }
  }

  const questions = asQuestions(value);
  const optionsMatch = /\/questions\/(\d+)\/options$/.exec(error.instancePath);
  if (optionsMatch !== null) {
    const questionIndex = Number(optionsMatch[1]);
    const id = questionId(questions, questionIndex);
    if (error.keyword === 'minItems') {
      return `Error: Question '${id}' must include at least two options`;
    }
    if (error.keyword === 'maxItems') {
      return `Error: Question '${id}' may include at most ${String(MAX_OPTIONS)} options`;
    }
  }

  const recommendedMatch = /\/questions\/(\d+)\/recommendedIndices$/.exec(
    error.instancePath,
  );
  if (recommendedMatch !== null && error.keyword === 'minItems') {
    const questionIndex = Number(recommendedMatch[1]);
    const id = questionId(questions, questionIndex);
    return `Error: Question '${id}' must mark at least one recommended option`;
  }

  const tabLabelMatch = /\/questions\/(\d+)\/label$/.exec(error.instancePath);
  if (error.keyword === 'maxLength' && tabLabelMatch !== null) {
    const questionIndex = Number(tabLabelMatch[1]);
    const id = questionId(questions, questionIndex);
    return `Error: Question '${id}' label may contain at most ${String(MAX_TAB_LABEL_LENGTH)} characters`;
  }

  const optionLabelMatch = /\/questions\/(\d+)\/options\/(\d+)\/label$/.exec(
    error.instancePath,
  );
  if (error.keyword === 'maxLength' && optionLabelMatch !== null) {
    const questionIndex = Number(optionLabelMatch[1]);
    const optionIndex = Number(optionLabelMatch[2]);
    const id = questionId(questions, questionIndex);
    return `Error: Option ${String(optionIndex + 1)} for question '${id}' may contain at most ${String(MAX_OPTION_LABEL_LENGTH)} characters`;
  }

  return `Error: Invalid sideroom_ask parameters`;
}

function questionId(
  questions: readonly Record<string, unknown>[],
  index: number,
): string {
  const question = questions[index];
  return question !== undefined && typeof question.id === 'string'
    ? question.id
    : String(index);
}

function asQuestions(value: unknown): readonly Record<string, unknown>[] {
  if (typeof value !== 'object' || value === null) {
    return [];
  }
  if (!('questions' in value) || !Array.isArray(value.questions)) {
    return [];
  }
  return value.questions.filter(
    (question): question is Record<string, unknown> =>
      typeof question === 'object' && question !== null,
  );
}
