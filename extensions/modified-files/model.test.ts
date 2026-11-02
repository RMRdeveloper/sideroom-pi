import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayModifiedPath,
  FILE_TOOL_NAME,
  isRecord,
  MAX_TRACKED_FILES,
  readModifiedFilesSnapshot,
  recordModifiedFile,
  resolveModifiedPath,
} from './model.ts';

test('records the most recently edited path first without duplicates', () => {
  const files = recordModifiedFile(
    [
      { path: '/work/a.ts', toolName: FILE_TOOL_NAME.write },
      { path: '/work/b.ts', toolName: FILE_TOOL_NAME.edit },
    ],
    '/work/a.ts',
    FILE_TOOL_NAME.edit,
  );

  assert.deepEqual(files, [
    { path: '/work/a.ts', toolName: FILE_TOOL_NAME.edit },
    { path: '/work/b.ts', toolName: FILE_TOOL_NAME.edit },
  ]);
});

test('bounds tracked history and handles project-relative and external paths', () => {
  let files = [] as ReturnType<typeof recordModifiedFile>;
  for (let index = 0; index <= MAX_TRACKED_FILES; index += 1) {
    files = recordModifiedFile(
      files,
      `/work/file-${String(index)}.ts`,
      FILE_TOOL_NAME.write,
    );
  }

  assert.equal(files.length, MAX_TRACKED_FILES);
  assert.equal(files[0]?.path, '/work/file-100.ts');
  assert.equal(
    resolveModifiedPath('/work', ' @src/app.ts '),
    '/work/src/app.ts',
  );
  assert.equal(resolveModifiedPath('/work', '  '), undefined);
  assert.equal(displayModifiedPath('/work', '/work/src/app.ts'), 'src/app.ts');
  assert.equal(
    displayModifiedPath('/work', '/elsewhere/app.ts'),
    'external: /elsewhere/app.ts',
  );
});

test('accepts only valid modified-files snapshots', () => {
  assert.deepEqual(
    readModifiedFilesSnapshot({
      files: [{ path: '/work/app.ts', toolName: FILE_TOOL_NAME.edit }],
    }),
    [{ path: '/work/app.ts', toolName: FILE_TOOL_NAME.edit }],
  );
  assert.deepEqual(readModifiedFilesSnapshot({ files: [] }), []);
  assert.equal(readModifiedFilesSnapshot({ files: [{ path: 42 }] }), undefined);
  assert.equal(
    readModifiedFilesSnapshot({
      files: [{ path: '/work/app.ts', toolName: 'bash' }],
    }),
    undefined,
  );
});

test('strips only a leading at-sign from tool paths', () => {
  assert.equal(resolveModifiedPath('/work', '@src/app.ts'), '/work/src/app.ts');
  assert.equal(resolveModifiedPath('/work', 'src/a@b.ts'), '/work/src/a@b.ts');
});

test('treats the working directory and its parents as external paths', () => {
  assert.equal(displayModifiedPath('/work', '/work'), 'external: /work');
  assert.equal(displayModifiedPath('/work', '/work/..'), 'external: /work/..');
  assert.equal(displayModifiedPath('/work', '/work/src'), 'src');
});

test('rejects snapshots whose shape is not a file list', () => {
  assert.equal(readModifiedFilesSnapshot(null), undefined);
  assert.equal(readModifiedFilesSnapshot(undefined), undefined);
  assert.equal(readModifiedFilesSnapshot(42), undefined);
  assert.equal(readModifiedFilesSnapshot({ files: 'src' }), undefined);
  assert.equal(readModifiedFilesSnapshot({ files: [null] }), undefined);
  assert.equal(
    readModifiedFilesSnapshot({
      files: [{ path: 42, toolName: FILE_TOOL_NAME.edit }],
    }),
    undefined,
  );
});

test('accepts write snapshots', () => {
  assert.deepEqual(
    readModifiedFilesSnapshot({
      files: [{ path: '/work/app.ts', toolName: FILE_TOOL_NAME.write }],
    }),
    [{ path: '/work/app.ts', toolName: FILE_TOOL_NAME.write }],
  );
});

test('recognises only non-null objects as records', () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), true);
  assert.equal(isRecord('text'), false);
  assert.equal(isRecord(42), false);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord(undefined), false);
});
