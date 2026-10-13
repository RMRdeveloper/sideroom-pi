import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { unzipSync } from 'fflate';
import {
  ARCHIVE_FOLDER,
  BROWSER_FILES,
  createBrowserArchive,
  validateBrowserPackage,
} from './archive.mjs';

const repository = new URL('../../', import.meta.url);
const browser = new URL('assets/visual-context/browser/', repository);
const files = Object.fromEntries([
  ...BROWSER_FILES.map((name) => [name, readFileSync(new URL(name, browser))]),
  ['LICENSE', readFileSync(new URL('LICENSE', repository))],
]);
const releaseVersion = '8.13.0';

test('archive contains exactly the installable companion, instructions, licence and release identity', () => {
  validateBrowserPackage({ files, releaseVersion });
  const archive = createBrowserArchive({ files, releaseVersion });
  const unpacked = unzipSync(archive);
  assert.deepEqual(
    Object.keys(unpacked).sort(),
    [
      ...Object.keys(files).map((name) => `${ARCHIVE_FOLDER}/${name}`),
      `${ARCHIVE_FOLDER}/release.json`,
    ].sort(),
  );
  for (const [name, contents] of Object.entries(files)) {
    assert.deepEqual(
      Buffer.from(unpacked[`${ARCHIVE_FOLDER}/${name}`]),
      contents,
    );
  }
  assert.deepEqual(
    JSON.parse(
      Buffer.from(unpacked[`${ARCHIVE_FOLDER}/release.json`]).toString('utf8'),
    ),
    { sideroomVersion: releaseVersion },
  );
  const manifest = JSON.parse(
    Buffer.from(unpacked[`${ARCHIVE_FOLDER}/manifest.json`]).toString('utf8'),
  );
  assert.equal(
    manifest.commands['toggle-inspector'].suggested_key,
    'Alt+Shift+S',
  );
  assert.equal(manifest.host_permissions, undefined);
});

test('packaging is deterministic and does not mutate input files', () => {
  const names = Object.keys(files);
  const reversed = Object.fromEntries(Object.entries(files).reverse());
  assert.deepEqual(
    createBrowserArchive({ files, releaseVersion }),
    createBrowserArchive({ files: reversed, releaseVersion }),
  );
  assert.deepEqual(Object.keys(files), names);
});

test('packaging rejects missing or empty companion files', () => {
  for (const name of Object.keys(files)) {
    const incomplete = { ...files, [name]: new Uint8Array() };
    assert.throws(
      () => validateBrowserPackage({ files: incomplete, releaseVersion }),
      /Missing or empty/u,
    );
  }
});

test('packaging rejects extra files, including credentials and path traversal', () => {
  for (const name of [
    '.env',
    'connection.json',
    '../secret',
    'node_modules/helper.js',
  ]) {
    assert.throws(
      () =>
        validateBrowserPackage({
          files: { ...files, [name]: Buffer.from('private') },
          releaseVersion,
        }),
      /Unexpected browser package file/u,
    );
  }
});

test('packaging rejects an invalid release or broken manifest references', () => {
  for (const version of ['', 'latest', '8.13.0-beta.1', '../8.13.0']) {
    assert.throws(
      () => validateBrowserPackage({ files, releaseVersion: version }),
      /stable Sideroom release version/u,
    );
  }
  const manifest = JSON.parse(files['manifest.json'].toString('utf8'));
  const broken = {
    ...files,
    'manifest.json': Buffer.from(
      JSON.stringify({
        ...manifest,
        background: { service_worker: 'missing.js' },
      }),
    ),
  };
  assert.throws(
    () => validateBrowserPackage({ files: broken, releaseVersion }),
    /unpackaged file/u,
  );
  assert.throws(
    () =>
      validateBrowserPackage({
        files: { ...files, 'manifest.json': Buffer.from('{') },
        releaseVersion,
      }),
    (error) =>
      error instanceof Error &&
      error.message === 'Cannot parse the browser manifest.' &&
      error.cause instanceof SyntaxError,
  );
});
