import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import { createResearchReader } from './reader.ts';
import { searchResearchFiles } from './search.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

test('searches only the specified visible excerpts and reports unreadable files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-search-'));
  try {
    await writeFile(join(cwd, 'one.ts'), 'first\nfind me\n');
    await writeFile(join(cwd, 'two.ts'), `${Array.from({ length: 200 }, () => 'other').join('\n')}\nfind me`);
    const reader = await createResearchReader(cwd);
    const matches = await searchResearchFiles(reader, { paths: ['one.ts', 'two.ts', 'missing.ts'], text: 'find me' });
    assert.match(matches, /"one.ts": 2: find me/u);
    assert.doesNotMatch(matches, /"two.ts": \d+: find me/u);
    assert.match(matches, /"missing.ts": could not read/u);
    assert.match(matches, /at most 200 lines.*starting at line 1/u);
    const later = await searchResearchFiles(reader, { paths: ['two.ts'], text: 'find me', offset: 201 });
    assert.match(later, /"two.ts": 201: find me/u);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('searches file contents rather than line numbers or formatting and finds text past the display limit', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-search-long-'));
  try {
    await writeFile(join(cwd, 'long.ts'), `nothing\n${'a'.repeat(2_500)}needle${'b'.repeat(1_000)}\n`);
    const reader = await createResearchReader(cwd);
    const number = await searchResearchFiles(reader, { paths: ['long.ts'], text: '1' });
    assert.doesNotMatch(number, /"long.ts": 1:/u);
    const marker = await searchResearchFiles(reader, { paths: ['long.ts'], text: '[line truncated]' });
    assert.doesNotMatch(marker, /"long.ts": 2:/u);
    const found = await searchResearchFiles(reader, { paths: ['long.ts'], text: 'needle' });
    assert.match(found, /"long.ts": 2: \[\.\.\.\].*needle/u);
    assert.match(found, /\[match shortened\]/u);
    assert.ok(found.length < 700);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('keeps a complete line that fits even when the match is near its end', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-search-short-'));
  try {
    const line = `${'a'.repeat(390)}needle`;
    await writeFile(join(cwd, 'short.ts'), line);
    const reader = await createResearchReader(cwd);
    const found = await searchResearchFiles(reader, { paths: ['short.ts'], text: 'needle' });
    assert.ok(found.includes(`"short.ts": 1: ${line}`));
    assert.doesNotMatch(found, /\[\.\.\.\]/u);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('reports when matching output is capped and honours cancellation', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-search-'));
  try {
    await writeFile(join(cwd, 'many.ts'), Array.from({ length: 51 }, () => 'match').join('\n'));
    const reader = await createResearchReader(cwd);
    const matches = await searchResearchFiles(reader, { paths: ['many.ts'], text: 'match' });
    assert.match(matches, /Stopped after 50 matches/u);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(searchResearchFiles(reader, { paths: ['many.ts'], text: 'match' }, controller.signal));
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
