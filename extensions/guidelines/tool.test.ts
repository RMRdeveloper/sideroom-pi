import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExtensionRuntime,
  type Extension,
  type ExtensionAPI,
  ExtensionRunner,
  type ModelRegistry,
  SessionManager,
  type ToolDefinition,
  type ToolResultEventResult,
} from '@earendil-works/pi-coding-agent';
import {
  GUIDELINE_SKILL_PATH,
  GUIDELINES_TOOL_NAME,
  languageGuideFor,
} from './catalog.ts';
import registerGuidelines from './index.ts';

type Handler = (event: never, ctx: never) => unknown;
interface LoadOptions {
  readonly id?: string;
  readonly signal?: AbortSignal;
}
interface DeliveryOptions {
  readonly id?: string;
  readonly isError?: boolean;
}

function harness() {
  const handlers = new Map<string, Handler[]>();
  let tool: ToolDefinition | undefined;
  registerGuidelines({
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    registerTool(registered: ToolDefinition) {
      tool = registered;
    },
    events: { on() {} },
    getActiveTools: () => [GUIDELINES_TOOL_NAME, 'edit', 'write'],
  } as unknown as ExtensionAPI);
  assert.ok(tool);
  const registered = tool;
  function emit(name: string, event: unknown = {}) {
    let outcome: unknown;
    for (const handler of handlers.get(name) ?? []) {
      outcome =
        handler(event as never, { cwd: '/target-project' } as never) ?? outcome;
    }
    return outcome;
  }
  async function load(path: string, { id = 'load', signal }: LoadOptions = {}) {
    return registered.execute(id, { path }, signal, undefined, {} as never);
  }
  function deliver(
    loaded: Awaited<ReturnType<typeof load>>,
    { id = 'load', isError = false }: DeliveryOptions = {},
  ) {
    emit('tool_result', {
      toolName: GUIDELINES_TOOL_NAME,
      toolCallId: id,
      input: { path: 'ignored.ts' },
      isError,
      ...loaded,
    });
    emit('tool_execution_end', {
      toolName: GUIDELINES_TOOL_NAME,
      toolCallId: id,
      isError,
      result: loaded,
    });
  }
  function blocked(path = 'new.ts', toolName = 'write') {
    return emit('tool_call', { toolName, input: { path } });
  }
  return { tool: registered, handlers, emit, load, deliver, blocked };
}

test('registered tool authorizes only after complete delivery and reuses loaded guides', async () => {
  const gate = harness();
  assert.equal(gate.tool.name, GUIDELINES_TOOL_NAME);
  assert.equal(gate.tool.exposure, 'model-only');
  assert.match(gate.tool.description, /Before write or edit/);
  assert.match(gate.tool.description, /Reuse loaded guides/);
  assert.ok(gate.blocked());
  const loaded = await gate.load('new.ts');
  assert.ok(gate.blocked());
  gate.deliver(loaded);
  assert.equal(gate.blocked('another.tsx', 'edit'), undefined);
  assert.equal(gate.blocked('README.md'), undefined);
  assert.ok(gate.blocked('new.py'));
  gate.deliver(await gate.load('new.py'));
  assert.equal(gate.blocked('new.py'), undefined);
  assert.equal(gate.blocked(), undefined);
});

test('unsupported target loads only the skill and can combine with read for a language', async () => {
  const gate = harness();
  gate.deliver(await gate.load('README.md'));
  assert.equal(gate.blocked('README.md'), undefined);
  assert.ok(gate.blocked());
  gate.emit('tool_result', {
    toolName: 'read',
    input: { path: languageGuideFor('new.ts') },
    isError: false,
  });
  assert.equal(gate.blocked(), undefined);
});

test('read language loads can combine with a tool skill load', async () => {
  const gate = harness();
  gate.emit('tool_result', {
    toolName: 'read',
    input: { path: languageGuideFor('new.ts') },
    isError: false,
  });
  assert.ok(gate.blocked());
  gate.deliver(await gate.load('README.md'));
  assert.equal(gate.blocked(), undefined);
});

test('failed, shortened, missing or changed output never records even the skill', async () => {
  for (const failure of [
    'error',
    'shortened',
    'missing',
    'changed',
    'unissued',
  ]) {
    const gate = harness();
    const loaded = await gate.load('new.ts');
    if (failure === 'shortened') {
      loaded.content = loaded.content.map((part) =>
        part.type === 'text' ? { ...part, text: part.text.slice(0, -1) } : part,
      );
    }
    if (failure === 'missing') {
      loaded.content = loaded.content.slice(0, 1);
    }
    if (failure === 'changed') {
      loaded.content = [
        { type: 'text', text: 'Not a complete skill' },
        ...loaded.content.slice(1),
      ];
    }
    gate.deliver(loaded, {
      id: failure === 'unissued' ? 'other' : 'load',
      isError: failure === 'error',
    });
    assert.ok(gate.blocked(), failure);
    assert.ok(gate.blocked('README.md'), failure);
  }
});

test('validates final delivery after later tool_result handlers run', async () => {
  for (const change of ['none', 'shortened', 'error']) {
    const gate = harness();
    const loaded = await gate.load('new.ts');
    const laterHandler = (): ToolResultEventResult | undefined => {
      if (change === 'shortened') {
        return { content: [{ type: 'text', text: 'truncated' }] };
      }
      if (change === 'error') {
        return { isError: true };
      }
      return undefined;
    };
    gate.handlers.set('tool_result', [
      ...(gate.handlers.get('tool_result') ?? []),
      laterHandler,
    ]);

    const runner = new ExtensionRunner(
      [
        {
          path: 'guidelines-test',
          handlers: gate.handlers,
        } as unknown as Extension,
      ],
      createExtensionRuntime(),
      '/target-project',
      SessionManager.inMemory(),
      {} as ModelRegistry,
    );
    const finalResult = await runner.emitToolResult({
      type: 'tool_result',
      toolName: GUIDELINES_TOOL_NAME,
      toolCallId: 'load',
      input: { path: 'new.ts' },
      isError: false,
      ...loaded,
    });
    assert.ok(gate.blocked('README.md'), 'tool_result alone cannot authorize');
    await runner.emit({
      type: 'tool_execution_end',
      toolName: GUIDELINES_TOOL_NAME,
      toolCallId: 'load',
      isError: finalResult?.isError ?? false,
      result: finalResult ?? loaded,
    });
    assert.equal(gate.blocked() === undefined, change === 'none', change);
    assert.equal(
      gate.blocked('README.md') === undefined,
      change === 'none',
      change,
    );
  }
});

test('nested delivery cannot authorize documents discarded by its caller', async () => {
  const gate = harness();
  const loaded = await gate.load('new.ts', { id: 'outer/1' });
  gate.emit('tool_execution_end', {
    toolName: GUIDELINES_TOOL_NAME,
    toolCallId: 'outer/1',
    parentToolCallId: 'outer',
    isError: false,
    result: loaded,
  });
  assert.ok(gate.blocked());
  assert.ok(gate.blocked('README.md'));
});

test('aborted execution does not create a successful load', async () => {
  const gate = harness();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    gate.load('new.ts', { id: 'aborted', signal: controller.signal }),
    /abort/i,
  );
  gate.emit('tool_result', {
    toolName: GUIDELINES_TOOL_NAME,
    toolCallId: 'aborted',
    isError: true,
    content: [],
  });
  assert.ok(gate.blocked('README.md'));
});

for (const reset of [
  'session_start',
  'before_agent_start',
  'session_compact',
]) {
  test(`${reset} clears loaded documents and pending deliveries`, async () => {
    const gate = harness();
    gate.deliver(await gate.load('new.ts'));
    assert.equal(gate.blocked(), undefined);
    const pending = await gate.load('new.ts', { id: 'pending' });
    gate.emit(reset, { systemPrompt: 'base' });
    assert.ok(gate.blocked());
    gate.deliver(pending, { id: 'pending' });
    assert.ok(gate.blocked('README.md'));
    gate.deliver(await gate.load('new.ts', { id: 'fresh' }), { id: 'fresh' });
    assert.equal(gate.blocked(), undefined);
  });
}

test('full reads still load the skill when the new tool is unused', () => {
  const gate = harness();
  gate.emit('tool_result', {
    toolName: 'read',
    input: { path: GUIDELINE_SKILL_PATH },
    isError: false,
  });
  assert.equal(gate.blocked('README.md'), undefined);
});

test('additional languages deliver only missing complete documents', async () => {
  const gate = harness();
  const first = await gate.load('new.ts');
  gate.deliver(first);
  const additional = await gate.load('new.py', { id: 'python' });
  assert.deepEqual(additional.details, { paths: [languageGuideFor('new.py')] });
  assert.equal(additional.content.length, 1);
  assert.ok(gate.blocked('new.py'));
  gate.deliver(additional, { id: 'python' });
  assert.equal(gate.blocked('new.py'), undefined);
  const repeated = await gate.load('another.ts');
  assert.deepEqual(repeated.details, { paths: [] });
  assert.match(JSON.stringify(repeated.content), /already loaded/);
});

test('a shortened additional guide does not authorize that language', async () => {
  const gate = harness();
  gate.deliver(await gate.load('new.ts'));
  const additional = await gate.load('new.py', { id: 'python' });
  additional.content = [{ type: 'text', text: 'partial document' }];
  gate.deliver(additional, { id: 'python' });
  assert.ok(gate.blocked('new.py'));
  assert.equal(gate.blocked('new.ts'), undefined);
  gate.emit('session_compact');
  const reloaded = await gate.load('new.py');
  assert.deepEqual(reloaded.details, { paths: [GUIDELINE_SKILL_PATH, languageGuideFor('new.py')] });
});
