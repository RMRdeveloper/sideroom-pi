import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import type { JevTransport } from './client.ts';
import {
  createJevGuardState,
  guardStatus,
  JEV_STATUS,
  type JevGuardState,
  type JevStatus,
  registerJevGuard,
  resetJevGuard,
  resetJevUsage,
  shouldCallJev,
} from './guard.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly statuses: JevStatus[];
  readonly calls: string[];
  readonly cwd: string;
  readonly ctx: ExtensionContext;
  readonly guardState: JevGuardState;
  apiKey: string | undefined;
  transport: JevTransport;
}

interface ToolOutcome {
  readonly content: readonly { readonly text?: string }[];
}

function createHarness(): Harness {
  const handlers = new Map<string, EventHandler>();
  const statuses: JevStatus[] = [];
  const calls: string[] = [];
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-jev-guard-'));
  const ctx = {
    cwd,
    ui: { setStatus() {} },
  } as unknown as ExtensionContext;

  const harness = {
    handlers,
    statuses,
    calls,
    cwd,
    ctx,
    guardState: createJevGuardState(),
    apiKey: 'test-key' as string | undefined,
    transport: (async () => ({
      status: 200,
      text: '{"answers":{}}',
    })) as JevTransport,
  } satisfies Harness;

  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerJevGuard(api, harness.guardState, {
    apiKey: () => harness.apiKey,
    transport: (request) => harness.transport(request),
    report: (status) => {
      statuses.push(status);
    },
  });
  return harness;
}

function withHarness(run: (harness: Harness) => Promise<void>): Promise<void> {
  const harness = createHarness();
  return run(harness).finally(() => {
    rmSync(harness.cwd, { recursive: true, force: true });
  });
}

function handlerOf(harness: Harness, name: string): EventHandler {
  const handler = harness.handlers.get(name);
  assert.ok(handler, name);
  return handler;
}

async function writeFile(
  harness: Harness,
  options: {
    readonly path?: string;
    readonly content?: string;
    readonly toolCallId?: string;
  } = {},
): Promise<ToolOutcome | undefined> {
  const path = options.path ?? 'src/example.ts';
  const content = options.content ?? 'const a = 1;\n';
  const toolCallId = options.toolCallId ?? 'w1';

  handlerOf(harness, 'tool_call')(
    { toolName: 'write', toolCallId, input: { path, content } } as never,
    harness.ctx as never,
  );
  const absolutePath = join(harness.cwd, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return (await handlerOf(harness, 'tool_result')(
    {
      toolName: 'write',
      toolCallId,
      input: { path },
      content: [],
      isError: false,
    } as never,
    harness.ctx as never,
  )) as ToolOutcome | undefined;
}

function notesOf(outcome: ToolOutcome | undefined): string {
  if (outcome === undefined) {
    return '';
  }
  return outcome.content.map((block) => block.text ?? '').join('\n');
}

function answering(noul: number): JevTransport {
  return async () => ({
    status: 200,
    text: `{"model":"jev-1.13.0","answers":{"guard-clauses":{"type":"noul","noul":${String(noul)}}}}`,
  });
}

test('appends a note when a rule clears the cutoff', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.93);
    const note = notesOf(await writeFile(harness));
    assert.match(note, /Sideroom Jev review flagged src\/example\.ts/);
    assert.match(note, /\[guard-clauses\]/);
    assert.deepEqual(harness.statuses, [JEV_STATUS.ready]);
    assert.equal(harness.guardState.calls, 1);
  });
});

test('appends nothing when every answer stays under the cutoff', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.2);
    assert.equal(await writeFile(harness), undefined);
    assert.equal(harness.calls.length, 0);
  });
});

test('never calls Jev without a key, and says so', async () => {
  await withHarness(async (harness) => {
    harness.apiKey = undefined;
    assert.equal(await writeFile(harness), undefined);
    assert.deepEqual(harness.statuses, [JEV_STATUS.noKey]);
    assert.equal(harness.guardState.calls, 0);
  });
});

test('ignores a failed mutation', async () => {
  await withHarness(async (harness) => {
    handlerOf(harness, 'tool_call')(
      {
        toolName: 'write',
        toolCallId: 'w1',
        input: { path: 'src/example.ts', content: 'x' },
      } as never,
      harness.ctx as never,
    );
    const outcome = await handlerOf(harness, 'tool_result')(
      {
        toolName: 'write',
        toolCallId: 'w1',
        input: { path: 'src/example.ts' },
        content: [],
        isError: true,
      } as never,
      harness.ctx as never,
    );
    assert.equal(outcome, undefined);
  });
});

test('ignores a result with no mutation behind it', async () => {
  await withHarness(async (harness) => {
    const outcome = await handlerOf(harness, 'tool_result')(
      {
        toolName: 'write',
        toolCallId: 'unknown',
        input: { path: 'src/example.ts' },
        content: [],
        isError: false,
      } as never,
      harness.ctx as never,
    );
    assert.equal(outcome, undefined);
  });
});

test('stops calling after three transient failures, and the screen re-arms it', async () => {
  await withHarness(async (harness) => {
    let attempts = 0;
    harness.transport = async () => {
      attempts += 1;
      throw new Error('offline');
    };

    for (let index = 0; index < 5; index += 1) {
      await writeFile(harness, { toolCallId: `w${String(index)}` });
    }

    assert.equal(attempts, 3);
    assert.equal(shouldCallJev(harness.guardState), false);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.unavailable);

    resetJevGuard(harness.guardState);
    assert.equal(shouldCallJev(harness.guardState), true);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.ready);
  });
});

test('stops at the first quota failure and reports it', async () => {
  await withHarness(async (harness) => {
    let attempts = 0;
    harness.transport = async () => {
      attempts += 1;
      return { status: 402, text: '' };
    };

    await writeFile(harness, { toolCallId: 'w1' });
    await writeFile(harness, { toolCallId: 'w2' });

    assert.equal(attempts, 1);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.quota);
    assert.equal(harness.statuses.at(-1), JEV_STATUS.quota);
  });
});

test('does not repeat the same rule on the same file twice in a turn', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);

    const first = notesOf(await writeFile(harness, { toolCallId: 'w1' }));
    const second = notesOf(await writeFile(harness, { toolCallId: 'w2' }));
    assert.match(first, /\[guard-clauses\]/);
    assert.equal(second, '');

    handlerOf(harness, 'input')({ source: 'interactive' } as never);
    const third = notesOf(await writeFile(harness, { toolCallId: 'w3' }));
    assert.match(third, /\[guard-clauses\]/);
  });
});

test('does not re-arm on extension-sourced input', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);

    await writeFile(harness, { toolCallId: 'w1' });
    handlerOf(harness, 'input')({ source: 'extension' } as never);
    const second = notesOf(await writeFile(harness, { toolCallId: 'w2' }));
    assert.equal(second, '');
  });
});

test('counts session calls and starts a new session from zero', async () => {
  await withHarness(async (harness) => {
    await writeFile(harness, { toolCallId: 'w1' });
    await writeFile(harness, { toolCallId: 'w2' });
    assert.equal(harness.guardState.calls, 2);

    resetJevUsage(harness.guardState);
    assert.equal(harness.guardState.calls, 0);
  });
});

test('skips a file that is too large for the state budget', async () => {
  await withHarness(async (harness) => {
    const outcome = await writeFile(harness, {
      content: 'x'.repeat(70_000),
      path: 'src/huge.ts',
    });
    assert.equal(outcome, undefined);
    assert.deepEqual(harness.statuses, []);
  });
});
