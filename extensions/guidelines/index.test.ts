import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { LANGUAGE_GUIDES } from './catalog.ts';
import {
  createGuidelineReadState,
  GUIDELINE_SKILL_PATH,
  mutationBlockReason,
} from './guard.ts';
import registerGuidelines from './index.ts';
import { GUIDELINES_REMINDER_HEADING } from './prompt.ts';

test('injects the guidelines reminder once per system prompt', () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  assert.ok(beforeAgentStart);

  const first = beforeAgentStart({ systemPrompt: 'base prompt' } as never) as {
    systemPrompt?: string;
  };
  assert.match(first.systemPrompt ?? '', /base prompt/);
  assert.equal(
    (first.systemPrompt ?? '').includes(GUIDELINES_REMINDER_HEADING),
    true,
  );
  assert.match(first.systemPrompt ?? '', /sideroom-guidelines/);

  const second = beforeAgentStart({
    systemPrompt: first.systemPrompt ?? '',
  } as never);
  assert.equal(second, undefined);
});

test('requires completed reads before a later tool round can mutate', () => {
  const handlers = new Map<string, EventHandler>();
  let activeTools = ['read', 'edit', 'write'];
  const api = {
    getActiveTools: () => activeTools,
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(beforeAgentStart);
  assert.ok(toolCall);
  assert.ok(toolResult);

  const cwd = process.cwd();
  const typescriptGuidePath = join(
    dirname(GUIDELINE_SKILL_PATH),
    'references/languages/typescript.md',
  );
  const typescriptWrite = {
    toolName: 'write',
    input: { path: 'src/example.ts' },
  } as never;

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  const beforeReads = toolCall(typescriptWrite) as GuardResult;
  assert.equal(beforeReads?.block, true);
  assert.match(beforeReads?.reason ?? '', /SKILL\.md/);
  assert.match(beforeReads?.reason ?? '', /typescript\.md/);

  toolResult(
    {
      toolName: 'read',
      input: { path: GUIDELINE_SKILL_PATH, limit: 1 },
      isError: false,
    } as never,
    { cwd } as never,
  );
  toolResult(
    {
      toolName: 'read',
      input: { path: '/tmp/skills/sideroom-guidelines/SKILL.md' },
      isError: false,
    } as never,
    { cwd } as never,
  );
  toolResult(
    {
      toolName: 'read',
      input: { path: GUIDELINE_SKILL_PATH },
      isError: true,
    } as never,
    { cwd } as never,
  );
  toolResult(
    {
      toolName: 'read',
      input: { path: GUIDELINE_SKILL_PATH },
      isError: false,
      details: { truncation: { truncated: true } },
    } as never,
    { cwd } as never,
  );
  assert.match(
    (toolCall(typescriptWrite) as GuardResult)?.reason ?? '',
    /SKILL\.md/,
  );

  toolResult(
    {
      toolName: 'read',
      input: { path: `@${GUIDELINE_SKILL_PATH}` },
      isError: false,
    } as never,
    { cwd } as never,
  );
  const beforeLanguageGuide = toolCall({
    toolName: 'edit',
    input: { path: 'src/example.tsx' },
  } as never) as GuardResult;
  assert.equal(beforeLanguageGuide?.block, true);
  assert.doesNotMatch(beforeLanguageGuide?.reason ?? '', /SKILL\.md/);
  assert.match(beforeLanguageGuide?.reason ?? '', /typescript\.md/);

  toolResult(
    {
      toolName: 'read',
      input: { path: typescriptGuidePath, offset: 2 },
      isError: false,
    } as never,
    { cwd } as never,
  );
  assert.match(
    (toolCall(typescriptWrite) as GuardResult)?.reason ?? '',
    /typescript\.md/,
  );

  toolResult(
    {
      toolName: 'read',
      input: { path: typescriptGuidePath },
      isError: false,
    } as never,
    { cwd } as never,
  );
  assert.equal(toolCall(typescriptWrite), undefined);

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  activeTools = ['edit', 'write'];
  const inactiveRead = toolCall({
    toolName: 'write',
    input: { path: 'README.md' },
  } as never) as GuardResult;
  assert.equal(inactiveRead?.block, true);
  assert.match(inactiveRead?.reason ?? '', /read tool is inactive/);
});

test('resolves relative and dotted guide paths against the session cwd', () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    getActiveTools: () => ['read', 'edit', 'write'],
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(beforeAgentStart);
  assert.ok(toolCall);
  assert.ok(toolResult);

  const packageRoot = resolve(dirname(GUIDELINE_SKILL_PATH), '../..');
  const typescriptWrite = {
    toolName: 'write',
    input: { path: 'src/example.ts' },
  } as never;

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);

  toolResult(
    {
      toolName: 'read',
      input: {
        path: './skills/sideroom-guidelines/../sideroom-guidelines/SKILL.md',
      },
      isError: false,
    } as never,
    { cwd: packageRoot } as never,
  );
  toolResult(
    {
      toolName: 'read',
      input: {
        path: 'skills/sideroom-guidelines/references/languages/../languages/typescript.md',
      },
      isError: false,
    } as never,
    { cwd: packageRoot } as never,
  );
  assert.equal(toolCall(typescriptWrite), undefined);
});

test('resolves symlinked guide paths to the catalog location', {
  skip: process.platform === 'win32',
}, () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    getActiveTools: () => ['read', 'edit', 'write'],
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  assert.ok(beforeAgentStart);
  assert.ok(toolCall);
  assert.ok(toolResult);

  const packageRoot = resolve(dirname(GUIDELINE_SKILL_PATH), '../..');
  const typescriptWrite = {
    toolName: 'write',
    input: { path: 'src/example.ts' },
  } as never;

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  toolResult(
    {
      toolName: 'read',
      input: { path: GUIDELINE_SKILL_PATH },
      isError: false,
    } as never,
    { cwd: packageRoot } as never,
  );

  const linkRoot = mkdtempSync(join(tmpdir(), 'sideroom-guidelines-'));
  try {
    const linkedLanguages = join(linkRoot, 'languages');
    symlinkSync(
      join(packageRoot, 'skills/sideroom-guidelines/references/languages'),
      linkedLanguages,
      'dir',
    );
    toolResult(
      {
        toolName: 'read',
        input: { path: join(linkedLanguages, 'typescript.md') },
        isError: false,
      } as never,
      { cwd: packageRoot } as never,
    );
  } finally {
    rmSync(linkRoot, { recursive: true, force: true });
  }

  assert.equal(toolCall(typescriptWrite), undefined);
});

test('resets the gate after compaction so stale reads cannot authorize mutations', () => {
  const handlers = new Map<string, EventHandler>();
  const api = {
    getActiveTools: () => ['read', 'edit', 'write'],
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  registerGuidelines(api);
  const beforeAgentStart = handlers.get('before_agent_start');
  const toolCall = handlers.get('tool_call');
  const toolResult = handlers.get('tool_result');
  const sessionCompact = handlers.get('session_compact');
  assert.ok(beforeAgentStart);
  assert.ok(toolCall);
  assert.ok(toolResult);
  assert.ok(sessionCompact);

  const cwd = process.cwd();
  const typescriptGuidePath = join(
    dirname(GUIDELINE_SKILL_PATH),
    'references/languages/typescript.md',
  );
  const typescriptWrite = {
    toolName: 'write',
    input: { path: 'src/example.ts' },
  } as never;

  beforeAgentStart({ systemPrompt: 'base prompt' } as never);
  toolResult(
    {
      toolName: 'read',
      input: { path: GUIDELINE_SKILL_PATH },
      isError: false,
    } as never,
    { cwd } as never,
  );
  toolResult(
    {
      toolName: 'read',
      input: { path: typescriptGuidePath },
      isError: false,
    } as never,
    { cwd } as never,
  );
  assert.equal(toolCall(typescriptWrite), undefined);

  sessionCompact({ reason: 'threshold' } as never);
  const afterCompaction = toolCall(typescriptWrite) as GuardResult;
  assert.equal(afterCompaction?.block, true);
  assert.match(afterCompaction?.reason ?? '', /SKILL\.md/);
  assert.match(afterCompaction?.reason ?? '', /typescript\.md/);
});

test('maps every catalog extension to its language guide', () => {
  const readState = createGuidelineReadState();
  readState.skillRead = true;

  for (const guide of LANGUAGE_GUIDES) {
    for (const extension of guide.extensions) {
      const reason = mutationBlockReason(readState, `src/example${extension}`);
      assert.equal(reason?.includes(guide.fileName), true, guide.fileName);
    }
  }
});

type EventHandler = (event: never, ctx?: never) => unknown;
type GuardResult = { block?: boolean; reason?: string } | undefined;
