import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import registerMonorepoSkills from './index.ts';
import { MONOREPO_SKILLS_NOTE_HEADING } from './prompt.ts';

type EventHandler = (event: never, ctx: never) => unknown;

function register(): Map<string, EventHandler> {
  const handlers = new Map<string, EventHandler>();
  const api = {
    on(name: string, handler: EventHandler) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;
  registerMonorepoSkills(api);
  return handlers;
}

function handlerOf(
  handlers: Map<string, EventHandler>,
  name: string,
): EventHandler {
  const handler = handlers.get(name);
  assert.ok(handler, name);
  return handler;
}

function context(cwd: string, trusted: boolean): never {
  return {
    cwd,
    isProjectTrusted: () => trusted,
  } as never;
}

test('discovers trusted child skills and appends a stable note', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-monorepo-skills-'));
  try {
    const skillDirectory = join(cwd, 'api/.pi/skills/api-guide');
    mkdirSync(skillDirectory, { recursive: true });
    writeFileSync(join(skillDirectory, 'SKILL.md'), 'body');

    const handlers = register();
    const resourcesDiscover = handlerOf(handlers, 'resources_discover');
    const beforeAgentStart = handlerOf(handlers, 'before_agent_start');
    const ctx = context(cwd, true);
    const discovered = resourcesDiscover({ cwd } as never, ctx) as {
      skillPaths: string[];
    };
    assert.deepEqual(discovered.skillPaths, [join(cwd, 'api/.pi/skills')]);

    const first = beforeAgentStart(
      { systemPrompt: 'base prompt' } as never,
      ctx,
    ) as { systemPrompt: string };
    assert.equal(
      first.systemPrompt.includes(MONOREPO_SKILLS_NOTE_HEADING),
      true,
    );
    assert.equal(
      beforeAgentStart({ systemPrompt: first.systemPrompt } as never, ctx),
      undefined,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('does not discover skills or change the prompt for an untrusted project', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-monorepo-skills-'));
  try {
    const skillDirectory = join(cwd, 'api/.pi/skills/api-guide');
    mkdirSync(skillDirectory, { recursive: true });
    writeFileSync(join(skillDirectory, 'SKILL.md'), 'body');

    const handlers = register();
    const ctx = context(cwd, false);
    assert.equal(
      handlerOf(handlers, 'resources_discover')({ cwd } as never, ctx),
      undefined,
    );
    assert.equal(
      handlerOf(handlers, 'before_agent_start')(
        { systemPrompt: 'base prompt' } as never,
        ctx,
      ),
      undefined,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('clears the prompt note when a later discovery finds no child skills', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-monorepo-skills-'));
  try {
    const skillDirectory = join(cwd, 'api/.pi/skills/api-guide');
    mkdirSync(skillDirectory, { recursive: true });
    writeFileSync(join(skillDirectory, 'SKILL.md'), 'body');

    const handlers = register();
    const resourcesDiscover = handlerOf(handlers, 'resources_discover');
    const beforeAgentStart = handlerOf(handlers, 'before_agent_start');
    const ctx = context(cwd, true);
    resourcesDiscover({ cwd } as never, ctx);
    rmSync(join(cwd, 'api'), { recursive: true, force: true });
    assert.equal(resourcesDiscover({ cwd } as never, ctx), undefined);
    assert.equal(
      beforeAgentStart({ systemPrompt: 'base prompt' } as never, ctx),
      undefined,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
