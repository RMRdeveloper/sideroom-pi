import { type Static, Type } from 'typebox';
import { Check } from 'typebox/value';

const ShortText = Type.String({ minLength: 1, maxLength: 2_000 });
const LongText = Type.String({ minLength: 1, maxLength: 8_000 });
const Depth = Type.Union([Type.Literal('focused'), Type.Literal('standard'), Type.Literal('deep')]);

export const ResearchRequestSchema = Type.Object({
  question: ShortText,
  intendedChange: LongText,
  knownContext: LongText,
  scope: LongText,
  depth: Depth,
}, { additionalProperties: false });

const ReferenceSchema = Type.Object({
  path: Type.Optional(ShortText),
  symbol: Type.Optional(ShortText),
  url: Type.Optional(ShortText),
  version: Type.Optional(ShortText),
  excerpt: Type.Optional(ShortText),
}, { additionalProperties: false });

const FindingSchema = Type.Object({
  claim: ShortText,
  evidence: ShortText,
  status: Type.Union([Type.Literal('observed'), Type.Literal('inferred'), Type.Literal('pending')]),
  consequence: ShortText,
  references: Type.Array(ReferenceSchema, { minItems: 1, maxItems: 20 }),
}, { additionalProperties: false });

export const ResearchReportSchema = Type.Object({
  status: Type.Union([Type.Literal('complete'), Type.Literal('partial'), Type.Literal('blocked'), Type.Literal('cancelled')]),
  conclusion: ShortText,
  findings: Type.Array(FindingSchema, { maxItems: 30 }),
  recommendation: Type.Optional(ShortText),
  questions: Type.Array(Type.Object({ question: ShortText, blocking: Type.Boolean() }, { additionalProperties: false }), { maxItems: 20 }),
  verification: Type.Array(ShortText, { maxItems: 20 }),
  termination: ShortText,
}, { additionalProperties: false });

export const ResearchResultSchema = Type.Object({
  request: ResearchRequestSchema,
  report: ResearchReportSchema,
  cwd: ShortText,
  revision: Type.Union([ShortText, Type.Null()]),
  revisionAtEnd: Type.Union([ShortText, Type.Null()]),
  runStatus: Type.Union([Type.Literal('completed'), Type.Literal('cancelled'), Type.Literal('timed_out'), Type.Literal('output_limit'), Type.Literal('failed')]),
  issues: Type.Array(Type.Object({
    findingIndex: Type.Integer({ minimum: -1 }),
    reference: ShortText,
    reason: Type.Union([Type.Literal('not_read'), Type.Literal('changed'), Type.Literal('unavailable'), Type.Literal('web_unverified'), Type.Literal('no_support'), Type.Literal('revision_changed'), Type.Literal('revision_unavailable')]),
  }, { additionalProperties: false }), { maxItems: 1201 }),
  unverifiedConclusion: Type.Optional(ShortText),
  limitations: Type.Array(ShortText, { maxItems: 20 }),
  changedDuringResearch: Type.Array(Type.String({ minLength: 1, maxLength: 4096 }), { maxItems: 200 }),
  evidenceChecks: Type.Array(Type.Object({
    path: Type.String({ minLength: 1, maxLength: 4096 }),
    status: Type.Union([Type.Literal('unchanged'), Type.Literal('changed'), Type.Literal('unavailable')]),
    error: Type.Optional(ShortText),
  }, { additionalProperties: false }), { maxItems: 200 }),
  files: Type.Array(Type.Object({
    path: Type.String({ minLength: 1, maxLength: 4096 }),
    sha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  }, { additionalProperties: false }), { maxItems: 200 }),
  usage: Type.Object({
    elapsedMs: Type.Integer({ minimum: 0 }),
    toolCalls: Type.Integer({ minimum: 0 }),
    inputTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    outputTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    cacheReadTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    cacheWriteTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    totalTokens: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  }, { additionalProperties: false }),
}, { additionalProperties: false });

export type ResearchRequest = Static<typeof ResearchRequestSchema>;
export type ResearchReport = Static<typeof ResearchReportSchema>;
export type ResearchResult = Static<typeof ResearchResultSchema>;

export function parseResearchRequest(input: unknown): ResearchRequest {
  if (!Check(ResearchRequestSchema, input)) {
    throw new Error('Research needs a question, intended change, known context, scope and depth.');
  }
  return input;
}

export function parseResearchResult(input: unknown): ResearchResult {
  if (!Check(ResearchResultSchema, input)) {
    throw new Error('Research returned an invalid result.');
  }
  validateReportMeaning(input.report);
  if (input.runStatus !== 'completed' && input.report.status === 'complete') {
    throw new Error('An interrupted research run cannot have a complete report.');
  }
  return input;
}

export class ResearchReportValidationError extends Error {}

export function parseResearchReport(input: unknown): ResearchReport {
  if (!Check(ResearchReportSchema, input)) {
    throw new ResearchReportValidationError('Research returned an invalid report.');
  }
  validateReportMeaning(input);
  return input;
}

function validateReportMeaning(input: ResearchReport): void {
  if (input.status === 'complete' && input.questions.some((question) => question.blocking)) {
    throw new ResearchReportValidationError('A complete report cannot have a blocking question.');
  }
  if (input.findings.some((finding) => finding.references.some((reference) => !reference.path && !reference.url))) {
    throw new ResearchReportValidationError('Every reference needs a file path or URL.');
  }
}
