import assert from 'node:assert/strict';
import test from 'node:test';
import {
  displayModifiedPath,
  FILE_TOOL_NAME,
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
