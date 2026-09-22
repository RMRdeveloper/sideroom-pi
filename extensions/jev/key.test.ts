import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  clearStoredKey,
  configPathFor,
  readStoredKey,
  resolveApiKey,
  storeApiKey,
} from './key.ts';

function withTempDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-jev-key-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('the environment wins over the stored config', () => {
  withTempDirectory((directory) => {
    const configPath = configPathFor(directory);
    storeApiKey(configPath, 'stored-key');

    assert.deepEqual(
      resolveApiKey({ TYPESAFE_API_KEY: 'environment-key' }, configPath),
      { key: 'environment-key', origin: 'environment' },
    );
    assert.deepEqual(resolveApiKey({}, configPath), {
      key: 'stored-key',
      origin: 'config',
    });
  });
});

test('ignores a blank environment variable', () => {
  withTempDirectory((directory) => {
    const configPath = configPathFor(directory);
    storeApiKey(configPath, 'stored-key');
    assert.deepEqual(resolveApiKey({ TYPESAFE_API_KEY: '   ' }, configPath), {
      key: 'stored-key',
      origin: 'config',
    });
  });
});

test('stores the key owner-only, outside any project', () => {
  withTempDirectory((directory) => {
    const configPath = configPathFor(directory);
    storeApiKey(configPath, 'stored-key');

    assert.equal(statSync(directory).mode & 0o777, 0o700);
    assert.equal(statSync(configPath).mode & 0o777, 0o600);
    assert.equal(configPath.startsWith(directory), true);
  });
});

test('a missing or malformed config means no key', () => {
  withTempDirectory((directory) => {
    const configPath = configPathFor(directory);

    assert.equal(readStoredKey(configPath), undefined);
    assert.equal(resolveApiKey({}, configPath), undefined);

    writeFileSync(configPath, 'not json');
    assert.equal(readStoredKey(configPath), undefined);

    writeFileSync(configPath, '{"jevApiKey":42}');
    assert.equal(readStoredKey(configPath), undefined);

    writeFileSync(configPath, '{"jevApiKey":"   "}');
    assert.equal(readStoredKey(configPath), undefined);
  });
});

test('clearing removes the file and leaves the rest alone', () => {
  withTempDirectory((directory) => {
    const configPath = configPathFor(directory);
    storeApiKey(configPath, 'stored-key');
    clearStoredKey(configPath);
    assert.equal(readStoredKey(configPath), undefined);

    clearStoredKey(configPath);
    assert.equal(readStoredKey(configPath), undefined);
  });
});
