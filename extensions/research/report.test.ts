import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { readLatestPartialReport, readResearchReport } from './report.ts';

const report = {
  status: 'partial',
  conclusion: 'More evidence is needed.',
  findings: [],
  questions: [{ question: 'Which version?', blocking: true }],
  verification: [],
  termination: 'The version is unknown.',
};

function assistant(text: string, stopReason = 'stop'): AgentMessage {
  return { role: 'assistant', stopReason, content: [{ type: 'text', text }] } as AgentMessage;
}

test('reads a valid report from the last completed answer', () => {
  assert.deepEqual(readResearchReport([assistant('old'), assistant(JSON.stringify(report))]), { report });
});

test('accepts a valid report larger than the previous generated-output limit', () => {
  const finding = { claim: 'x'.repeat(1_500), evidence: 'y'.repeat(1_500), status: 'observed', consequence: 'z'.repeat(1_500), references: [{ path: 'source.ts' }] };
  const largeReport = { ...report, findings: Array.from({ length: 20 }, () => finding) };
  const text = JSON.stringify(largeReport);
  assert.ok(Buffer.byteLength(text, 'utf8') > 64_000);
  assert.deepEqual(readResearchReport([assistant(text)]), { report: largeReport });
  assert.deepEqual(readLatestPartialReport([assistant(text, 'toolUse')]), largeReport);
});

test('recovers the latest valid partial report before a tool call', () => {
  const newer = { ...report, conclusion: 'A later finding.' };
  assert.deepEqual(readLatestPartialReport([
    assistant(JSON.stringify(report), 'toolUse'),
    assistant(JSON.stringify(newer), 'toolUse'),
    assistant('{invalid', 'toolUse'),
  ]), newer);
  assert.equal(readLatestPartialReport([assistant(JSON.stringify({ ...report, status: 'complete', questions: [] }), 'toolUse')]), undefined);
  assert.equal(readLatestPartialReport([assistant('ordinary text', 'toolUse')]), undefined);
});

test('rejects missing, interrupted, malformed and oversized reports', () => {
  assert.throws(() => readResearchReport([]), /did not finish/u);
  assert.throws(() => readResearchReport([assistant('{}', 'length')]), /did not finish/u);
  assert.throws(() => readResearchReport([assistant('not JSON')]), /not valid JSON/u);
  assert.throws(() => readResearchReport([assistant('x'.repeat(256_001))]), /256000-byte/u);
  assert.throws(() => readResearchReport([assistant('{}')]), /invalid report/u);
});

test('marks a report partial when its blocking question contradicts a complete status', () => {
  const parsed = readResearchReport([assistant(JSON.stringify({ ...report, status: 'complete' }))]);
  assert.equal(parsed.report.status, 'partial');
  assert.match(parsed.correction ?? '', /blocking question/u);
});
