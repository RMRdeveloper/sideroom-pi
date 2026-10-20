import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type {
  AgentBeforeSettleEventResult,
  ExtensionAPI,
} from '@earendil-works/pi-coding-agent';
import registerGuidelines from '../guidelines/index.ts';
import { REVIEW_STEER_TYPE } from '../guidelines/review.ts';
import registerExplain from './index.ts';
import { EXPLAIN_FILE_THRESHOLD, EXPLAIN_OFFER_TYPE } from './model.ts';

type EventHandler = (event: never, ctx?: never) => unknown;
type Register = (pi: ExtensionAPI) => void;

interface CustomMessageDraft {
  readonly customType: string;
  readonly content: string;
}

interface Harness {
  readonly handlers: Map<string, EventHandler[]>;
  readonly steers: CustomMessageDraft[];
}

interface SettleOptions {
  readonly mode?: string;
  readonly outcome?: string;
}

const CWD = '/work';

function register(...extensions: readonly Register[]): Harness {
  const handlers = new Map<string, EventHandler[]>();
  const bus = new EventEmitter();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool() {},
    getActiveTools: () => ['read', 'edit', 'write'],
    events: {
      on: (name: string, handler: (payload: unknown) => void) =>
        bus.on(name, handler),
      emit: (name: string, payload: unknown) => bus.emit(name, payload),
    },
  } as unknown as ExtensionAPI;
  for (const extension of extensions) {
    extension(api);
  }
  return { handlers, steers: [] };
}

function handlersOf(harness: Harness, name: string): readonly EventHandler[] {
  const handlers = harness.handlers.get(name);
  assert.ok(handlers, name);
  return handlers;
}

function emit(harness: Harness, name: string, event: unknown): void {
  for (const handler of handlersOf(harness, name)) {
    handler(event as never, { cwd: CWD } as never);
  }
}

function fileResult(toolName: string, path: string, isError = false): unknown {
  return {
    toolName,
    toolCallId: `t:${path}`,
    input: { path },
    isError,
  };
}

function mutateFile(
  harness: Harness,
  path: string,
  toolName = 'write',
  isError = false,
): void {
  emit(harness, 'tool_result', fileResult(toolName, path, isError));
}

function mutateTurn(
  harness: Harness,
  count: number,
  toolName = 'write',
  isError = false,
): void {
  for (let index = 0; index < count; index += 1) {
    mutateFile(harness, `src/file-${index}.ts`, toolName, isError);
  }
}

async function settle(harness: Harness, options: SettleOptions = {}): Promise<void> {
  let entries: readonly CustomMessageDraft[] = [];
  let shouldContinue = false;
  for (const handler of harness.handlers.get('agent_before_settle') ?? []) {
    const boundary = await handler(
      {
        type: 'agent_before_settle',
        outcome: options.outcome ?? 'completed',
        entries,
        continue: shouldContinue,
        context: { pendingMessages: [] },
      } as never,
      { mode: options.mode ?? 'tui', hasPendingMessages: () => false } as never,
    ) as AgentBeforeSettleEventResult | undefined;
    if (boundary?.entries !== undefined) {
      entries = boundary.entries as unknown as CustomMessageDraft[];
    }
    if (boundary?.continue !== undefined) {
      shouldContinue = boundary.continue;
    }
  }
  harness.steers.push(...entries);
}

function offers(harness: Harness): readonly CustomMessageDraft[] {
  return harness.steers.filter(
    (steer) => steer.customType === EXPLAIN_OFFER_TYPE,
  );
}

test('never starts a continuation solely for a walkthrough offer', async () => {
  const harness = register(registerExplain);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
  assert.equal(harness.handlers.has('agent_before_settle'), false);
});

test('does not open a new turn when later edits cross the threshold', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateFile(harness, 'src/a.ts');
  mutateFile(harness, 'src/b.ts');
  await settle(harness);
  assert.equal(offers(harness).length, 0);

  mutateFile(harness, 'src/c.ts');
  mutateFile(harness, 'src/d.ts');
  mutateFile(harness, 'src/e.ts');
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('stays silent below the file threshold', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD - 1);
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('counts a file mutated twice once', async () => {
  const harness = register(registerExplain, registerGuidelines);
  for (let index = 0; index < EXPLAIN_FILE_THRESHOLD; index += 1) {
    mutateFile(harness, 'src/app.ts', 'edit');
  }
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('treats an edit the same as a write', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD - 1);
  mutateFile(harness, 'src/edited.ts', 'edit');
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 1);
});

test('counts one file once however the model spelled its path', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateFile(harness, 'src/app.ts');
  mutateFile(harness, '@src/app.ts');
  mutateFile(harness, './src/app.ts');
  mutateFile(harness, '/work/src/app.ts');
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('stays silent without a mutation', async () => {
  const harness = register(registerExplain, registerGuidelines);
  emit(harness, 'tool_result', {
    toolName: 'read',
    toolCallId: 't1',
    input: {},
    isError: false,
  });
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('ignores a failed mutation', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD, 'write', true);
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('stays silent outside the TUI', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness, { mode: 'print' });
  await settle(harness, { mode: 'print' });
  assert.equal(offers(harness).length, 0);
});

test('stays silent when the user aborted or the run errored', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness, { outcome: 'aborted' });
  await settle(harness, { outcome: 'error' });
  await settle(harness, { outcome: 'aborted' });
  assert.equal(offers(harness).length, 0);
});

test('offers at most once per turn and re-arms on the next idle prompt', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);

  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 1);

  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 1);

  emit(harness, 'input', { source: 'interactive' });
  await settle(harness);
  assert.equal(offers(harness).length, 1);

  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 2);
});

test('does not re-arm on a message typed while the run is active', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness);
  await settle(harness);

  emit(harness, 'input', { source: 'interactive', streamingBehavior: 'steer' });
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 1);
});

test('clears the turn state when a session starts', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  emit(harness, 'session_start', {});
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 0);
});

test('ignores a non-user input source when re-arming', async () => {
  const harness = register(registerExplain, registerGuidelines);
  mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);
  await settle(harness);
  await settle(harness);

  emit(harness, 'input', { source: 'extension' });
  await settle(harness);
  await settle(harness);
  assert.equal(offers(harness).length, 1);
});

for (const [order, extensions] of [
  ['explain first', [registerExplain, registerGuidelines]],
  ['guidelines first', [registerGuidelines, registerExplain]],
] as const) {
  test(`attaches the offer to the review continuation with ${order}`, async () => {
    const harness = register(...extensions);
    mutateTurn(harness, EXPLAIN_FILE_THRESHOLD);

    await settle(harness);
    await settle(harness);
    await settle(harness);

    assert.deepEqual(
      harness.steers.map((steer) => steer.customType),
      [REVIEW_STEER_TYPE, EXPLAIN_OFFER_TYPE],
    );
  });
}
