import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { MAX_RESEARCH_OUTPUT_BYTES } from './limits.ts';
import { parseResearchReport, ResearchReportValidationError, type ResearchReport } from './model.ts';

export interface ParsedResearchReport {
  readonly report: ResearchReport;
  readonly correction?: string;
}

function hasBlockingQuestion(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || !('status' in value) || value.status !== 'complete' || !('questions' in value) || !Array.isArray(value.questions)) {
    return false;
  }
  return value.questions.some((question: unknown) => typeof question === 'object' && question !== null && 'blocking' in question && question.blocking === true);
}

function parseReportText(text: string, maxBytes: number): ParsedResearchReport {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new Error(`The research report exceeds the ${String(maxBytes)}-byte limit.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new Error('The research report is not valid JSON.', { cause });
    }
    throw cause;
  }
  if (hasBlockingQuestion(parsed)) {
    return {
      report: parseResearchReport({ ...parsed, status: 'partial' }),
      correction: 'The report was marked partial because it contains a blocking question.',
    };
  }
  return { report: parseResearchReport(parsed) };
}

export function readLatestPartialReport(messages: readonly AgentMessage[], maxBytes = MAX_RESEARCH_OUTPUT_BYTES): ResearchReport | undefined {
  for (const message of messages.toReversed()) {
    if (message.role !== 'assistant' || message.stopReason !== 'toolUse') {
      continue;
    }
    const text = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
    if (!text.trimStart().startsWith('{') || Buffer.byteLength(text, 'utf8') > maxBytes) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      if (error instanceof SyntaxError) {
        continue;
      }
      throw error;
    }
    try {
      const report = parseResearchReport(parsed);
      if (report.status === 'partial' || report.status === 'blocked') {
        return report;
      }
    } catch (error) {
      if (error instanceof ResearchReportValidationError) {
        continue;
      }
      throw error;
    }
  }
  return undefined;
}

export function readResearchReport(messages: readonly AgentMessage[], maxBytes = MAX_RESEARCH_OUTPUT_BYTES): ParsedResearchReport {
  const last = messages.findLast((message) => message.role === 'assistant');
  if (last?.role !== 'assistant' || last.stopReason !== 'stop') {
    throw new Error('Research did not finish with a report.');
  }
  const text = last.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
  return parseReportText(text, maxBytes);
}
