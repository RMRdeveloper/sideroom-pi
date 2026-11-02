import { posix } from 'node:path';
import { parseResearchResult, type ResearchResult } from './model.ts';

export const MAX_RESULT_BYTES = 256_000;

export function formatResearchOutcome(outcome: ResearchResult): string {
  return JSON.stringify(outcome, null, 2);
}

function outputBytes(outcome: ResearchResult): number {
  return Buffer.byteLength(formatResearchOutcome(outcome), 'utf8');
}

function referencedPaths(outcome: ResearchResult): Set<string> {
  const paths = new Set<string>();
  for (const finding of outcome.report.findings) {
    for (const reference of finding.references) {
      if (reference.path !== undefined) {
        paths.add(posix.normalize(reference.path));
      }
    }
  }
  return paths;
}

function compactResearchOutcome(outcome: ResearchResult): ResearchResult {
  const { unverifiedConclusion: _unverifiedConclusion, ...rest } = outcome;
  return {
    ...rest,
    report: {
      status: outcome.report.status === 'cancelled' || outcome.report.status === 'blocked' ? outcome.report.status : 'partial',
      conclusion: 'The result exceeded its size limit. The report and evidence were omitted; repeat the research with a narrower scope.',
      findings: [],
      questions: [],
      verification: [],
      termination: 'The result exceeded its size limit.',
    },
    issues: [],
    limitations: ['Result size limit: findings, evidence, questions, verification and previous limitations were omitted.'],
    changedDuringResearch: [],
    evidenceChecks: [],
    files: [],
  };
}

export function boundResearchOutcome(outcome: ResearchResult, maxBytes = MAX_RESULT_BYTES): ResearchResult {
  if (outputBytes(outcome) <= maxBytes) {
    return outcome;
  }
  const originalFiles = outcome.files.length;
  const originalFindings = outcome.report.findings.length;
  const { recommendation: _recommendation, ...report } = outcome.report;
  let omittedContext = false;
  let bounded: ResearchResult = {
    ...outcome,
    unverifiedConclusion: outcome.unverifiedConclusion ?? outcome.report.conclusion,
    report: {
      ...report,
      status: report.status === 'cancelled' || report.status === 'blocked' ? report.status : 'partial',
      conclusion: 'The result exceeded its size limit. Review the retained findings before using the original conclusion.',
    },
  };
  while (true) {
    const referenced = referencedPaths(bounded);
    const files = bounded.files.filter((file) => referenced.has(file.path));
    const evidenceChecks = bounded.evidenceChecks.filter((check) => referenced.has(check.path));
    const changedDuringResearch = bounded.changedDuringResearch.filter((path) => referenced.has(path));
    const omittedFiles = originalFiles - files.length;
    const omittedFindings = originalFindings - bounded.report.findings.length;
    const omittedLimitations = Math.max(0, outcome.limitations.length - 19);
    const omittedDetails = omittedContext ? ' Questions and verification were omitted.' : '';
    const limitation = `Result size limit: omitted ${String(omittedFiles)} file fingerprints, ${String(omittedFindings)} findings and ${String(omittedLimitations)} earlier limitations.${omittedDetails} Recheck omitted evidence.`;
    bounded = {
      ...bounded,
      files,
      evidenceChecks,
      changedDuringResearch,
      limitations: [...outcome.limitations.slice(0, 19), limitation],
    };
    if (outputBytes(bounded) <= maxBytes) {
      return parseResearchResult(bounded);
    }
    if (!omittedContext && (bounded.report.questions.length > 0 || bounded.report.verification.length > 0)) {
      omittedContext = true;
      bounded = { ...bounded, report: { ...bounded.report, questions: [], verification: [] } };
      continue;
    }
    if (bounded.report.findings.length === 0) {
      const compact = compactResearchOutcome(outcome);
      if (outputBytes(compact) <= maxBytes) {
        return parseResearchResult(compact);
      }
      const omittedRequest: ResearchResult = {
        ...compact,
        request: { ...compact.request, question: 'Omitted for size.', intendedChange: 'Omitted for size.', knownContext: 'Omitted for size.', scope: 'Omitted for size.' },
        limitations: [...compact.limitations, 'Result size limit: the request text was omitted.'],
      };
      if (outputBytes(omittedRequest) <= maxBytes) {
        return parseResearchResult(omittedRequest);
      }
      throw new Error('The research result cannot fit the output limit even after omitting the report and request.');
    }
    const remaining = bounded.report.findings.length - 1;
    bounded = {
      ...bounded,
      report: { ...bounded.report, findings: bounded.report.findings.slice(0, remaining) },
      issues: bounded.issues.filter((issue) => issue.findingIndex < remaining),
    };
  }
}
