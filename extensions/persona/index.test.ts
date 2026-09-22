import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { PERSONA_TOOL_NAME } from './catalog.ts';
import registerPersona from './index.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface RegisteredTool {
  readonly name: string;
  readonly promptGuidelines?: readonly string[];
}

interface Harness {
  readonly handlers: Map<string, EventHandler>;
  readonly steers: string[];
  readonly steerOptions: (
    | { triggerTurn?: boolean; deliverAs?: string }
    | undefined
  )[];
  readonly statuses: (string | undefined)[];
  readonly tool: RegisteredTool | undefined;
  readonly cwd: string;
}

function register(): Harness {
  const handlers = new Map<string, EventHandler>();
  const steers: string[] = [];
  const steerOptions: (
    | { triggerTurn?: boolean; deliverAs?: string }
    | undefined
  )[] = [];
  const statuses: (string | undefined)[] = [];
  let tool: RegisteredTool | undefined;
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
    registerTool(definition: RegisteredTool) {
      tool = definition;
    },
    sendMessage(
      message: { content: string },
      options?: { triggerTurn?: boolean; deliverAs?: string },
    ) {
      steers.push(message.content);
      steerOptions.push(options);
    },
  } as unknown as ExtensionAPI;
  registerPersona(api);
  return {
    handlers,
    steers,
    steerOptions,
    statuses,
    tool,
    cwd: mkdtempSync(join(tmpdir(), 'sideroom-persona-')),
  };
}

function context(
  cwd: string,
  statuses: (string | undefined)[],
  hasUI = true,
): never {
  return {
    cwd,
    hasUI,
    ui: {
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
    },
  } as never;
}

function writeEvent(path: string, content: string): never {
  return {
    toolName: 'write',
    toolCallId: 'c1',
    input: { path, content },
  } as never;
}

function assistantEvent(text: string): never {
  return {
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  } as never;
}

function handlerOf(harness: Harness, name: string): EventHandler {
  const handler = harness.handlers.get(name);
  assert.ok(handler, name);
  return handler;
}

test('registers the tool without duplicated prompt guidelines', () => {
  const harness = register();
  try {
    assert.equal(harness.tool?.name, PERSONA_TOOL_NAME);
    assert.equal(harness.tool?.promptGuidelines, undefined);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('blocks a write that adds a decorative symbol, then degrades', () => {
  const harness = register();
  try {
    const toolCall = handlerOf(harness, 'tool_call');
    const ctx = context(harness.cwd, harness.statuses);
    const event = () => writeEvent('src/icon.ts', 'const icon = "🔥";\n');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decision = toolCall(event(), ctx) as { block?: boolean };
      assert.equal(decision?.block, true, `attempt ${String(attempt)}`);
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      assert.equal(toolCall(event(), ctx), undefined);
    }
    assert.equal(harness.steers.length, 3);

    for (let clean = 0; clean < 5; clean += 1) {
      assert.equal(
        toolCall(writeEvent('src/clean.ts', 'const clean = true;\n'), ctx),
        undefined,
      );
    }
    const resetDecision = toolCall(event(), ctx) as { block?: boolean };
    assert.equal(resetDecision?.block, true);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('does not re-flag an existing symbol through Pi path aliases', () => {
  const harness = register();
  try {
    const toolCall = handlerOf(harness, 'tool_call');
    const content = 'const icon = "🔥";\n';
    writeFileSync(join(harness.cwd, 'icon.ts'), content);
    const ctx = context(harness.cwd, harness.statuses);

    assert.equal(toolCall(writeEvent('icon.ts', content), ctx), undefined);
    assert.equal(toolCall(writeEvent('@icon.ts', content), ctx), undefined);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('steers at most three times per run and resets on the next prompt', () => {
  const harness = register();
  try {
    const messageEnd = handlerOf(harness, 'message_end');
    const event = () => assistantEvent('Great question! Here it is.');
    const ctx = context(harness.cwd, harness.statuses);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      messageEnd(event(), ctx);
    }
    assert.equal(harness.steers.length, 3);
    for (const options of harness.steerOptions) {
      assert.equal(options?.triggerTurn, true);
      assert.equal(options?.deliverAs, 'steer');
    }

    handlerOf(harness, 'before_agent_start')(
      { systemPrompt: 'base' } as never,
      context(harness.cwd, harness.statuses),
    );
    messageEnd(event(), ctx);
    assert.equal(harness.steers.length, 4);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('counts blocks and steers for the current run', () => {
  const harness = register();
  try {
    const toolCall = handlerOf(harness, 'tool_call');
    const messageEnd = handlerOf(harness, 'message_end');
    const ctx = context(harness.cwd, harness.statuses);

    toolCall(writeEvent('src/icon.ts', 'const icon = "\u{1F525}";\n'), ctx);
    assert.equal(harness.statuses.at(-1), 'persona: direct · 1 block');

    messageEnd(assistantEvent('Great question! Here it is.'), ctx);
    assert.equal(
      harness.statuses.at(-1),
      'persona: direct · 1 block · 1 steer',
    );

    handlerOf(harness, 'before_agent_start')(
      { systemPrompt: 'base' } as never,
      ctx,
    );
    assert.equal(harness.statuses.at(-1), 'persona: direct');
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('leaves plain prose alone', () => {
  const harness = register();
  try {
    handlerOf(
      harness,
      'message_end',
    )(assistantEvent('The guard blocks the write until the emoji is gone.'));
    assert.deepEqual(harness.steers, []);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('appends the reminder once per prompt', () => {
  const harness = register();
  try {
    const beforeAgentStart = handlerOf(harness, 'before_agent_start');
    const ctx = context(harness.cwd, harness.statuses);

    const first = beforeAgentStart({ systemPrompt: 'base' } as never, ctx) as {
      systemPrompt: string;
    };
    assert.match(first.systemPrompt, /Sideroom persona \(always-on reminder\)/);

    const second = beforeAgentStart(
      { systemPrompt: first.systemPrompt } as never,
      ctx,
    );
    assert.equal(second, undefined);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});

test('publishes the footer status only when the UI is available', () => {
  const harness = register();
  try {
    const sessionStart = handlerOf(harness, 'session_start');
    sessionStart({} as never, context(harness.cwd, harness.statuses));
    assert.equal(harness.statuses.length, 1);
    assert.match(harness.statuses[0] ?? '', /^persona: direct/);

    sessionStart({} as never, context(harness.cwd, harness.statuses, false));
    assert.equal(harness.statuses.length, 1);
  } finally {
    rmSync(harness.cwd, { recursive: true, force: true });
  }
});
