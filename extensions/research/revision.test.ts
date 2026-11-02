import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import { readResearchRevision } from './revision.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

test('reads the current project commit without changing it', async () => {
  const revision = await readResearchRevision(process.cwd());
  assert.match(revision.revision ?? '', /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
  assert.equal(revision.warning, undefined);
});

test('reports when the project has no Git revision', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-revision-'));
  try {
    const revision = await readResearchRevision(cwd);
    assert.equal(revision.revision, null);
    assert.match(revision.warning ?? '', /Git revision unavailable/u);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('does not run Git when the request is already cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readResearchRevision(process.cwd(), controller.signal));
});
