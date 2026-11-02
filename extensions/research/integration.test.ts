import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createResearchAgent } from './agent.ts';
import { CONTEXT_FINALIZATION } from './context.ts';
import { createResearchEvidence, verifyResearchEvidence } from './evidence.ts';
import { executeResearch } from './execute.ts';
import { assessResearchReport } from './reconcile.ts';
import { runResearch } from './workflow.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

const request = {
  question: 'What value does the module export?',
  intendedChange: 'Use the exported value.',
  knownContext: 'The value is in a local module.',
  scope: 'Only the local module.',
  depth: 'focused',
} as const;

test('finishes with a partial report when the model context is nearly full', async () => {
  let calls = 0;
  const registry = {
    streamSimple: (_model: unknown, context: { messages: Array<{ role: string; content?: unknown }> }) => {
      calls += 1;
      if (calls === 2) {
        assert.ok(context.messages.some((message) => message.role === 'user' && message.content === CONTEXT_FINALIZATION));
      }
      const report = { status: 'complete', conclusion: 'Investigation finished.', findings: [], questions: [], verification: [], termination: 'Finished.' };
      const content = calls === 1
        ? [{ type: 'toolCall', id: 'list-1', name: 'research_list', arguments: { path: '.' } }]
        : [{ type: 'text', text: JSON.stringify(report) }];
      const message = {
        role: 'assistant', content, api: 'test', provider: 'test', model: 'test',
        usage: { input: 90_000, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 90_100, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: calls === 1 ? 'toolUse' : 'stop', timestamp: Date.now(),
      };
      return { async *[Symbol.asyncIterator]() { yield { type: 'done', message }; }, result: async () => message };
    },
  } as unknown as ExtensionContext['modelRegistry'];
  const model = { id: 'test', provider: 'test', api: 'test', contextWindow: 100_000 } as NonNullable<ExtensionContext['model']>;
  const agent = await createResearchAgent({ cwd: process.cwd(), model, modelRegistry: registry });
  const outcome = await runResearch({ agent, request, timeoutMs: 30_000 });
  assert.equal(calls, 2);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.report?.status, 'partial');
  assert.match(outcome.correction ?? '', /context limit/u);
});

test('reads a missed cited source before delivering the corrected report', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-correction-'));
  try {
    await writeFile(join(cwd, 'value.ts'), 'export const value = 42;\n');
    const report = {
      status: 'complete', conclusion: 'The value is 42.',
      findings: [{ claim: 'The value is 42.', evidence: 'export const value = 42;', status: 'observed', consequence: 'Use the value.', references: [{ path: 'value.ts' }] }],
      questions: [], verification: [], termination: 'Finished.',
    };
    let calls = 0;
    const registry = {
      streamSimple(_model: unknown, context: { messages: Array<{ role: string; content?: unknown }> }) {
        calls += 1;
        if (calls === 2) {
          assert.match(JSON.stringify(context.messages), /Read the cited project files/u);
        }
        const content = calls === 2
          ? [{ type: 'toolCall', id: 'read-missing', name: 'research_read', arguments: { path: 'value.ts' } }]
          : [{ type: 'text', text: JSON.stringify(report) }];
        const message = {
          role: 'assistant', content, api: 'test', provider: 'test', model: 'test',
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: calls === 2 ? 'toolUse' : 'stop', timestamp: Date.now(),
        };
        return { async *[Symbol.asyncIterator]() { yield { type: 'done', message }; }, result: async () => message };
      },
    } as unknown as ExtensionContext['modelRegistry'];
    const model = { id: 'test', provider: 'test', api: 'test', contextWindow: 100_000 } as NonNullable<ExtensionContext['model']>;
    const execution = await executeResearch({ ctx: { cwd, model, modelRegistry: registry, thinkingLevel: 'off' }, input: request });
    assert.equal(calls, 3);
    assert.equal(execution.outcome.runStatus, 'completed');
    assert.equal(execution.outcome.report.status, 'complete');
    assert.deepEqual(execution.outcome.issues, []);
    assert.equal(execution.outcome.files[0]?.path, 'value.ts');
    assert.equal(execution.usage?.totalTokens, 6);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('runs the Pi agent against a local fixture with a simulated provider', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-integration-'));
  try {
    await writeFile(join(cwd, 'value.ts'), 'export const value = 42;\n');
    const report = {
      status: 'complete',
      conclusion: 'The exported value is 42.',
      findings: [{
        claim: 'The module exports 42.',
        evidence: 'export const value = 42;',
        status: 'observed',
        consequence: 'The change can import value.',
        references: [{ path: 'value.ts', symbol: 'value' }],
      }],
      questions: [],
      verification: [],
      termination: 'The relevant file was read.',
    };
    let calls = 0;
    const sessionIds: Array<string | undefined> = [];
    const registry = {
      streamSimple: (_model: unknown, context: { messages: Array<{ role: string; content?: unknown }> }, options: { sessionId?: string }) => {
        calls += 1;
        sessionIds.push(options.sessionId);
        const content = calls === 1
          ? [{ type: 'toolCall', id: 'read-1', name: 'research_read', arguments: { path: 'value.ts' } }]
          : [{ type: 'text', text: JSON.stringify(report) }];
        if (calls === 2) {
          const evidence = context.messages.find((message) => message.role === 'toolResult');
          assert.match(JSON.stringify(evidence?.content), /export const value = 42/u);
        }
        const message = {
          role: 'assistant', content, api: 'test', provider: 'test', model: 'test',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: calls === 1 ? 'toolUse' : 'stop', timestamp: Date.now(),
        };
        return {
          async *[Symbol.asyncIterator]() { yield { type: 'done', message }; },
          result: async () => message,
        };
      },
    } as unknown as ExtensionContext['modelRegistry'];
    const model = { id: 'test', provider: 'test', api: 'test' } as NonNullable<ExtensionContext['model']>;
    const evidence = createResearchEvidence();
    const agent = await createResearchAgent({ cwd, model, modelRegistry: registry }, { onRead: evidence.observe });
    const outcome = await runResearch({ agent, request, timeoutMs: 30_000 });
    assert.equal(outcome.status, 'completed');
    assert.equal(outcome.toolCalls, 1);
    assert.deepEqual(outcome.report, report);
    assert.ok(outcome.report);
    assert.equal(calls, 2);
    assert.match(sessionIds[0] ?? '', /^[0-9a-f-]{36}$/u);
    assert.equal(sessionIds[1], sessionIds[0]);
    const otherAgent = await createResearchAgent({ cwd, model, modelRegistry: registry });
    assert.ok(otherAgent.sessionId);
    assert.notEqual(otherAgent.sessionId, sessionIds[0]);
    const snapshot = evidence.snapshot();
    assert.equal(snapshot.files[0]?.path, 'value.ts');
    assert.deepEqual(await verifyResearchEvidence({ cwd, files: snapshot.files }), [{ path: 'value.ts', status: 'unchanged' }]);
    await writeFile(join(cwd, 'value.ts'), 'export const value = 43;\n');
    const checks = await verifyResearchEvidence({ cwd, files: snapshot.files });
    assert.deepEqual(checks, [{ path: 'value.ts', status: 'changed' }]);
    const assessment = assessResearchReport({ report: outcome.report, evidence: snapshot, checks });
    assert.equal(assessment.report.status, 'partial');
    assert.equal(assessment.report.findings[0]?.status, 'pending');
    assert.equal(assessment.issues[0]?.reason, 'changed');
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
