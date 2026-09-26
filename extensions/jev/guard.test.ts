import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type {
  ExtensionAPI,
  ExtensionContext,
} from '@earendil-works/pi-coding-agent';
import { isReviewNote, REVIEW_NOTE_EVENT } from '../shared/review-note.ts';
import type { JevHttpRequest, JevTransport } from './client.ts';
import {
  createJevGuardState,
  guardStatus,
  JEV_STATUS,
  type JevGuardState,
  type JevStatus,
  registerJevGuard,
  resetJevGuard,
  resetJevSession,
  shouldCallJev,
} from './guard.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly statuses: JevStatus[];
  readonly requests: JevHttpRequest[];
  readonly notes: string[];
  readonly cwd: string;
  readonly ctx: ExtensionContext;
  readonly guardState: JevGuardState;
  apiKey: string | undefined;
  signal: AbortSignal | undefined;
  transport: JevTransport;
}

interface WriteOptions {
  readonly path?: string;
  readonly content?: string;
  readonly toolCallId?: string;
}

interface SentState {
  readonly file: { readonly path: string };
}

function createHarness(): Harness {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-jev-guard-'));
  const harness: Harness = {
    handlers: new Map(),
    statuses: [],
    requests: [],
    notes: [],
    cwd,
    ctx: {} as ExtensionContext,
    guardState: createJevGuardState(),
    apiKey: 'test-key',
    signal: undefined,
    transport: async () => ({ status: 200, text: '{"answers":{}}' }),
  };
  const ctx = {
    cwd,
    ui: { setStatus() {} },
    get signal() {
      return harness.signal;
    },
  } as unknown as ExtensionContext;
  Object.assign(harness, { ctx });

  const api = {
    on(name: string, handler: EventHandler) {
      harness.handlers.set(name, handler);
    },
    events: {
      emit(channel: string, payload: unknown) {
        if (channel === REVIEW_NOTE_EVENT && isReviewNote(payload)) {
          harness.notes.push(payload.text);
        }
      },
    },
  } as unknown as ExtensionAPI;

  registerJevGuard(api, harness.guardState, {
    apiKey: () => harness.apiKey,
    transport: (request) => {
      harness.requests.push(request);
      return harness.transport(request);
    },
    report: (status) => {
      harness.statuses.push(status);
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

function callTool(
  harness: Harness,
  toolName: string,
  toolCallId: string,
  input: Record<string, unknown>,
): void {
  handlerOf(harness, 'tool_call')(
    { toolName, toolCallId, input } as never,
    harness.ctx as never,
  );
}

function finishTool(
  harness: Harness,
  toolName: string,
  toolCallId: string,
  path: string,
): Promise<unknown> {
  return handlerOf(harness, 'tool_result')(
    {
      toolName,
      toolCallId,
      input: { path },
      content: [],
      isError: false,
    } as never,
    harness.ctx as never,
  ) as Promise<unknown>;
}

async function writeFile(
  harness: Harness,
  options: WriteOptions = {},
): Promise<unknown> {
  const path = options.path ?? 'src/example.ts';
  const toolCallId = options.toolCallId ?? 'w1';
  const content = options.content ?? `const call = '${toolCallId}';\n`;

  callTool(harness, 'write', toolCallId, { path, content });
  const absolutePath = resolve(harness.cwd, path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
  return finishTool(harness, 'write', toolCallId, path);
}

function input(
  harness: Harness,
  source: string,
  streamingBehavior?: string,
): void {
  handlerOf(harness, 'input')({ source, streamingBehavior } as never);
}

function sentPath(request: JevHttpRequest | undefined): string {
  assert.ok(request);
  const body = JSON.parse(request.body) as { readonly state: SentState };
  return body.state.file.path;
}

function answering(noul: number): JevTransport {
  return async () => ({
    status: 200,
    text: `{"model":"jev-1.13.0","answers":{"guard-clauses":{"type":"noul","noul":${String(noul)}}}}`,
  });
}

test('hands a finding to the review instead of the tool result', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.93);
    assert.equal(await writeFile(harness), undefined);

    assert.equal(harness.notes.length, 1);
    assert.match(
      harness.notes[0] ?? '',
      /Sideroom Jev review flagged src\/example\.ts/,
    );
    assert.match(harness.notes[0] ?? '', /\[guard-clauses\]/);
    assert.deepEqual(harness.statuses, [JEV_STATUS.ready]);
    assert.equal(harness.guardState.calls, 1);
  });
});

test('hands nothing over when every answer stays under the cutoff', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.2);
    await writeFile(harness);
    assert.equal(harness.requests.length, 1);
    assert.deepEqual(harness.notes, []);
  });
});

test('never calls Jev without a key, and says so', async () => {
  await withHarness(async (harness) => {
    harness.apiKey = undefined;
    await writeFile(harness);
    assert.deepEqual(harness.statuses, [JEV_STATUS.noKey]);
    assert.equal(harness.requests.length, 0);
  });
});

test('ignores a failed mutation', async () => {
  await withHarness(async (harness) => {
    callTool(harness, 'write', 'w1', { path: 'src/example.ts', content: 'x' });
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
    assert.equal(harness.requests.length, 0);
  });
});

test('ignores a result with no mutation behind it', async () => {
  await withHarness(async (harness) => {
    await finishTool(harness, 'write', 'unknown', 'src/example.ts');
    assert.equal(harness.requests.length, 0);
  });
});

test('skips files outside a supported language', async () => {
  await withHarness(async (harness) => {
    await writeFile(harness, { path: 'README.md', content: '# Title\n' });
    await writeFile(harness, {
      path: 'package-lock.json',
      content: '{}\n',
      toolCallId: 'w2',
    });
    assert.equal(harness.requests.length, 0);
    assert.deepEqual(harness.statuses, []);
  });
});

test('skips an edit that adds no lines', async () => {
  await withHarness(async (harness) => {
    const path = 'src/example.ts';
    mkdirSync(join(harness.cwd, 'src'), { recursive: true });
    writeFileSync(join(harness.cwd, path), 'const a = 1;\n');

    callTool(harness, 'edit', 'e1', {
      path,
      edits: [
        { oldText: 'const a = 1;\nconst b = 2;\n', newText: 'const a = 1;\n' },
      ],
    });
    await finishTool(harness, 'edit', 'e1', path);
    assert.equal(harness.requests.length, 0);
  });
});

test('skips a file outside the working directory', async () => {
  await withHarness(async (harness) => {
    const outside = resolve(harness.cwd, '..', 'elsewhere.ts');
    callTool(harness, 'write', 'w1', {
      path: outside,
      content: 'const a = 1;\n',
    });
    await finishTool(harness, 'write', 'w1', outside);
    assert.equal(harness.requests.length, 0);
  });
});

test('sends the project-relative path however the model spelled it', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);
    await writeFile(harness, { path: join(harness.cwd, 'src/example.ts') });
    await writeFile(harness, {
      path: './src/example.ts',
      toolCallId: 'w2',
      content: 'const b = 2;\n',
    });

    assert.equal(sentPath(harness.requests[0]), join('src', 'example.ts'));
    assert.equal(sentPath(harness.requests[1]), join('src', 'example.ts'));
    assert.equal(harness.notes.length, 1);
  });
});

test('makes no request once the run is already aborted', async () => {
  await withHarness(async (harness) => {
    const controller = new AbortController();
    controller.abort();
    harness.signal = controller.signal;
    await writeFile(harness);
    assert.equal(harness.requests.length, 0);
    assert.equal(harness.guardState.calls, 0);
  });
});

test('passes the run signal and does not count an Escape as a failure', async () => {
  await withHarness(async (harness) => {
    for (let index = 0; index < 4; index += 1) {
      const controller = new AbortController();
      harness.signal = controller.signal;
      harness.transport = async (request) => {
        assert.equal(request.signal, controller.signal);
        controller.abort();
        throw new Error('aborted');
      };
      await writeFile(harness, { toolCallId: `w${String(index)}` });
    }

    assert.equal(harness.requests.length, 4);
    assert.equal(shouldCallJev(harness.guardState), true);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.ready);
  });
});

test('pauses on a rate limit until the next idle prompt', async () => {
  await withHarness(async (harness) => {
    harness.transport = async () => ({ status: 429, text: '' });
    await writeFile(harness, { toolCallId: 'w1' });
    await writeFile(harness, { toolCallId: 'w2' });

    assert.equal(harness.requests.length, 1);
    assert.equal(harness.statuses.at(-1), JEV_STATUS.rateLimited);
    assert.equal(harness.guardState.transientFailures, 0);

    input(harness, 'interactive', 'steer');
    await writeFile(harness, { toolCallId: 'w3' });
    assert.equal(harness.requests.length, 1);

    input(harness, 'interactive');
    harness.transport = answering(0.1);
    await writeFile(harness, { toolCallId: 'w4' });
    assert.equal(harness.requests.length, 2);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.ready);
  });
});

test('stops calling after three transient failures, and the screen re-arms it', async () => {
  await withHarness(async (harness) => {
    harness.transport = async () => {
      throw new Error('offline');
    };

    for (let index = 0; index < 5; index += 1) {
      await writeFile(harness, { toolCallId: `w${String(index)}` });
    }

    assert.equal(harness.requests.length, 3);
    assert.equal(shouldCallJev(harness.guardState), false);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.unavailable);

    resetJevGuard(harness.guardState);
    assert.equal(shouldCallJev(harness.guardState), true);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.ready);
  });
});

test('stops at the first quota failure and reports it', async () => {
  await withHarness(async (harness) => {
    harness.transport = async () => ({ status: 402, text: '' });

    await writeFile(harness, { toolCallId: 'w1' });
    await writeFile(harness, { toolCallId: 'w2' });

    assert.equal(harness.requests.length, 1);
    assert.equal(guardStatus(harness.guardState), JEV_STATUS.quota);
    assert.equal(harness.statuses.at(-1), JEV_STATUS.quota);
  });
});

test('does not repeat the same rule on the same file twice in a turn', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);

    await writeFile(harness, { toolCallId: 'w1' });
    await writeFile(harness, { toolCallId: 'w2' });
    assert.equal(harness.notes.length, 1);

    input(harness, 'interactive');
    await writeFile(harness, { toolCallId: 'w3' });
    assert.equal(harness.notes.length, 2);
  });
});

test('does not re-arm on a message typed while the run is active', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);

    await writeFile(harness, { toolCallId: 'w1' });
    input(harness, 'interactive', 'steer');
    input(harness, 'interactive', 'followUp');
    await writeFile(harness, { toolCallId: 'w2' });
    assert.equal(harness.notes.length, 1);
  });
});

test('does not re-arm on extension-sourced input', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);

    await writeFile(harness, { toolCallId: 'w1' });
    input(harness, 'extension');
    await writeFile(harness, { toolCallId: 'w2' });
    assert.equal(harness.notes.length, 1);
  });
});

test('forgets a call that never produced a result when the turn ends', async () => {
  await withHarness(async (harness) => {
    callTool(harness, 'write', 'blocked', {
      path: 'src/example.ts',
      content: 'const a = 1;\n',
    });
    assert.equal(harness.guardState.pending.size, 1);

    handlerOf(harness, 'turn_end')({} as never, harness.ctx as never);
    assert.equal(harness.guardState.pending.size, 0);
  });
});

test('starts a new session from zero calls and empty turn memory', async () => {
  await withHarness(async (harness) => {
    harness.transport = answering(0.95);
    await writeFile(harness, { toolCallId: 'w1' });
    callTool(harness, 'write', 'w2', {
      path: 'src/other.ts',
      content: 'const b = 2;\n',
    });
    assert.equal(harness.guardState.calls, 1);

    resetJevSession(harness.guardState);
    assert.equal(harness.guardState.calls, 0);
    assert.equal(harness.guardState.pending.size, 0);
    assert.equal(harness.guardState.notedThisTurn.size, 0);
  });
});

test('skips a file that is too large for the state budget', async () => {
  await withHarness(async (harness) => {
    await writeFile(harness, {
      content: 'x'.repeat(70_000),
      path: 'src/huge.ts',
    });
    assert.equal(harness.requests.length, 0);
    assert.deepEqual(harness.statuses, []);
  });
});
