import { zipSync } from 'fflate';

export const ARCHIVE_NAME = 'sideroom-browser-extension.zip';
export const ARCHIVE_FOLDER = 'sideroom-browser-extension';
export const BROWSER_FILES = Object.freeze([
  'INSTALL.md',
  'background.js',
  'content.js',
  'destinations.js',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'manifest.json',
  'popup.css',
  'popup.html',
  'popup.js',
]);
const PACKAGE_FILES = [...BROWSER_FILES, 'LICENSE'];
const ARCHIVE_DATE = new Date(2000, 0, 1);

export function validateBrowserPackage({ files, releaseVersion }) {
  if (!/^\d+\.\d+\.\d+$/u.test(releaseVersion)) {
    throw new Error(
      'The browser package needs a stable Sideroom release version.',
    );
  }
  for (const name of PACKAGE_FILES) {
    if (!(files[name] instanceof Uint8Array) || files[name].length === 0) {
      throw new Error(`Missing or empty browser package file: ${name}`);
    }
  }
  for (const name of Object.keys(files)) {
    if (!PACKAGE_FILES.includes(name)) {
      throw new Error(`Unexpected browser package file: ${name}`);
    }
  }
  let manifest;
  try {
    manifest = JSON.parse(Buffer.from(files['manifest.json']).toString('utf8'));
  } catch (cause) {
    throw new Error('Cannot parse the browser manifest.', { cause });
  }
  if (manifest.manifest_version !== 3) {
    throw new Error('The browser package must use Manifest V3.');
  }
  const referenced = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
  ];
  for (const name of referenced) {
    if (!name || !files[name]) {
      throw new Error(
        `The manifest references an unpackaged file: ${String(name)}`,
      );
    }
  }
}

export function createBrowserArchive({ files, releaseVersion }) {
  const contents = {
    ...files,
    'release.json': Buffer.from(
      `${JSON.stringify({ sideroomVersion: releaseVersion })}\n`,
    ),
  };
  const entries = Object.fromEntries(
    Object.keys(contents)
      .sort()
      .map((name) => [
        `${ARCHIVE_FOLDER}/${name}`,
        [contents[name], { mtime: ARCHIVE_DATE }],
      ]),
  );
  return zipSync(entries, { level: 9 });
}
