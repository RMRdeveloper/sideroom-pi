import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core';
import { runResearch } from './workflow.ts';

const request = {
  question: 'Where is input checked?',
  intendedChange: 'Add a field.',
  knownContext: 'The caller uses a schema.',
  scope: 'The request path.',
  depth: 'focused',
} as const;

type ResearchAgent = Parameters<typeof runResearch>[0]['agent'];

type EventListener = (event: AgentEvent) => void;

function fakeAgent() {
  const messages: AgentMessage[] = [];
  let listener: EventListener | undefined;
  let complete: (() => void) | undefined;
  let aborts = 0;
  let unsubscribes = 0;
  const agent = {
    state: { messages, errorMessage: undefined as string | undefined },
    subscribe(next: EventListener) {
      listener = next;
      return () => { listener = undefined; unsubscribes += 1; };
    },
    prompt: async (text: string) => {
      assert.deepEqual(JSON.parse(text), request);
      await new Promise<void>((resolve) => { complete = resolve; });
    },
    abort() {
      aborts += 1;
      complete?.();
    },
  };
  return {
    agent: agent as unknown as ResearchAgent,
    state: agent.state,
    finish: () => complete?.(),
    emit: (event: AgentEvent) => listener?.(event),
    aborts: () => aborts,
    unsubscribes: () => unsubscribes,
  };
}

test('returns the validated report and counts tool calls', async () => {
  const fake = fakeAgent();
  const report = { status: 'partial', conclusion: 'Evidence is incomplete.', findings: [], questions: [], verification: [], termination: 'No further evidence.' };
  const pending = runResearch({ agent: fake.agent, request });
  fake.state.messages.push({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(report) }] } as AgentMessage);
  fake.emit({ type: 'tool_execution_start', toolCallId: '1', toolName: 'research_read', args: {} });
  fake.finish();
  const outcome = await pending;
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.toolCalls, 1);
  assert.deepEqual(outcome.report, report);
  assert.equal(fake.unsubscribes(), 1);
});

test('counts Git evidence only when the Git call succeeded', async () => {
  for (const isError of [true, false]) {
    const fake = fakeAgent();
    const pending = runResearch({ agent: fake.agent, request });
    fake.emit({ type: 'tool_execution_end', toolCallId: '1', toolName: 'research_git', result: {}, isError });
    fake.finish();
    const outcome = await pending;
    assert.equal(outcome.usedGit, !isError);
  }
});

test('cancels the agent and retains messages already gathered', async () => {
  const fake = fakeAgent();
  const controller = new AbortController();
  const message = { role: 'user', content: 'evidence', timestamp: 1 } as AgentMessage;
  fake.state.messages.push(message);
  const pending = runResearch({ agent: fake.agent, request, signal: controller.signal });
  controller.abort();
  const outcome = await pending;
  assert.equal(outcome.status, 'cancelled');
  assert.deepEqual(outcome.messages, [message]);
  assert.equal(fake.aborts(), 1);
  assert.equal(fake.unsubscribes(), 1);
});

test('recovers a partial report when the caller cancels', async () => {
  const fake = fakeAgent();
  const controller = new AbortController();
  const report = { status: 'partial', conclusion: 'A file was read.', findings: [], questions: [], verification: [], termination: 'More work is needed.' };
  const pending = runResearch({ agent: fake.agent, request, signal: controller.signal });
  fake.state.messages.push({ role: 'assistant', stopReason: 'toolUse', content: [{ type: 'text', text: JSON.stringify(report) }] } as AgentMessage);
  controller.abort();
  const outcome = await pending;
  assert.equal(outcome.status, 'cancelled');
  assert.deepEqual(outcome.report, { ...report, status: 'cancelled' });
});

test('stops generated output that exceeds its byte limit', async () => {
  const fake = fakeAgent();
  const pending = runResearch({ agent: fake.agent, request, maxOutputBytes: 1_024 });
  fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x'.repeat(1_025) } } as AgentEvent);
  const outcome = await pending;
  assert.equal(outcome.status, 'output_limit');
  assert.equal(fake.aborts(), 1);
});

test('allows the new default byte limit and stops when UTF-8 output exceeds it', async () => {
  const fake = fakeAgent();
  const pending = runResearch({ agent: fake.agent, request });
  fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'é'.repeat(128_000) } } as AgentEvent);
  assert.equal(fake.aborts(), 0);
  fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } } as AgentEvent);
  const outcome = await pending;
  assert.equal(outcome.status, 'output_limit');
  assert.equal(fake.aborts(), 1);
});

test('stops at the time limit and reports the cause', async () => {
  const fake = fakeAgent();
  const outcome = await runResearch({ agent: fake.agent, request, timeoutMs: 10 });
  assert.equal(outcome.status, 'timed_out');
  assert.equal(fake.aborts(), 1);
  assert.equal(fake.unsubscribes(), 1);
});

test('does not start when already cancelled and validates the time limit', async () => {
  const fake = fakeAgent();
  const controller = new AbortController();
  controller.abort();
  assert.equal((await runResearch({ agent: fake.agent, request, signal: controller.signal })).status, 'cancelled');
  assert.equal(fake.aborts(), 0);
  assert.equal(fake.unsubscribes(), 0);
  for (const timeoutMs of [0, -1, 120_001, Number.NaN]) {
    await assert.rejects(runResearch({ agent: fake.agent, request, timeoutMs }), /between 1 and 120000/u);
  }
  await assert.rejects(runResearch({ agent: fake.agent, request, maxOutputBytes: 256_001 }), /between 1024 and 256000/u);
});

test('fails when the agent finishes without a valid report', async () => {
  const fake = fakeAgent();
  const pending = runResearch({ agent: fake.agent, request });
  fake.state.messages.push({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: 'Not JSON' }] } as AgentMessage);
  fake.finish();
  const outcome = await pending;
  assert.equal(outcome.status, 'failed');
  assert.match(outcome.error ?? '', /not valid JSON/u);
  assert.equal(outcome.report?.status, 'partial');
  assert.equal(outcome.report?.questions[0]?.blocking, true);
});

test('reports a rejected prompt and releases the subscription', async () => {
  const fake = fakeAgent();
  const agent = {
    ...fake.agent,
    prompt: async () => { throw new Error('Provider rejected the request'); },
  } as ResearchAgent;
  const outcome = await runResearch({ agent, request });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.error, 'Provider rejected the request');
  assert.equal(fake.unsubscribes(), 1);
});

test('does not report an aborted or failed provider response as complete', async () => {
  for (const stopReason of ['error', 'aborted']) {
    const fake = fakeAgent();
    const pending = runResearch({ agent: fake.agent, request });
    fake.state.messages.push({ role: 'assistant', stopReason, content: [] } as unknown as AgentMessage);
    fake.finish();
    const outcome = await pending;
    assert.equal(outcome.status, 'failed');
    assert.equal(outcome.error, 'The research agent stopped without a result.');
  }
});

test('requests one correction for unread sources and keeps the same counters', async () => {
  const messages: AgentMessage[] = [];
  const report = { status: 'complete', conclusion: 'A source is cited.', findings: [], questions: [], verification: [], termination: 'Finished.' };
  let prompts = 0;
  let listener: EventListener | undefined;
  const agent = {
    state: { messages, errorMessage: undefined },
    subscribe(next: EventListener) { listener = next; return () => { listener = undefined; }; },
    abort() {},
    async prompt(text: string) {
      prompts += 1;
      if (prompts === 2) {
        assert.match(text, /source\.ts/u);
        listener?.({ type: 'tool_execution_start', toolCallId: 'read', toolName: 'research_read', args: {} });
      }
      messages.push({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(report) }] } as AgentMessage);
    },
  } as ResearchAgent;
  const outcome = await runResearch({ agent, request, unreadPaths: () => ['source.ts'] });
  assert.equal(prompts, 2);
  assert.equal(outcome.toolCalls, 1);
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.report, report);
});

test('keeps the first report if the correction exceeds the output limit', async () => {
  const messages: AgentMessage[] = [];
  const report = { status: 'complete', conclusion: 'First report.', findings: [], questions: [], verification: [], termination: 'Finished.' };
  let listener: EventListener | undefined;
  let prompts = 0;
  const agent = {
    state: { messages, errorMessage: undefined },
    subscribe(next: EventListener) { listener = next; return () => { listener = undefined; }; },
    abort() {},
    async prompt() {
      prompts += 1;
      if (prompts === 2) {
        listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x'.repeat(1_025) } } as AgentEvent);
        return;
      }
      messages.push({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(report) }] } as AgentMessage);
    },
  } as unknown as ResearchAgent;
  const outcome = await runResearch({ agent, request, maxOutputBytes: 1_024, unreadPaths: () => ['source.ts'] });
  assert.equal(outcome.status, 'output_limit');
  assert.equal(outcome.report?.conclusion, 'First report.');
  assert.equal(outcome.report?.status, 'partial');
});

test('retains the first report if the correction fails or is cancelled', async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    const messages: AgentMessage[] = [];
    const report = { status: 'complete', conclusion: 'First report.', findings: [], questions: [], verification: [], termination: 'Finished.' };
    let prompts = 0;
    const agent = {
      state: { messages, errorMessage: undefined },
      subscribe() { return () => {}; },
      abort() {},
      async prompt() {
        prompts += 1;
        if (prompts === 2) {
          if (cancel) {
            controller.abort();
            return;
          }
          throw new Error('Correction failed');
        }
        messages.push({ role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: JSON.stringify(report) }] } as AgentMessage);
      },
    } as unknown as ResearchAgent;
    const outcome = await runResearch({ agent, request, signal: controller.signal, unreadPaths: () => ['source.ts'] });
    assert.equal(prompts, 2);
    assert.equal(outcome.status, cancel ? 'cancelled' : 'failed');
    assert.equal(outcome.report?.conclusion, 'First report.');
    assert.equal(outcome.report?.status, cancel ? 'cancelled' : 'partial');
  }
});

test('reports an agent error without calling it complete', async () => {
  const fake = fakeAgent();
  const pending = runResearch({ agent: fake.agent, request });
  fake.state.errorMessage = 'Provider unavailable';
  fake.finish();
  const outcome = await pending;
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.error, 'Provider unavailable');
  assert.equal(fake.unsubscribes(), 1);
});
