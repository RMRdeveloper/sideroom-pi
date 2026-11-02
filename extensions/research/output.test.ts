import assert from 'node:assert/strict';
import test from 'node:test';
import { parseResearchResult } from './model.ts';
import { boundResearchOutcome, formatResearchOutcome } from './output.ts';

function outcome() {
  return parseResearchResult({
    request: { question: 'What changed?', intendedChange: 'Update source.', knownContext: 'A file exists.', scope: 'Only source.', depth: 'focused' },
    report: {
      status: 'complete', conclusion: 'The file works.',
      findings: [{ claim: 'The file works.', evidence: 'The file was read.', status: 'observed', consequence: 'Use it.', references: [{ path: 'src/main.ts' }] }],
      recommendation: 'Use the file.', questions: [], verification: [], termination: 'Finished.',
    },
    cwd: '/project', revision: null, revisionAtEnd: null, runStatus: 'completed', issues: [], limitations: [],
    changedDuringResearch: [], evidenceChecks: [], files: [],
    usage: { elapsedMs: 1, toolCalls: 1, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, totalTokens: null },
  });
}

test('leaves results that fit unchanged', () => {
  const original = outcome();
  assert.equal(boundResearchOutcome(original), original);
});

test('bounds metadata and reports every omission without losing retained findings', () => {
  const original = outcome();
  const files = Array.from({ length: 50 }, (_, index) => ({ path: `unused/${String(index)}/${'x'.repeat(200)}`, sha256: 'a'.repeat(64) }));
  files.push({ path: 'src/main.ts', sha256: 'b'.repeat(64) });
  const bounded = boundResearchOutcome({ ...original, files }, 5_000);
  assert.equal(bounded.report.status, 'partial');
  assert.equal(bounded.report.recommendation, undefined);
  assert.equal(bounded.unverifiedConclusion, original.report.conclusion);
  assert.equal(bounded.report.findings.length, 1);
  assert.deepEqual(bounded.files.map((file) => file.path), ['src/main.ts']);
  assert.match(bounded.limitations.at(-1) ?? '', /omitted 50 file fingerprints, 0 findings and 0 earlier limitations/u);
  assert.ok(Buffer.byteLength(formatResearchOutcome(bounded)) <= 5_000);
});

test('delivers a valid partial report when escaped questions exceed the default limit', () => {
  const original = outcome();
  const longText = '\u0001'.repeat(2_000);
  const oversized = parseResearchResult({
    ...original,
    report: { ...original.report, questions: Array.from({ length: 20 }, () => ({ question: longText, blocking: false })), verification: Array.from({ length: 20 }, () => longText) },
    limitations: Array.from({ length: 20 }, () => 'Previous limitation.'),
  });
  const bounded = boundResearchOutcome(oversized);
  assert.equal(bounded.report.status, 'partial');
  assert.deepEqual(bounded.report.questions, []);
  assert.match(bounded.limitations.join(' '), /Questions and verification were omitted/u);
  assert.equal(bounded.report.findings.length, 1);
  assert.deepEqual(bounded.request, original.request);
  assert.ok(Buffer.byteLength(formatResearchOutcome(bounded), 'utf8') <= 256_000);
  assert.deepEqual(parseResearchResult(bounded), bounded);
});

test('reports when request text must also be omitted for a smaller limit', () => {
  const original = outcome();
  const oversized = { ...original, request: { ...original.request, scope: '\u0001'.repeat(8_000) } };
  const bounded = boundResearchOutcome(oversized, 5_000);
  assert.equal(bounded.request.scope, 'Omitted for size.');
  assert.match(bounded.limitations.join(' '), /request text was omitted/u);
  assert.ok(Buffer.byteLength(formatResearchOutcome(bounded), 'utf8') <= 5_000);
  assert.throws(() => boundResearchOutcome(oversized, 1), /cannot fit/u);
});
