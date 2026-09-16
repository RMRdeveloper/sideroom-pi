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
import { resolveFileToolPath } from './file-path.ts';

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
    resolveFileToolPath('/work', `src/narrow\u202Fspace.ts`),
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
