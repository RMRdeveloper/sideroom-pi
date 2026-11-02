import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { projectRelativePath, resolveFileToolPath } from './file-path.ts';

const WINDOWS_PLATFORM = 'win32';
const NON_WINDOWS_PLATFORM = 'linux';
const PATH_WITH_NULL_BYTE = 'app\0.ts';

function withPlatform(platform: string, run: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    run();
  } finally {
    if (descriptor !== undefined) {
      Object.defineProperty(process, 'platform', descriptor);
    }
  }
}

test('resolves the path aliases accepted by Pi file tools', () => {
  assert.equal(
    resolveFileToolPath('/work', '@src/app.ts'),
    resolve('/work/src/app.ts'),
  );
  assert.equal(
    resolveFileToolPath('/work', '~/app.ts'),
    resolve(homedir(), 'app.ts'),
  );
  assert.equal(
    resolveFileToolPath('/work', 'src/narrow\u202Fspace.ts'),
    resolve('/work/src/narrow space.ts'),
  );
});

test('preserves meaningful whitespace and rejects an empty resolved path', () => {
  assert.equal(
    resolveFileToolPath('/work', ' src/app.ts '),
    resolve('/work/ src/app.ts '),
  );
  assert.equal(resolveFileToolPath('/work', ''), undefined);
  assert.equal(resolveFileToolPath('/work', '@'), undefined);
});

test('canonicalizes existing files across aliases', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-file-path-'));
  try {
    const targetPath = join(cwd, 'target.ts');
    const aliasPath = join(cwd, 'alias.ts');
    writeFileSync(targetPath, 'export {};\n');
    symlinkSync(targetPath, aliasPath);

    const canonicalPath = realpathSync.native(targetPath);
    assert.equal(resolveFileToolPath(cwd, 'alias.ts'), canonicalPath);
    assert.equal(
      resolveFileToolPath(cwd, pathToFileURL(targetPath).href),
      canonicalPath,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('describes a project file relative to the working directory', () => {
  assert.equal(
    projectRelativePath('/work', resolve('/work/src/app.ts')),
    join('src', 'app.ts'),
  );
  assert.equal(
    projectRelativePath('/work', resolve('/work/..hidden.ts')),
    '..hidden.ts',
  );
});

test('refuses a path outside the working directory', () => {
  assert.equal(
    projectRelativePath('/work', resolve('/other/app.ts')),
    undefined,
  );
  assert.equal(projectRelativePath('/work', resolve('/app.ts')), undefined);
  assert.equal(projectRelativePath('/work', resolve('/work')), undefined);
  assert.equal(projectRelativePath('/work', resolve('/work/..')), undefined);
});

test('converts a Windows shell drive path into a drive letter path', () => {
  withPlatform(WINDOWS_PLATFORM, () => {
    assert.equal(
      resolveFileToolPath('/work', '/mnt/c/Users/app.ts'),
      resolve('/work', 'C:\\Users\\app.ts'),
    );
    assert.equal(
      resolveFileToolPath('/work', '/cygdrive/d/temp/app.ts'),
      resolve('/work', 'D:\\temp\\app.ts'),
    );
    assert.equal(
      resolveFileToolPath('/work', '/c/app.ts'),
      resolve('/work', 'C:\\app.ts'),
    );
    assert.equal(resolveFileToolPath('/work', '/mnt/c'), resolve('/work', 'C:\\'));
    assert.equal(resolveFileToolPath('/work', '/mnt/c/'), resolve('/work', 'C:\\'));
    assert.equal(
      resolveFileToolPath('/work', '/c//'),
      resolve('/work', 'C:\\\\'),
    );
  });
});

test('leaves a mounted drive path alone outside Windows', () => {
  withPlatform(NON_WINDOWS_PLATFORM, () => {
    assert.equal(
      resolveFileToolPath('/work', '/mnt/c/Users/app.ts'),
      resolve('/mnt/c/Users/app.ts'),
    );
    assert.equal(resolveFileToolPath('/work', '/c/app.ts'), resolve('/c/app.ts'));
  });
});

test('leaves a Windows path that names no drive alone', () => {
  withPlatform(WINDOWS_PLATFORM, () => {
    assert.equal(
      resolveFileToolPath('/work', '/mnt/data/report.txt'),
      resolve('/mnt/data/report.txt'),
    );
    assert.equal(resolveFileToolPath('/work', '/work/c'), resolve('/work/c'));
    assert.equal(
      resolveFileToolPath('/work', 'src\\app.ts'),
      resolve('/work', 'src\\app.ts'),
    );
  });
});

test('expands a bare home alias and a backslash home alias', () => {
  assert.equal(
    resolveFileToolPath('/work', '~'),
    resolveFileToolPath('/work', homedir()),
  );
  assert.equal(
    resolveFileToolPath('/work', '~\\app.ts'),
    resolveFileToolPath('/work', join(homedir(), 'app.ts')),
  );
});

test('rethrows a path failure that is not a missing path', () => {
  assert.throws(() => resolveFileToolPath('/work', PATH_WITH_NULL_BYTE));
});

test('keeps the resolved path when a parent is a file', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'sideroom-file-path-'));
  try {
    writeFileSync(join(cwd, 'parent.ts'), 'export {};\n');
    assert.equal(
      resolveFileToolPath(cwd, join('parent.ts', 'child.ts')),
      resolve(cwd, 'parent.ts', 'child.ts'),
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('matches a missing file under a symlinked working directory', () => {
  const realRoot = mkdtempSync(join(tmpdir(), 'sideroom-file-root-'));
  const linkRoot = `${realRoot}-link`;
  try {
    symlinkSync(realRoot, linkRoot);
    const missingPath = resolveFileToolPath(linkRoot, 'src/new.ts');
    assert.ok(missingPath);
    assert.equal(
      projectRelativePath(linkRoot, missingPath),
      join('src', 'new.ts'),
    );
  } finally {
    rmSync(linkRoot, { force: true });
    rmSync(realRoot, { recursive: true, force: true });
  }
});
