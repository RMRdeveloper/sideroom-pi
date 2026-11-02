import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { isMissingFile, readFileIfExists } from './read-file.ts';

const MISSING_FILE_CODE = 'ENOENT';

test('reads a file that exists', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-read-file-'));
  try {
    const path = join(directory, 'existing.ts');
    writeFileSync(path, 'const a = 1;\n');
    assert.equal(readFileIfExists(path), 'const a = 1;\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('returns undefined when the file is not there', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-read-file-'));
  try {
    assert.equal(readFileIfExists(join(directory, 'missing.ts')), undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('rethrows a failure that is not a missing file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-read-file-'));
  try {
    assert.throws(
      () => readFileIfExists(directory),
      (error: unknown) => !isMissingFile(error),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('treats only a real error carrying the missing file code as missing', () => {
  assert.equal(isMissingFile({ code: MISSING_FILE_CODE }), false);
  assert.equal(isMissingFile(MISSING_FILE_CODE), false);
  assert.equal(isMissingFile(undefined), false);
  assert.equal(isMissingFile(new Error('missing')), false);
  assert.equal(
    isMissingFile(Object.assign(new Error('missing'), { code: MISSING_FILE_CODE })),
    true,
  );
});
