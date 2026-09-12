// The contract between this generator and the published manifest: the gallery
// resolves pi.image and pi.video from npm, so those URLs have to keep pointing
// at the files the script writes.

export const IMAGE_FILE_NAME = 'preview.png';
export const VIDEO_FILE_NAME = 'preview.mp4';

const IMAGE_KEY = 'image';
const VIDEO_KEY = 'video';

function readPathname(url, key) {
  try {
    return new URL(url).pathname;
  } catch (error) {
    throw new Error(`pi.${key} is not a valid URL: ${url}`, { cause: error });
  }
}

function fileNameFromUrl(url, key) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(`package.json declares no pi.${key} URL`);
  }
  const pathname = readPathname(url, key);
  return pathname.slice(pathname.lastIndexOf('/') + 1);
}

export function declaredMediaFileNames(manifest) {
  const { pi } = manifest;
  if (pi === undefined) {
    throw new Error('package.json declares no pi manifest');
  }
  return {
    image: fileNameFromUrl(pi[IMAGE_KEY], IMAGE_KEY),
    video: fileNameFromUrl(pi[VIDEO_KEY], VIDEO_KEY),
  };
}

export function assertDeclaredMediaMatches(manifest, produced) {
  const declared = declaredMediaFileNames(manifest);
  if (declared.image !== produced.image || declared.video !== produced.video) {
    throw new Error(
      `pi.image/pi.video declare ${declared.image}/${declared.video}, not ${produced.image}/${produced.video}`,
    );
  }
}
