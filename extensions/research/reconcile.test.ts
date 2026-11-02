import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResearchReport } from './model.ts';
import { assessResearchReport, unreadResearchPaths } from './reconcile.ts';

const finding: ResearchReport['findings'][number] = {
  claim: 'The source handles input.',
  evidence: 'The handler validates it.',
  status: 'observed',
  consequence: 'Extend the validator.',
  references: [{ path: 'src/handler.ts', symbol: 'handle' }],
};

const report: ResearchReport = {
  status: 'complete',
  conclusion: 'The handler validates input.',
  findings: [finding],
  recommendation: 'Extend the existing validator.',
  questions: [],
  verification: ['Run the handler tests.'],
  termination: 'The question was answered.',
};

const file = { path: 'src/handler.ts', sha256: 'a'.repeat(64) };
const evidence = { files: [file], changedDuringResearch: [] };

test('finds distinct unread project paths without requesting outside paths or URLs', () => {
  const references = [{ path: './src/new.ts' }, { path: 'src/new.ts' }, { path: 'src/handler.ts' }, { path: '../outside.ts' }, { path: '/outside.ts' }, { url: 'https://example.com' }];
  assert.deepEqual(unreadResearchPaths({ ...report, findings: [{ ...finding, references }] }, evidence), ['src/new.ts']);
});

test('keeps a report whose local references were read and remain unchanged', () => {
  const assessment = assessResearchReport({ report, evidence, checks: [{ path: file.path, status: 'unchanged' }] });
  assert.deepEqual(assessment, { report, issues: [] });
});

test('keeps findings but removes the recommendation when a file was not read', () => {
  const assessment = assessResearchReport({ report, evidence: { files: [], changedDuringResearch: [] }, checks: [] });
  assert.equal(assessment.report.status, 'partial');
  assert.equal(assessment.report.findings[0]?.status, 'pending');
  assert.equal(assessment.report.findings[0]?.claim, finding.claim);
  assert.equal(assessment.report.recommendation, undefined);
  assert.match(assessment.report.conclusion, /could not be verified/u);
  assert.equal(assessment.unverifiedConclusion, report.conclusion);
  assert.deepEqual(assessment.issues, [{ findingIndex: 0, reference: file.path, reason: 'not_read' }]);
  assert.equal(report.recommendation, 'Extend the existing validator.');
});

test('distinguishes changed, missing and unverified sources', () => {
  const findings: ResearchReport['findings'] = [
    finding,
    { ...finding, references: [{ path: 'src/missing.ts' }] },
    { ...finding, references: [{ url: 'https://example.com/docs' }] },
  ];
  const assessment = assessResearchReport({
    report: { ...report, findings },
    evidence: { files: [file, { path: 'src/missing.ts', sha256: 'b'.repeat(64) }], changedDuringResearch: [file.path] },
    checks: [{ path: file.path, status: 'unchanged' }, { path: 'src/missing.ts', status: 'unavailable', error: 'missing' }],
  });
  assert.deepEqual(assessment.issues.map((issue) => issue.reason), ['changed', 'unavailable', 'web_unverified']);
  assert.ok(assessment.report.findings.every((item) => item.status === 'pending'));
});

test('marks local findings pending when Git history was used but its revision changed', () => {
  const assessment = assessResearchReport({ report, evidence, checks: [{ path: file.path, status: 'unchanged' }], revisionIssue: 'revision_changed' });
  assert.equal(assessment.report.status, 'partial');
  assert.equal(assessment.report.findings[0]?.status, 'pending');
  assert.equal(assessment.issues[0]?.reason, 'revision_changed');
});

test('does not retain a recommendation without any supporting finding', () => {
  const assessment = assessResearchReport({ report: { ...report, findings: [] }, evidence, checks: [] });
  assert.equal(assessment.report.status, 'partial');
  assert.equal(assessment.report.recommendation, undefined);
  assert.equal(assessment.issues[0]?.reason, 'no_support');
});

test('normalizes relative paths without accepting paths outside the project', () => {
  const checks = [{ path: file.path, status: 'unchanged' as const }];
  const good = { ...report, findings: [{ ...finding, references: [{ path: './src/handler.ts' }] }] };
  assert.equal(assessResearchReport({ report: good, evidence, checks }).issues.length, 0);
  const outside = { ...report, findings: [{ ...finding, references: [{ path: '../src/handler.ts' }] }] };
  assert.equal(assessResearchReport({ report: outside, evidence, checks }).issues[0]?.reason, 'not_read');
});

test('keeps cancelled and blocked states and treats a missing check as unavailable', () => {
  for (const status of ['cancelled', 'blocked'] as const) {
    const assessment = assessResearchReport({ report: { ...report, status }, evidence, checks: [] });
    assert.equal(assessment.report.status, status);
    assert.equal(assessment.issues[0]?.reason, 'unavailable');
  }
});
