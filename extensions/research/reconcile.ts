import { posix } from 'node:path';
import type { EvidenceCheck, ResearchEvidenceSnapshot } from './evidence.ts';
import type { ResearchReport } from './model.ts';

export interface ResearchEvidenceIssue {
  readonly findingIndex: number;
  readonly reference: string;
  readonly reason: 'not_read' | 'changed' | 'unavailable' | 'web_unverified' | 'no_support' | 'revision_changed' | 'revision_unavailable';
}

export interface AssessedResearchReport {
  readonly report: ResearchReport;
  readonly issues: readonly ResearchEvidenceIssue[];
  readonly unverifiedConclusion?: string;
}

interface AssessOptions {
  readonly report: ResearchReport;
  readonly evidence: ResearchEvidenceSnapshot;
  readonly checks: readonly EvidenceCheck[];
  readonly revisionIssue?: 'revision_changed' | 'revision_unavailable';
}

function localIssue(path: string, { evidence, checks, revisionIssue }: AssessOptions): ResearchEvidenceIssue['reason'] | undefined {
  const normalized = posix.normalize(path);
  if (posix.isAbsolute(path) || normalized === '..' || normalized.startsWith('../') || !evidence.files.some((file) => file.path === normalized)) {
    return 'not_read';
  }
  if (evidence.changedDuringResearch.includes(normalized)) {
    return 'changed';
  }
  const check = checks.find((entry) => entry.path === normalized);
  if (check === undefined || check.status === 'unavailable') {
    return 'unavailable';
  }
  return check.status === 'changed' ? 'changed' : revisionIssue;
}

export function unreadResearchPaths(report: ResearchReport, evidence: ResearchEvidenceSnapshot): string[] {
  const paths = new Set<string>();
  for (const finding of report.findings) {
    for (const reference of finding.references) {
      if (reference.path === undefined || posix.isAbsolute(reference.path)) {
        continue;
      }
      const path = posix.normalize(reference.path);
      if (path !== '..' && !path.startsWith('../') && !evidence.files.some((file) => file.path === path)) {
        paths.add(path);
      }
    }
  }
  return [...paths];
}

export function assessResearchReport(options: AssessOptions): AssessedResearchReport {
  const { report } = options;
  const issues: ResearchEvidenceIssue[] = [];
  const findings = report.findings.map((finding, findingIndex) => {
    let unresolved = false;
    for (const reference of finding.references) {
      if (reference.path !== undefined) {
        const reason = localIssue(reference.path, options);
        if (reason !== undefined) {
          issues.push({ findingIndex, reference: reference.path, reason });
          unresolved = true;
        }
      }
      if (reference.url !== undefined) {
        issues.push({ findingIndex, reference: reference.url, reason: 'web_unverified' });
        unresolved = true;
      }
    }
    return unresolved ? { ...finding, status: 'pending' as const } : finding;
  });
  if (issues.length === 0 && report.recommendation !== undefined && !findings.some((finding) => finding.status !== 'pending')) {
    issues.push({ findingIndex: -1, reference: 'recommendation', reason: 'no_support' });
  }
  if (issues.length === 0) {
    return { report, issues };
  }
  const { recommendation: _recommendation, ...withoutRecommendation } = report;
  return {
    report: {
      ...withoutRecommendation,
      status: report.status === 'cancelled' || report.status === 'blocked' ? report.status : 'partial',
      conclusion: 'Some evidence could not be verified. Review the affected findings before using the conclusion.',
      findings,
    },
    issues,
    unverifiedConclusion: report.conclusion,
  };
}
