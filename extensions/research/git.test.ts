import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import { researchGit } from './git.ts';
import { createResearchReader } from './reader.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

test('reads a bounded diff and recent history only for an allowed file', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-git-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd });
    await writeFile(join(cwd, 'source.ts'), 'before\n');
    execFileSync('git', ['add', 'source.ts'], { cwd });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'initial subject'], { cwd });
    await writeFile(join(cwd, 'source.ts'), 'after\n');
    const marker = join(cwd, 'unexpected-execution');
    execFileSync('git', ['config', 'diff.external', `touch ${marker}`], { cwd });
    execFileSync('git', ['config', 'core.fsmonitor', `touch ${marker}`], { cwd });
    await symlink('source.ts', join(cwd, 'linked.ts'));
    const indexBefore = await readFile(join(cwd, '.git', 'index'));
    const seen: string[] = [];
    const reader = await createResearchReader(cwd, { onRead: (file) => seen.push(file.path) });
    const diff = await researchGit({ cwd, reader, request: { operation: 'diff', path: 'source.ts' } });
    assert.match(diff, /-before/u);
    assert.match(diff, /\+after/u);
    const history = await researchGit({ cwd, reader, request: { operation: 'history', path: 'source.ts' } });
    assert.match(history, /initial subject/u);
    assert.equal(existsSync(marker), false);
    assert.deepEqual(await readFile(join(cwd, '.git', 'index')), indexBefore);
    assert.equal(await readFile(join(cwd, 'source.ts'), 'utf8'), 'after\n');
    assert.deepEqual(seen, ['source.ts', 'source.ts']);
    await assert.rejects(researchGit({ cwd, reader, request: { operation: 'diff', path: '../outside' } }), /outside the project/u);
    await assert.rejects(researchGit({ cwd, reader, request: { operation: 'diff', path: 'linked.ts' } }), /Symbolic links/u);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('restricts Git to a worktree containing the selected project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'sideroom-research-git-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'sideroom-research-git-outside-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    const cwd = join(root, 'child');
    await mkdir(cwd);
    await writeFile(join(cwd, 'source.ts'), 'before\n');
    execFileSync('git', ['add', 'child/source.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'first'], { cwd: root });
    await writeFile(join(cwd, 'source.ts'), 'after\n');
    const reader = await createResearchReader(cwd);
    const diff = await researchGit({ cwd, reader, request: { operation: 'diff', path: 'source.ts' } });
    assert.match(diff, /-before/u);
    assert.match(diff, /\+after/u);
    execFileSync('git', ['config', 'core.worktree', outside], { cwd: root });
    await assert.rejects(researchGit({ cwd, reader, request: { operation: 'diff', path: 'source.ts' } }));
  } finally {
    await rm(root, { force: true, recursive: true });
    await rm(outside, { force: true, recursive: true });
  }
});
