import assert from 'node:assert/strict';
import fs, { type Stats } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, mkdir, open, readdir, readFile, readlink, rename, rm, stat, symlink, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import nodeTest from 'node:test';
import { createResearchReader } from './reader.ts';

const test = process.platform === 'linux' ? nodeTest : nodeTest.skip;

async function withProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'sideroom-research-'));
  try {
    await run(root);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

test('lists and reads project files without changing them', async () => {
  await withProject(async (root) => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'main.ts'), 'one\ntwo');
    const reader = await createResearchReader(root);
    assert.equal(await reader.list('.'), 'src/');
    assert.equal(await reader.read('src/main.ts'), '1: one\n2: two');
    assert.equal(await readFile(join(root, 'src', 'main.ts'), 'utf8'), 'one\ntwo');
  });
});

test('rejects outside paths, Git metadata and symbolic links', async () => {
  await withProject(async (root) => {
    await writeFile(join(root, '.env'), 'secret');
    await writeFile(join(root, '.notes'), 'hidden');
    await writeFile(join(root, 'api-key.txt'), 'secret');
    await writeFile(join(root, 'visible.txt'), 'visible');
    await mkdir(join(root, '.git'));
    await symlink(root, join(root, 'external'));
    const reader = await createResearchReader(root);
    assert.equal(await reader.list('.'), '.env\n.notes\napi-key.txt\nvisible.txt');
    await assert.rejects(reader.read(join(root, 'visible.txt')), /Use a path relative/u);
    await assert.rejects(reader.read('..'), /outside the project/u);
    await assert.rejects(reader.read(`../${basename(dirname(root))}`), /outside the project/u);
    assert.equal(await reader.read('.env'), '1: secret');
    await assert.rejects(reader.read('.git/config'), /not available/u);
    await assert.rejects(reader.read('external/visible.txt'), /Symbolic links/u);
  });
});

test('rejects a project root replaced after the reader was created', async () => {
  await withProject(async (parent) => {
    const root = join(parent, 'project');
    await mkdir(root);
    await writeFile(join(root, 'file.txt'), 'original');
    const reader = await createResearchReader(root);
    await rename(root, join(parent, 'original'));
    await mkdir(root);
    await writeFile(join(root, 'file.txt'), 'replacement');
    await assert.rejects(reader.read('file.txt'), /project directory changed/u);
  });
});

test('rejects a directory swapped for an outside link during path resolution', async (t) => {
  await withProject(async (root) => {
    const source = join(root, 'src');
    const outside = await mkdtemp(join(tmpdir(), 'sideroom-research-outside-'));
    try {
      await mkdir(source);
      await writeFile(join(source, 'file.txt'), 'inside');
      await writeFile(join(outside, 'file.txt'), 'outside');
      const reader = await createResearchReader(root);
      const probe = await open(join(source, 'file.txt'), 'r');
      const prototype = Object.getPrototypeOf(probe) as FileHandle;
      const originalStat = prototype.stat;
      await probe.close();
      let swapped = false;
      t.mock.method(prototype as unknown as { stat(): Promise<Stats> }, 'stat', async function (this: FileHandle) {
        const identity = await originalStat.call(this);
        if (!swapped) {
          swapped = true;
          await rename(source, join(root, 'old-src'));
          await symlink(outside, source);
        }
        return identity;
      });
      await assert.rejects(reader.read('src/file.txt'), /Symbolic links/u);
    } finally {
      await rm(outside, { force: true, recursive: true });
    }
  });
});

test('stops path traversal and closes the root when cancelled', async (t) => {
  await withProject(async (root) => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'file.txt'), 'content');
    const reader = await createResearchReader(root);
    const probe = await open(join(root, 'src', 'file.txt'), 'r');
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    const originalStat = prototype.stat;
    await probe.close();
    const controller = new AbortController();
    let descriptor = -1;
    t.mock.method(prototype as unknown as { stat(): Promise<Stats> }, 'stat', async function (this: FileHandle) {
      descriptor = this.fd;
      const identity = await originalStat.call(this);
      controller.abort();
      return identity;
    });
    await assert.rejects(reader.read('src/file.txt', controller.signal), /aborted/u);
    assert.notEqual(descriptor, -1);
    await assert.rejects(readlink(`/proc/self/fd/${String(descriptor)}`), { code: 'ENOENT' });
  });
});

test('closes every file handle if a parent close fails', async (t) => {
  await withProject(async (root) => {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'src', 'file.txt'), 'content');
    const reader = await createResearchReader(root);
    const originalOpen = fs.promises.open;
    let closed = 0;
    t.mock.method(fs.promises, 'open', async (...args: Parameters<typeof originalOpen>) => {
      const handle = await originalOpen(...args);
      const originalClose = handle.close.bind(handle);
      handle.close = async () => {
        const order = ++closed;
        await originalClose();
        if (order === 1) {
          throw new Error('close failed');
        }
      };
      return handle;
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(reader.read('src/file.txt'), /file handles could not be closed/u);
      assert.equal(closed, 3);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
  });
});

test('bounds file size and output and honours cancellation', async () => {
  await withProject(async (root) => {
    await writeFile(join(root, 'large.txt'), 'x'.repeat(64_001));
    const boundary = Array.from({ length: 64 }, () => 'x'.repeat(999)).join('\n') + 'x';
    await writeFile(join(root, 'boundary.txt'), boundary);
    await writeFile(join(root, 'lines.txt'), Array.from({ length: 201 }, () => 'line').join('\n'));
    const reader = await createResearchReader(root);
    await assert.rejects(reader.read('large.txt'), /64000/u);
    const expected = boundary.split('\n').map((line, index) => `${String(index + 1)}: ${line}`).join('\n');
    assert.equal(await reader.read('boundary.txt'), expected);
    assert.match(await reader.read('lines.txt'), /Only the first 200 lines/u);
    assert.equal(await reader.readRange({ path: 'lines.txt', offset: 201 }), '201: line');
    assert.equal(await reader.readRange({ path: 'lines.txt', offset: 202 }), 'No lines at or after 202.');
    await assert.rejects(reader.readRange({ path: 'lines.txt', offset: 0 }), /line offset/u);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(reader.read('lines.txt', controller.signal));
    await assert.rejects(reader.list('.', controller.signal));
  });
});

test('allows the model to judge which project files are relevant', async () => {
  await withProject(async (root) => {
    const names = ['privatekey', 'apikey', 'authkey', 'key', 'config-key', 'key.txt', 'keyring-token', 'passwords', 'credentials'];
    for (const name of [...names, 'keyboard.txt']) {
      await writeFile(join(root, name), 'content');
    }
    const reader = await createResearchReader(root);
    assert.deepEqual((await reader.list('.')).split('\n'), [...names, 'keyboard.txt'].sort());
    for (const name of names) {
      assert.equal(await reader.read(name), '1: content');
    }
    assert.equal(await reader.read('keyboard.txt'), '1: content');
  });
});

test('reports bounded sorted listings and rejects non-text files', async () => {
  await withProject(async (root) => {
    await mkdir(join(root, 'folder'));
    await writeFile(join(root, '.notes'), 'hidden');
    await writeFile(join(root, 'binary'), Buffer.from([65, 0, 66]));
    await writeFile(join(root, 'invalid-utf8'), Buffer.from([0xc3, 0x28]));
    for (let index = 0; index < 201; index += 1) {
      await writeFile(join(root, `file${String(index).padStart(3, '0')}`), 'x');
    }
    const reader = await createResearchReader(root);
    const entries = (await reader.list('.')).split('\n');
    assert.equal(entries.length, 201);
    assert.equal(entries[0], '.notes');
    assert.equal(entries[1], 'binary');
    assert.equal(entries[2], 'file000');
    assert.equal(entries[200], 'Only the first 200 entries from the scanned entries are shown.');
    await assert.rejects(reader.read('binary'), /Binary files/u);
    await assert.rejects(reader.read('invalid-utf8'), /not valid UTF-8/u);
    await assert.rejects(reader.read('folder'), /regular files/u);
  });
});

test('reports when a directory scan stops before visiting every entry', async () => {
  await withProject(async (root) => {
    for (let index = 0; index < 1_025; index += 1) {
      await writeFile(join(root, `entry${String(index).padStart(4, '0')}`), '');
    }
    const reader = await createResearchReader(root);
    const listing = await reader.list('.');
    assert.match(listing, /Stopped after scanning 1024 entries; the directory listing is incomplete/u);
  });
});

test('bounds reading even when the file grows after its size was checked', async (t) => {
  await withProject(async (root) => {
    const path = join(root, 'growing.txt');
    await writeFile(path, 'x'.repeat(64_001));
    const probe = await open(path, 'r');
    const originalStat = await probe.stat();
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    await probe.close();
    Object.defineProperty(originalStat, 'size', { value: 0 });
    const directoryStat = await stat(root);
    let statCalls = 0;
    t.mock.method(prototype as unknown as { stat(): Promise<Stats> }, 'stat', async () => {
      statCalls += 1;
      return statCalls === 1 ? directoryStat : originalStat;
    });
    const read = t.mock.method(prototype, 'read');
    const reader = await createResearchReader(root);
    await assert.rejects(reader.read('growing.txt'), /64000/u);
    assert.ok(read.mock.calls.every((call) => (call.arguments as unknown as unknown[])[2] !== 0));
  });
});

test('rejects an oversized file before reading its contents', async (t) => {
  await withProject(async (root) => {
    const path = join(root, 'large.txt');
    await writeFile(path, 'x'.repeat(64_001));
    const probe = await open(path, 'r');
    const prototype = Object.getPrototypeOf(probe) as FileHandle;
    await probe.close();
    const read = t.mock.method(prototype, 'read');
    const reader = await createResearchReader(root);
    await assert.rejects(reader.read('large.txt'), /64000/u);
    assert.equal(read.mock.callCount(), 0);
  });
});

test('closes the file after successful and rejected reads', { skip: process.platform !== 'linux' }, async () => {
  await withProject(async (root) => {
    await writeFile(join(root, 'text.txt'), 'text');
    await writeFile(join(root, 'binary.txt'), Buffer.from([0]));
    const reader = await createResearchReader(root);
    await reader.read('text.txt');
    await assert.rejects(reader.read('binary.txt'), /Binary files/u);
    const descriptors = await readdir('/proc/self/fd');
    for (const descriptor of descriptors) {
      try {
        const target = await readlink(`/proc/self/fd/${descriptor}`);
        assert.notEqual(target, join(root, 'text.txt'));
        assert.notEqual(target, join(root, 'binary.txt'));
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
          throw error;
        }
      }
    }
  });
});

test('lists entries in order regardless of creation order', async () => {
  await withProject(async (root) => {
    await writeFile(join(root, 'z.txt'), 'z');
    await writeFile(join(root, 'a.txt'), 'a');
    const reader = await createResearchReader(root);
    assert.equal(await reader.list('.'), 'a.txt\nz.txt');
  });
});

test('preserves lines at the length limit and marks longer lines', async () => {
  await withProject(async (root) => {
    await writeFile(join(root, 'lines.txt'), `${'a'.repeat(2_000)}\n${'b'.repeat(2_001)}`);
    const reader = await createResearchReader(root);
    assert.equal(await reader.read('lines.txt'), `1: ${'a'.repeat(2_000)}\n2: ${'b'.repeat(2_000)} [line truncated]`);
  });
});
