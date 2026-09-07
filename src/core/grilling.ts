import type { ModelProvider } from './model.ts';

/** A user-owned decision requested by the grilling skill. */
export interface GrillingQuestion {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly recommendation: string;
  /**
   * Two or three mutually exclusive alternatives. A legacy response with only
   * `recommendation` expands to a single option so older models keep working.
   */
  readonly options: readonly string[];
  /** Index into `options` pointing at `recommendation`. */
  readonly recommendationIndex: number;
}

/** An answer collected by the caller without persisting project-local state. */
export interface GrillingAnswer {
  readonly id: string;
  readonly answer: string;
}

export interface GrillingInput {
  readonly request: string;
  readonly answers: readonly GrillingAnswer[];
}

export type GrillingResult =
  | {
      readonly status: 'questions';
      readonly questions: readonly GrillingQuestion[];
    }
  | { readonly status: 'settled'; readonly summary: string };

/** Port for one design-tree round before the planner receives a request. */
export interface GrillingAgent {
  run(input: GrillingInput): Promise<GrillingResult>;
}

/** Invoke the packaged sideroom-grilling skill in a Pi session. */
export function createGriller(model: ModelProvider): GrillingAgent {
  return {
    async run(input) {
      const value = await model.generate<unknown>({
        agent: 'sideroom-planner',
        skill: 'sideroom-grilling',
        input,
        schema:
          '{ status: "questions", questions: [{ id: string, title: string, question: string, recommendation: string, options: [string, string] | [string, string, string], recommendationIndex: number }] } | { status: "settled", summary: string }',
      });
      return parseGrillingResult(value);
    },
  };
}

function parseGrillingResult(value: unknown): GrillingResult {
  const record = recordOf(value);
  if (record.status === 'settled') {
    if (!isText(record.summary)) {
      throw new Error('grilling returned no settled summary');
    }
    return { status: 'settled', summary: record.summary };
  }
  if (record.status !== 'questions' || !Array.isArray(record.questions)) {
    throw new Error('grilling returned an unknown status');
  }
  if (record.questions.length === 0 || record.questions.length > 3) {
    throw new Error('grilling must ask between one and three questions');
  }
  const questions = record.questions.map(parseQuestion);
  if (
    new Set(questions.map((question) => question.id)).size !== questions.length
  ) {
    throw new Error('grilling returned duplicate question ids');
  }
  return { status: 'questions', questions };
}

function parseQuestion(value: unknown): GrillingQuestion {
  const record = recordOf(value);
  if (
    !isText(record.id) ||
    !isText(record.title) ||
    !isText(record.question) ||
    !isText(record.recommendation)
  ) {
    throw new Error('grilling returned a malformed question');
  }
  if (record.options === undefined) {
    return {
      id: record.id,
      title: record.title,
      question: record.question,
      recommendation: record.recommendation,
      options: [record.recommendation],
      recommendationIndex: 0,
    };
  }
  if (
    !Array.isArray(record.options) ||
    record.options.length < 2 ||
    record.options.length > 3
  ) {
    throw new Error('grilling must provide two or three options');
  }
  const options: string[] = [];
  for (const option of record.options) {
    if (!isText(option)) {
      throw new Error('grilling must provide two or three non-empty options');
    }
    options.push(option);
  }
  if (
    typeof record.recommendationIndex !== 'number' ||
    !Number.isInteger(record.recommendationIndex) ||
    record.recommendationIndex < 0 ||
    record.recommendationIndex >= options.length
  ) {
    throw new Error('grilling returned an invalid recommendationIndex');
  }
  if (options[record.recommendationIndex] !== record.recommendation) {
    throw new Error(
      'grilling recommendation must match options[recommendationIndex]',
    );
  }
  return {
    id: record.id,
    title: record.title,
    question: record.question,
    recommendation: record.recommendation,
    options,
    recommendationIndex: record.recommendationIndex,
  };
}

function recordOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('grilling returned a non-object response');
  }
  return value as Record<string, unknown>;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
