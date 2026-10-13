import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import packageManifest from '../package.json' with { type: 'json' };
import {
  ARCHIVE_NAME,
  BROWSER_FILES,
  createBrowserArchive,
  validateBrowserPackage,
} from './browser-package/archive.mjs';

const repository = new URL('../', import.meta.url);
const browser = new URL('assets/visual-context/browser/', repository);
const output = new URL('dist/browser/', repository);

async function readPackageFile(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(
      `Browser package inputs must be regular files: ${path.pathname}`,
    );
  }
  return readFile(path);
}

const browserEntries = await Promise.all(
  BROWSER_FILES.map(async (name) => [
    name,
    await readPackageFile(new URL(name, browser)),
  ]),
);
const files = Object.fromEntries([
  ...browserEntries,
  ['LICENSE', await readPackageFile(new URL('LICENSE', repository))],
]);
const archiveInput = { files, releaseVersion: packageManifest.version };
validateBrowserPackage(archiveInput);
const archive = createBrowserArchive(archiveInput);
const checksum = createHash('sha256').update(archive).digest('hex');
await mkdir(output, { recursive: true });
await writeFile(new URL(ARCHIVE_NAME, output), archive);
await writeFile(
  new URL(`${ARCHIVE_NAME}.sha256`, output),
  `${checksum}  ${ARCHIVE_NAME}\n`,
);
process.stdout.write(
  `Packaged Sideroom ${packageManifest.version}: ${ARCHIVE_NAME} (${archive.length} bytes).\n`,
);
