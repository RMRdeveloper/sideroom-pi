import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeTest from 'node:test';
import { createResearchEvidence, verifyResearchEvidence } from './evidence.ts';
import { createResearchReader } from './reader.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

test('records the bytes actually read and detects later changes outside the displayed excerpt', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-evidence-'));
  try {
    const path = join(cwd, 'source.ts');
    const original = `${Array.from({ length: 200 }, () => 'line').join('\n')}\noriginal`;
    await writeFile(path, original);
    const evidence = createResearchEvidence();
    const reader = await createResearchReader(cwd, { onRead: evidence.observe });
    const excerpt = await reader.read('./source.ts');
    assert.doesNotMatch(excerpt, /original/u);
    const snapshot = evidence.snapshot();
    assert.equal(snapshot.files[0]?.path, 'source.ts');
    assert.match(snapshot.files[0]?.sha256 ?? '', /^[a-f0-9]{64}$/u);
    assert.deepEqual(await verifyResearchEvidence({ cwd, files: snapshot.files }), [{ path: 'source.ts', status: 'unchanged' }]);
    await writeFile(path, original.replace('original', 'changed'));
    assert.deepEqual(await verifyResearchEvidence({ cwd, files: snapshot.files }), [{ path: 'source.ts', status: 'changed' }]);
    await reader.read('source.ts');
    assert.deepEqual(evidence.snapshot().changedDuringResearch, ['source.ts']);
    await rm(path);
    const checks = await verifyResearchEvidence({ cwd, files: snapshot.files });
    assert.equal(checks[0]?.status, 'unavailable');
    assert.ok(checks[0]?.error);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});

test('keeps the first fingerprint and bounds the number of files', () => {
  const evidence = createResearchEvidence();
  evidence.observe({ path: 'one.ts', sha256: 'first' });
  evidence.observe({ path: 'one.ts', sha256: 'second' });
  assert.deepEqual(evidence.snapshot(), {
    files: [{ path: 'one.ts', sha256: 'first' }],
    changedDuringResearch: ['one.ts'],
  });
  for (let index = 1; index < 200; index += 1) {
    evidence.observe({ path: `${String(index)}.ts`, sha256: 'hash' });
  }
  assert.throws(() => evidence.observe({ path: 'extra.ts', sha256: 'hash' }), /200-file/u);
});

test('does not record failed or cancelled reads', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'sideroom-research-evidence-'));
  try {
    await writeFile(join(cwd, 'binary.dat'), Buffer.from([0]));
    const evidence = createResearchEvidence();
    const reader = await createResearchReader(cwd, { onRead: evidence.observe });
    await assert.rejects(reader.read('binary.dat'), /Binary files/u);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(reader.read('binary.dat', controller.signal));
    await assert.rejects(verifyResearchEvidence({ cwd, files: [{ path: 'binary.dat', sha256: 'hash' }], signal: controller.signal }));
    assert.deepEqual(evidence.snapshot().files, []);
  } finally {
    await rm(cwd, { force: true, recursive: true });
  }
});
