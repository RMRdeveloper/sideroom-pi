import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResearchReport, parseResearchRequest, parseResearchResult } from './model.ts';

const request = {
  question: 'How is the input validated?',
  intendedChange: 'Add another input.',
  knownContext: 'The caller uses a schema.',
  scope: 'Only the request path.',
  depth: 'focused',
};

const report = {
  status: 'complete',
  conclusion: 'The schema validates the input.',
  findings: [{
    claim: 'The caller checks the schema.',
    evidence: 'The call to Check precedes use.',
    status: 'observed',
    consequence: 'Add the field to the schema.',
    references: [{ path: 'src/model.ts', symbol: 'parse', excerpt: 'Check(schema, input)' }],
  }],
  questions: [],
  verification: ['Run the existing model test.'],
  termination: 'The question was answered.',
};

test('requires every part of the research request', () => {
  assert.deepEqual(parseResearchRequest(request), request);
  assert.throws(() => parseResearchRequest({ ...request, scope: '' }), /question, intended change/u);
  assert.throws(() => parseResearchRequest({ ...request, depth: 'unlimited' }), /question, intended change/u);
  assert.throws(() => parseResearchRequest({ ...request, extra: true }), /question, intended change/u);
});

test('validates the revision, file fingerprints and available usage', () => {
  const outcome = {
    request,
    report,
    cwd: '/project',
    revision: null,
    revisionAtEnd: null,
    runStatus: 'completed',
    issues: [],
    limitations: [],
    changedDuringResearch: [],
    evidenceChecks: [],
    files: [{ path: 'src/model.ts', sha256: 'a'.repeat(64) }],
    usage: { elapsedMs: 100, toolCalls: 3, inputTokens: null, outputTokens: 200, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null },
  };
  assert.deepEqual(parseResearchResult(outcome), outcome);
  assert.throws(() => parseResearchResult({ ...outcome, files: [{ path: 'src/model.ts', sha256: 'invalid' }] }), /invalid result/u);
  assert.throws(() => parseResearchResult({ ...outcome, usage: { ...outcome.usage, elapsedMs: -1 } }), /invalid result/u);
  assert.throws(() => parseResearchResult({ ...outcome, runStatus: 'timed_out' }), /cannot have a complete report/u);
  assert.throws(() => parseResearchResult({ ...outcome, report: { ...report, questions: [{ question: 'Which?', blocking: true }] } }), /blocking question/u);
});

test('validates findings, references and blocking questions', () => {
  assert.deepEqual(parseResearchReport(report), report);
  assert.throws(() => parseResearchReport({ ...report, status: 'complete', questions: [{ question: 'Which API?', blocking: true }] }), /blocking question/u);
  assert.throws(() => parseResearchReport({ ...report, findings: [{ ...report.findings[0], references: [{ symbol: 'parse' }] }] }), /file path or URL/u);
  assert.throws(() => parseResearchReport({ ...report, findings: [{ ...report.findings[0], status: 'certain' }] }), /invalid report/u);
  assert.doesNotThrow(() => parseResearchReport({ ...report, status: 'blocked', questions: [{ question: 'Which API?', blocking: true }] }));
});
