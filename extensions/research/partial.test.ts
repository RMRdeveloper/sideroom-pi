import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { buildPartialReport } from './partial.ts';
import { parseResearchReport } from './model.ts';

function readMessages(path: string, text: string, isError = false): AgentMessage[] {
  return [
    { role: 'assistant', content: [{ type: 'toolCall', id: 'read', name: 'research_read', arguments: { path } }] } as unknown as AgentMessage,
    { role: 'toolResult', toolCallId: 'read', toolName: 'research_read', isError, content: [{ type: 'text', text }] } as AgentMessage,
  ];
}

test('retains bounded excerpts from successful reads and marks the answer incomplete', () => {
  const report = buildPartialReport(readMessages('src/file.ts', 'x'.repeat(600)), false);
  assert.equal(report.status, 'partial');
  assert.equal(report.findings[0]?.status, 'observed');
  assert.match(report.findings[0]?.references[0]?.excerpt ?? '', /excerpt shortened/u);
  assert.equal(report.questions[0]?.blocking, true);
  assert.deepEqual(parseResearchReport(report), report);
});

test('retains matching search lines and Git excerpts without inventing negative results', () => {
  const messages = [
    { role: 'assistant', content: [
      { type: 'toolCall', id: 'search', name: 'research_search', arguments: { paths: ['found.ts', 'empty.ts'], text: 'match' } },
      { type: 'toolCall', id: 'git', name: 'research_git', arguments: { operation: 'diff', path: 'changed.ts' } },
    ] },
    { role: 'toolResult', toolCallId: 'search', toolName: 'research_search', isError: false, content: [{ type: 'text', text: '"found.ts": 1: match\nSearch covers only the first 200 lines.' }] },
    { role: 'toolResult', toolCallId: 'git', toolName: 'research_git', isError: false, content: [{ type: 'text', text: 'Current file excerpt:\n1: value\nGit diff:\n+value' }] },
  ] as unknown as AgentMessage[];
  const report = buildPartialReport(messages, false);
  assert.deepEqual(report.findings.map((finding) => finding.references[0]?.path), ['found.ts', 'changed.ts']);
  assert.match(report.findings[0]?.references[0]?.excerpt ?? '', /match/u);
  assert.match(report.findings[1]?.references[0]?.excerpt ?? '', /Git diff/u);
});

test('does not invent evidence for errors or malformed tool calls', () => {
  const malformed = [{ role: 'assistant', content: [{ type: 'toolCall', id: 'bad', name: 'research_read', arguments: null }] }] as unknown as AgentMessage[];
  const report = buildPartialReport([...malformed, ...readMessages('src/file.ts', 'failed', true)], true);
  assert.equal(report.status, 'cancelled');
  assert.deepEqual(report.findings, []);
});

test('reports when a long path or excess results are omitted', () => {
  const messages = Array.from({ length: 11 }, (_, index) => readMessages(`file${String(index)}.ts`, 'contents')).flat();
  messages.push(...readMessages('a'.repeat(513), 'contents'));
  const report = buildPartialReport(messages, false);
  assert.equal(report.findings.length, 10);
  assert.match(report.termination, /2 read results were not included/u);
});
