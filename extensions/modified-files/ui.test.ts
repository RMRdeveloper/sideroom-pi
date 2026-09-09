import assert from 'node:assert/strict';
import test from 'node:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { ModifiedFilesOverlay, renderModifiedFilesWidget } from './ui.ts';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const files = Array.from({ length: 13 }, (_value, index) => ({
  path: `/work/src/file-${String(index)}.ts`,
  toolName: index % 2 === 0 ? 'edit' : 'write',
})) as Array<{ path: string; toolName: 'edit' | 'write' }>;

test('separates no more than five linked file paths from the Todo board', () => {
  const lines = renderModifiedFilesWidget(files, '/work', theme);

  assert.ok(lines);
  assert.equal(lines.length, 8);
  assert.equal(lines[0], '');
  assert.match(lines[1] ?? '', /Edited files this session \(13\)/);
  assert.match(lines[2] ?? '', /file-0\.ts/);
  assert.match(lines[6] ?? '', /file-4\.ts/);
  assert.doesNotMatch(lines.join('\n'), /file-5\.ts/);
  assert.ok(lines[2]?.includes('\u001B]8;;file:///work/src/file-0.ts'));
});

test('scrolls, clears, and closes the extended overlay', () => {
  let renders = 0;
  let closed = 0;
  let cleared = 0;
  const overlay = new ModifiedFilesOverlay(
    {
      requestRender: () => {
        renders += 1;
      },
    } as never,
    () => files,
    '/work',
    theme,
    () => {
      closed += 1;
    },
    () => {
      cleared += 1;
    },
  );

  overlay.handleInput('\u001B[B');
  assert.equal(renders, 1);
  assert.match(overlay.render(80).join('\n'), /file-12\.ts/);

  overlay.handleInput('r');
  assert.equal(cleared, 1);
  assert.equal(closed, 1);

  overlay.handleInput('\u001B[19~');
  assert.equal(closed, 2);
});
