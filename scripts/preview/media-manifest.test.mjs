import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assertDeclaredMediaMatches,
  declaredMediaFileNames,
  IMAGE_FILE_NAME,
  VIDEO_FILE_NAME,
} from './media-manifest.mjs';

const MEDIA_BASE =
  'https://raw.githubusercontent.com/RMRdeveloper/sideroom-pi/main/media';

function manifestDeclaring(image, video) {
  return { pi: { extensions: ['./extensions'], image, video } };
}

const PRODUCED = { image: IMAGE_FILE_NAME, video: VIDEO_FILE_NAME };

test('reads the file names out of the declared URLs', () => {
  const declared = declaredMediaFileNames(
    manifestDeclaring(`${MEDIA_BASE}/preview.png`, `${MEDIA_BASE}/preview.mp4`),
  );

  assert.deepEqual(declared, PRODUCED);
});

test('rejects a manifest without a pi block', () => {
  assert.throws(() => declaredMediaFileNames({}), /no pi manifest/);
});

test('rejects a missing pi.image URL', () => {
  const manifest = manifestDeclaring(undefined, `${MEDIA_BASE}/preview.mp4`);

  assert.throws(() => declaredMediaFileNames(manifest), /pi\.image/);
});

test('rejects a URL that cannot be parsed', () => {
  const manifest = manifestDeclaring('not a url', `${MEDIA_BASE}/preview.mp4`);

  assert.throws(() => declaredMediaFileNames(manifest), /not a valid URL/);
});

test('accepts the files this generator produces', () => {
  const manifest = manifestDeclaring(
    `${MEDIA_BASE}/preview.png`,
    `${MEDIA_BASE}/preview.mp4`,
  );

  assert.doesNotThrow(() => assertDeclaredMediaMatches(manifest, PRODUCED));
});

test('rejects a manifest pointing at other files', () => {
  const manifest = manifestDeclaring(
    `${MEDIA_BASE}/social.png`,
    `${MEDIA_BASE}/preview.mp4`,
  );

  assert.throws(
    () => assertDeclaredMediaMatches(manifest, PRODUCED),
    /social\.png/,
  );
});
