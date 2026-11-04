import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

test('does not block text inside a string or miss a swallowed error beside a kept catch', () => {
  const { handlers, cwd } = register();
  try {
    writeFileSync(join(cwd, 'message.ts'), 'const text = `\nhello\n`;\n');
    writeFileSync(
      join(cwd, 'save.ts'),
      'try {\n  save();\n} catch (error) {\n  throw error;\n}\n',
    );
    const toolCall = handlers.get('tool_call');
    const toolResult = handlers.get('tool_result');
    assert.ok(toolCall);
    assert.ok(toolResult);
    const insideString = toolCall({
      toolName: 'edit',
      toolCallId: 'string',
      input: {
        path: 'message.ts',
        edits: [{ oldText: 'hello', newText: 'if (active) return;' }],
      },
    } as never, { cwd } as never);
    assert.equal(insideString, undefined);

    const swallowed = toolCall({
      toolName: 'edit',
      toolCallId: 'catch',
      input: {
        path: 'save.ts',
        edits: [{ oldText: 'throw error;', newText: 'return null;' }],
      },
    } as never, { cwd } as never) as { block?: boolean; reason?: string };
    assert.equal(swallowed?.block, true);
    assert.match(swallowed?.reason ?? '', /explicit-error-handling/);

    writeFileSync(join(cwd, 'twice.ts'), 'const value = 1;\nconst value = 1;\n');
    const ambiguous = toolCall({
      toolName: 'edit',
      toolCallId: 'ambiguous',
      input: {
        path: 'twice.ts',
        edits: [{ oldText: 'const value = 1;', newText: 'if (active) return;' }],
      },
    } as never, { cwd } as never);
    assert.equal(ambiguous, undefined);
    const enriched = toolResult({
      toolName: 'edit',
      toolCallId: 'ambiguous',
      input: {},
      content: [{ type: 'text', text: 'ok' }],
      isError: false,
    } as never) as { content: { text: string }[] };
    assert.match(enriched.content[1]?.text ?? '', /not blocked/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('blocks an unbraced else in a proposed file', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    assert.ok(toolCall);
    const decision = toolCall(
      writeEvent('else', 'src/user.ts', 'if (active) {\n  run();\n} else return;\n'),
      { cwd } as never,
    ) as { block?: boolean; reason?: string };
    assert.equal(decision?.block, true);
    assert.match(decision?.reason ?? '', /braced-conditionals/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

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

test('blocks a write that introduces any', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    assert.ok(toolCall);
    const decision = toolCall(
      writeEvent('c6', 'src/user.ts', 'const id: any = 1;\n'),
      { cwd } as never,
    ) as { block?: boolean; reason?: string };
    assert.equal(decision?.block, true);
    assert.match(decision?.reason ?? '', /explicit-any/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('notes a suppressed type error without blocking the write', () => {
  const { handlers, cwd } = register();
  try {
    const toolCall = handlers.get('tool_call');
    const toolResult = handlers.get('tool_result');
    assert.ok(toolCall);
    assert.ok(toolResult);

    const decision = toolCall(
      writeEvent('c7', 'src/user.ts', '// @ts-ignore\nread();\n'),
      { cwd } as never,
    );
    assert.equal(decision, undefined);

    const enriched = toolResult(writeResultEvent('c7')) as {
      content: { type: string; text: string }[];
    };
    assert.equal(enriched.content.length, 2);
    assert.match(enriched.content[1]?.text ?? '', /suppressed-type-errors/);
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
