import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { executeResearch } from './execute.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

const request = {
  question: 'What does the module export?', intendedChange: 'Use the value.',
  knownContext: 'The value is in a local file.', scope: 'Only the file.', depth: 'focused',
} as const;
const model = { id: 'test', provider: 'test', api: 'test' } as NonNullable<ExtensionContext['model']>;

function registryFor(cwd: string, change: boolean): ExtensionContext['modelRegistry'] {
  let calls = 0;
  return {
    streamSimple() {
      calls += 1;
      const report = {
        status: 'complete', conclusion: 'The value is 42.',
        findings: [{ claim: 'The value is 42.', evidence: 'The file exports 42.', status: 'observed', consequence: 'Use the export.', references: [{ path: 'value.ts' }] }],
        recommendation: 'Use the export.', questions: [], verification: [], termination: 'The file was read.',
      };
      if (calls === 2 && change) {
        writeFileSync(join(cwd, 'value.ts'), 'export const value = 43;\n');
      }
      const content = calls === 1
        ? [{ type: 'toolCall', id: '1', name: 'research_read', arguments: { path: 'value.ts' } }]
        : [{ type: 'text', text: JSON.stringify(report) }];
      const message = {
        role: 'assistant', content, api: 'test', provider: 'test', model: 'test',
        usage: { input: 10, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 12, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: calls === 1 ? 'toolUse' : 'stop', timestamp: Date.now(),
      };
      return { async *[Symbol.asyncIterator]() { yield { type: 'done', message }; }, result: async () => message };
    },
  } as unknown as ExtensionContext['modelRegistry'];
}

test('automatically attaches evidence, usage and revision limitations', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-execute-'));
  try {
    await writeFile(join(cwd, 'value.ts'), 'export const value = 42;\n');
    const execution = await executeResearch({ ctx: { cwd, model, modelRegistry: registryFor(cwd, false) }, input: request, environment: {} });
    assert.equal(execution.outcome.report.status, 'complete');
    assert.equal(execution.outcome.runStatus, 'completed');
    assert.equal(execution.outcome.files[0]?.path, 'value.ts');
    assert.deepEqual(execution.outcome.evidenceChecks, [{ path: 'value.ts', status: 'unchanged' }]);
    assert.equal(execution.outcome.usage.inputTokens, 20);
    assert.equal(execution.usage?.output, 4);
    assert.equal(execution.outcome.revision, null);
    assert.ok(execution.outcome.limitations.some((item) => item.includes('Git revision unavailable')));
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('returns the report as partial if a read file changes before verification', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-execute-'));
  try {
    await writeFile(join(cwd, 'value.ts'), 'export const value = 42;\n');
    const execution = await executeResearch({ ctx: { cwd, model, modelRegistry: registryFor(cwd, true) }, input: request, environment: {} });
    assert.equal(execution.outcome.report.status, 'partial');
    assert.equal(execution.outcome.report.findings[0]?.status, 'pending');
    assert.equal(execution.outcome.report.recommendation, undefined);
    assert.equal(execution.outcome.issues[0]?.reason, 'changed');
    assert.equal(execution.outcome.unverifiedConclusion, 'The value is 42.');
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('marks findings pending if the commit changes after Git history was read', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-head-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    await writeFile(join(cwd, 'value.ts'), 'export const value = 42;\n');
    execFileSync('git', ['add', 'value.ts'], { cwd });
    const commit = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q'];
    execFileSync('git', [...commit, '-m', 'first'], { cwd });
    let calls = 0;
    const modelRegistry = {
      streamSimple() {
        calls += 1;
        if (calls === 2) {
          execFileSync('git', [...commit, '--allow-empty', '-m', 'second'], { cwd });
        }
        const report = { status: 'complete', conclusion: 'The value was recorded.', findings: [{ claim: 'The value is 42.', evidence: 'The file exports 42.', status: 'observed', consequence: 'Use the value.', references: [{ path: 'value.ts' }] }], questions: [], verification: [], termination: 'Finished.' };
        const content = calls === 1
          ? [{ type: 'toolCall', id: 'git', name: 'research_git', arguments: { operation: 'history', path: 'value.ts' } }]
          : [{ type: 'text', text: JSON.stringify(report) }];
        const message = { role: 'assistant', content, api: 'test', provider: 'test', model: 'test', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: calls === 1 ? 'toolUse' : 'stop', timestamp: Date.now() };
        return { async *[Symbol.asyncIterator]() { yield { type: 'done', message }; }, result: async () => message };
      },
    } as unknown as ExtensionContext['modelRegistry'];
    const execution = await executeResearch({ ctx: { cwd, model, modelRegistry }, input: request, environment: {} });
    assert.notEqual(execution.outcome.revision, execution.outcome.revisionAtEnd);
    assert.equal(execution.outcome.report.status, 'partial');
    assert.equal(execution.outcome.issues[0]?.reason, 'revision_changed');
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('returns a cancelled result without contacting the provider', async () => {
  const controller = new AbortController();
  controller.abort();
  const execution = await executeResearch({ ctx: { cwd: process.cwd(), model, modelRegistry: registryFor(process.cwd(), false) }, input: request, signal: controller.signal, environment: {} });
  assert.equal(execution.outcome.runStatus, 'cancelled');
  assert.equal(execution.outcome.report.status, 'cancelled');
  assert.equal(execution.outcome.usage.inputTokens, null);
});
