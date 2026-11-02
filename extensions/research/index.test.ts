import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI, ExtensionToolContext, ToolDefinition } from '@earendil-works/pi-coding-agent';
import registerResearch, { RESEARCH_TOOL_NAME } from './index.ts';
import { ResearchRequestSchema } from './model.ts';

const request = {
  question: 'What is the behavior?', intendedChange: 'Change the behavior.',
  knownContext: 'No prior findings.', scope: 'Only this project.', depth: 'focused',
} as const;

type Notice = { customType: string; display: boolean; content: string; details: { id: string; outcome?: { runStatus: string; usage: { totalTokens: number | null } } } };

function harness(autoAcknowledge = true) {
  const tools: Array<ToolDefinition<typeof ResearchRequestSchema>> = [];
  const handlers = new Map<string, (event?: never) => void>();
  const notices: Array<{ message: Notice; options: unknown }> = [];
  let notify: (() => void) | undefined;
  let attempted: (() => void) | undefined;
  const deliveryAttempt = new Promise<void>((resolve) => { attempted = resolve; });
  let failDelivery = false;
  registerResearch({
    on: (name: string, handler: (event?: never) => void) => { handlers.set(name, handler); },
    registerTool: (tool: unknown) => { tools.push(tool as ToolDefinition<typeof ResearchRequestSchema>); },
    sendMessage: (message: Notice, options: unknown) => {
      attempted?.();
      if (failDelivery) {
        throw new Error('Delivery unavailable');
      }
      notices.push({ message, options });
      if (autoAcknowledge) {
        queueMicrotask(() => handlers.get('message_end')?.({ message: { ...message, role: 'custom' } } as never));
      }
      notify?.();
    },
  } as unknown as ExtensionAPI);
  const tool = tools[0];
  assert.ok(tool);
  return {
    tool, handlers, notices, deliveryAttempt,
    waitForNotice: () => notices.length > 0 ? Promise.resolve() : new Promise<void>((resolve) => { notify = resolve; }),
    setDeliveryFailure: (value: boolean) => { failDelivery = value; },
  };
}

function provider() {
  let release: (() => void) | undefined;
  let started: (() => void) | undefined;
  let providerSignal: AbortSignal | undefined;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const report = { status: 'partial', conclusion: 'More evidence is needed.', findings: [], questions: [], verification: [], termination: 'No further evidence.' };
  const registry = {
    streamSimple(_model: unknown, _context: unknown, options: { signal: AbortSignal }) {
      providerSignal = options.signal;
      const message = {
        role: 'assistant', content: [{ type: 'text', text: JSON.stringify(report) }], api: 'test', provider: 'test', model: 'test',
        usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop', timestamp: Date.now(),
      };
      return {
        async *[Symbol.asyncIterator]() {
          started?.();
          await wait;
          yield { type: 'done', message };
        },
        result: async () => message,
      };
    },
  };
  return { registry, ready, release: () => release?.(), signal: () => providerSignal };
}

function context(cwd: string, registry: unknown): ExtensionToolContext {
  return { cwd, isIdle: () => true, isProjectTrusted: () => true, model: { id: 'test', provider: 'test', api: 'test' }, modelRegistry: registry } as unknown as ExtensionToolContext;
}

test('registers the background tool and renders its acknowledgement', () => {
  const { tool } = harness();
  assert.equal(RESEARCH_TOOL_NAME, 'sideroom_research');
  assert.equal(tool.name, RESEARCH_TOOL_NAME);
  assert.equal(tool.label, 'Sideroom Research');
  assert.equal(tool.exposure, 'model-only');
  assert.equal(tool.executionMode, 'parallel');
  assert.match(tool.description, /background/u);
  assert.match(tool.promptSnippet ?? '', /Proactively delegate/u);
  assert.match(tool.promptGuidelines?.join(' ') ?? '', /compare the recorded file hashes/u);
  assert.ok(tool.outputSchema);
  assert.ok(tool.renderCall);
  assert.ok(tool.renderResult);
  const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as unknown as Parameters<typeof tool.renderCall>[1];
  const renderContext = {} as Parameters<typeof tool.renderCall>[2];
  assert.match(tool.renderCall(request, theme, renderContext).render(120).join(' '), /sideroom_research What is the behavior/u);
  const longCall = tool.renderCall({ ...request, question: `${'x'.repeat(200)}hidden` }, theme, renderContext).render(240).join(' ');
  assert.doesNotMatch(longCall, /hidden/u);
  const options = { expanded: false, isPartial: false };
  assert.match(tool.renderResult({ content: [{ type: 'text', text: 'Started.' }], details: undefined }, options, theme, renderContext).render(120).join(' '), /Started/u);
  assert.match(tool.renderResult({ content: [], details: undefined }, options, theme, renderContext).render(120).join(' '), /did not start/u);
});

test('starts immediately, rejects duplicates and delivers the report with its usage', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-background-'));
  try {
    const background = provider();
    const { tool, notices, waitForNotice } = harness();
    const ctx = context(cwd, background.registry);
    const started = await tool.execute('one', request, undefined, undefined, ctx);
    assert.deepEqual(started.structuredContent, { id: 'one', status: 'started' });
    assert.deepEqual(started.details, started.structuredContent);
    assert.match(started.content[0]?.type === 'text' ? started.content[0].text : '', /Research one started/u);
    await background.ready;
    await assert.rejects(tool.execute('duplicate', request, undefined, undefined, ctx), /already running/u);
    assert.equal(notices.length, 0);
    background.release();
    await waitForNotice();
    assert.deepEqual(notices[0]?.options, { triggerTurn: true, deliverAs: 'steer' });
    assert.equal(notices[0]?.message.details.outcome?.runStatus, 'completed');
    assert.equal(notices[0]?.message.customType, 'sideroom-research-result');
    assert.equal(notices[0]?.message.display, true);
    assert.equal(notices[0]?.message.details.outcome?.usage.totalTokens, 2);
    assert.match(notices[0]?.message.content ?? '', /verify its evidence/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('allows distinct requests and clears a completed request for reuse', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-distinct-'));
  try {
    const background = provider();
    const { tool, notices } = harness();
    const ctx = context(cwd, background.registry);
    await tool.execute('one', request, undefined, undefined, ctx);
    await background.ready;
    await tool.execute('two', { ...request, question: 'Another question?' }, undefined, undefined, ctx);
    await assert.rejects(tool.execute('duplicate', request, undefined, undefined, ctx), /already running/u);
    background.release();
    while (notices.length < 2) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    const restarted = await tool.execute('three', request, undefined, undefined, ctx);
    assert.deepEqual(restarted.structuredContent, { id: 'three', status: 'started' });
    while (notices.length < 3) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('only a recorded research message releases the next report', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-receipt-'));
  try {
    const background = provider();
    const { tool, handlers, notices } = harness(false);
    const ctx = context(cwd, background.registry);
    await tool.execute('one', request, undefined, undefined, ctx);
    await background.ready;
    await tool.execute('two', { ...request, question: 'Another question?' }, undefined, undefined, ctx);
    background.release();
    while (notices.length === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 30));
    const handler = handlers.get('message_end');
    for (const entry of [
      { role: 'assistant' },
      { role: 'custom', customType: 'other', details: { id: 'one' } },
      { role: 'custom', customType: 'sideroom-research-result', details: null },
      { role: 'custom', customType: 'sideroom-research-result', details: {} },
      { role: 'custom', customType: 'sideroom-research-result', details: { id: 1 } },
    ]) {
      handler?.({ message: entry } as never);
      assert.equal(notices.length, 1);
    }
    handler?.({ message: { role: 'custom', ...notices[0]?.message } } as never);
    assert.equal(notices.length, 2);
    handlers.get('session_shutdown')?.();
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('discards late results after session, branch, shutdown or parent cancellation', { skip: process.platform !== 'linux' }, async () => {
  for (const event of ['session_start', 'session_tree', 'session_shutdown', 'agent_before_settle', 'agent_settled', 'signal']) {
    const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-cancel-'));
    try {
      const background = provider();
      const { tool, handlers, notices } = harness();
      const controller = new AbortController();
      await tool.execute(event, request, controller.signal, undefined, context(cwd, background.registry));
      await background.ready;
      if (event === 'signal') {
        controller.abort();
      } else if (event === 'agent_before_settle') {
        handlers.get(event)?.({ outcome: 'aborted' } as never);
      } else if (event === 'agent_settled') {
        handlers.get(event)?.({ aborted: true } as never);
      } else {
        handlers.get(event)?.();
      }
      assert.equal(background.signal()?.aborted, true, event);
      background.release();
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      assert.equal(notices.length, 0, event);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
});

test('a completed parent run leaves the background research running', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-completed-'));
  try {
    const background = provider();
    const { tool, handlers, notices, waitForNotice } = harness();
    await tool.execute('one', request, undefined, undefined, context(cwd, background.registry));
    await background.ready;
    handlers.get('agent_before_settle')?.({ outcome: 'completed' } as never);
    assert.equal(background.signal()?.aborted, false);
    background.release();
    await waitForNotice();
    assert.equal(notices[0]?.message.details.id, 'one');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('retries a failed delivery on the next agent start', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-retry-'));
  try {
    const background = provider();
    const { tool, handlers, notices, deliveryAttempt, setDeliveryFailure } = harness();
    setDeliveryFailure(true);
    await tool.execute('retry', request, undefined, undefined, context(cwd, background.registry));
    await background.ready;
    background.release();
    await deliveryAttempt;
    assert.equal(notices.length, 0);
    setDeliveryFailure(false);
    handlers.get('agent_start')?.();
    assert.equal(notices[0]?.message.details.id, 'retry');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('drops a failed delivery when the branch changes before retry', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-retry-branch-'));
  try {
    const background = provider();
    const { tool, handlers, notices, deliveryAttempt, setDeliveryFailure } = harness();
    setDeliveryFailure(true);
    await tool.execute('old-branch', request, undefined, undefined, context(cwd, background.registry));
    await background.ready;
    background.release();
    await deliveryAttempt;
    handlers.get('session_tree')?.();
    setDeliveryFailure(false);
    handlers.get('agent_start')?.();
    assert.equal(notices.length, 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('delivers provider errors as reports', { skip: process.platform !== 'linux' }, async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-failure-'));
  try {
    const { tool, notices, waitForNotice } = harness();
    const registry = { streamSimple: () => { throw new Error('Provider unavailable'); } };
    await tool.execute('failed', request, undefined, undefined, context(cwd, registry));
    await waitForNotice();
    assert.equal(notices[0]?.message.details.outcome?.runStatus, 'failed');
    assert.match(notices[0]?.message.content ?? '', /Provider unavailable/u);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('checks trust, cancellation and session changes before starting', async () => {
  const { tool, handlers } = harness();
  await assert.rejects(tool.execute('1', request, undefined, undefined, { isProjectTrusted: () => false } as ExtensionToolContext), /trusted project/u);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(tool.execute('2', request, controller.signal, undefined, context(process.cwd(), {})), /cancelled/u);
  const pending = tool.execute('3', request, undefined, undefined, context(process.cwd(), {}));
  handlers.get('session_tree')?.();
  await assert.rejects(pending, /session changed/u);
});
