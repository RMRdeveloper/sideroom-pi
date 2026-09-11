import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerRules from './index.ts';

type EventHandler = (event: never, ctx?: never) => unknown;

interface Registered {
  readonly handlers: Map<string, EventHandler>;
  readonly cwd: string;
}

function register(): Registered {
  const handlers = new Map<string, EventHandler>();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  registerRules(api);
  return { handlers, cwd: mkdtempSync(join(tmpdir(), 'sideroom-rules-')) };
}

function writeEvent(toolCallId: string, path: string, content: string): never {
  return {
    toolName: 'write',
    toolCallId,
    input: { path, content },
  } as never;
}

function writeResultEvent(toolCallId: string): never {
  return {
    toolName: 'write',
    toolCallId,
    input: {},
    content: [{ type: 'text', text: 'ok' }],
    isError: false,
  } as never;
}

test('blocks a write that introduces a braceless conditional', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    assert.ok(toolCall);
    const decision = toolCall(
      writeEvent('c1', 'src/user.ts', 'if (!user) return 0;\n'),
      { cwd } as never,
    ) as { block?: boolean; reason?: string };
    assert.equal(decision?.block, true);
    assert.match(decision?.reason ?? '', /braced-conditionals/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does not block a warning and appends it to the tool result', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    const toolResult = handlers.get('tool_result');
    assert.ok(toolCall);
    assert.ok(toolResult);

    const decision = toolCall(
      writeEvent('c2', 'src/user.ts', 'const data = 1;\n'),
      { cwd } as never,
    );
    assert.equal(decision, undefined);

    const enriched = toolResult(writeResultEvent('c2')) as {
      content: { type: string; text: string }[];
    };
    assert.equal(enriched.content.length, 2);
    assert.match(enriched.content[1]?.text ?? '', /clear-names/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('degrades a blocking rule after repeated fires', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    assert.ok(toolCall);
    const event = () =>
      writeEvent('c3', 'src/user.ts', 'if (!user) return 0;\n');

    assert.equal(
      (toolCall(event(), { cwd } as never) as { block?: boolean })?.block,
      true,
    );
    assert.equal(
      (toolCall(event(), { cwd } as never) as { block?: boolean })?.block,
      true,
    );
    assert.equal(
      (toolCall(event(), { cwd } as never) as { block?: boolean })?.block,
      true,
    );
    assert.equal(toolCall(event(), { cwd } as never), undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('resets the breaker on the next interactive input', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    const input = handlers.get('input');
    assert.ok(toolCall);
    assert.ok(input);
    const event = () =>
      writeEvent('c4', 'src/user.ts', 'if (!user) return 0;\n');

    toolCall(event(), { cwd } as never);
    toolCall(event(), { cwd } as never);
    toolCall(event(), { cwd } as never);
    assert.equal(toolCall(event(), { cwd } as never), undefined);

    input({ source: 'interactive' } as never);
    assert.equal(
      (toolCall(event(), { cwd } as never) as { block?: boolean })?.block,
      true,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('inspects only edit newText additions', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    assert.ok(toolCall);
    const decision = toolCall(
      {
        toolName: 'edit',
        toolCallId: 'c5',
        input: {
          path: 'src/user.ts',
          edits: [{ oldText: 'return 0;', newText: 'return 1;' }],
        },
      } as never,
      { cwd } as never,
    );
    assert.equal(decision, undefined);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
