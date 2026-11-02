import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModifiedFile } from './model.ts';
import {
  createModifiedFilesOverlayController,
  ModifiedFilesOverlay,
  renderModifiedFilesWidget,
} from './ui.ts';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const files = createFiles(13);

const RENDER_WIDTH = 42;
const INNER_WIDTH = 40;

const taggedTheme = {
  fg: (color: string, text: string) => `<${color}>${text}</>`,
  bold: (text: string) => text,
} as unknown as Theme;

function createFiles(count: number): ModifiedFile[] {
  return Array.from({ length: count }, (_value, index) => ({
    path: `/work/src/file-${String(index)}.ts`,
    toolName: index % 2 === 0 ? 'edit' : 'write',
  }));
}

function link(path: string, label: string): string {
  return `\u001B]8;;${pathToFileURL(path).href}\u0007${label}\u001B]8;;\u0007`;
}

const OSC_LINK = new RegExp(String.raw`\u001B\]8;;[^\u0007]*\u0007`, 'g');

function frame(content: string): string {
  const visible = content.replace(OSC_LINK, '');
  return `│${content}${' '.repeat(INNER_WIDTH - visible.length)}│`;
}

function renderOverlay(overlayFiles: readonly ModifiedFile[]): string[] {
  const overlay = new ModifiedFilesOverlay(
    { requestRender() {} } as never,
    () => overlayFiles,
    '/work',
    theme,
    () => {},
    () => {},
  );
  return overlay.render(RENDER_WIDTH);
}

function createColorRecorder(): { colors: string[]; theme: Theme } {
  const colors: string[] = [];
  const recordingTheme = {
    fg(color: string, text: string) {
      colors.push(color);
      return text;
    },
    bold: (text: string) => text,
  } as unknown as Theme;
  return { colors, theme: recordingTheme };
}

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

type OverlayFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: () => void,
) => ModifiedFilesOverlay;

interface OverlayOptions {
  overlay: boolean;
  overlayOptions: {
    anchor: string;
    width: string;
    minWidth: number;
    maxHeight: string;
    visible: (terminalWidth: number) => boolean;
  };
}

test('renders the compact widget with colors, count, and the view-all hint', () => {
  assert.equal(renderModifiedFilesWidget([], '/work', taggedTheme), undefined);
  assert.deepEqual(
    renderModifiedFilesWidget(
      [{ path: '/work/src/app.ts', toolName: 'edit' }],
      '/work',
      taggedTheme,
    ),
    [
      '',
      '<dim>── Edited files this session (1) ──</>',
      ` <muted>edit </>${link('/work/src/app.ts', 'src/app.ts')}`,
      '<dim>F8: view all</>',
    ],
  );
});

test('renders the extended overlay with borders, padding, and a hyperlink', () => {
  assert.deepEqual(
    renderOverlay([{ path: '/work/src/app.ts', toolName: 'write' }]),
    [
      `╭${'─'.repeat(INNER_WIDTH)}╮`,
      frame(' Edited files during this session (1) '),
      `├${'─'.repeat(INNER_WIDTH)}┤`,
      frame(` write ${link('/work/src/app.ts', 'src/app.ts')}`),
      `├${'─'.repeat(INNER_WIDTH)}┤`,
      frame(' R clear · F8 or Esc close'),
      `╰${'─'.repeat(INNER_WIDTH)}╯`,
    ],
  );
});

test('renders an empty-state row when nothing was edited', () => {
  assert.deepEqual(renderOverlay([]), [
    `╭${'─'.repeat(INNER_WIDTH)}╮`,
    frame(' Edited files during this session (0) '),
    `├${'─'.repeat(INNER_WIDTH)}┤`,
    frame(' No files edited yet.'),
    `├${'─'.repeat(INNER_WIDTH)}┤`,
    frame(' R clear · F8 or Esc close'),
    `╰${'─'.repeat(INNER_WIDTH)}╯`,
  ]);
});

test('caps the extended overlay at twelve rows and hints at scrolling', () => {
  const twelve = renderOverlay(createFiles(12));

  assert.equal(twelve.length, 18);
  assert.deepEqual(twelve[3], frame(` edit ${link('/work/src/file-0.ts', 'src/file-0.ts')}`));
  assert.deepEqual(twelve[14], frame(` write ${link('/work/src/file-11.ts', 'src/file-11.ts')}`));
  assert.deepEqual(twelve[16], frame(' R clear · F8 or Esc close'));

  const thirteen = renderOverlay(createFiles(13));

  assert.equal(thirteen.length, 18);
  assert.deepEqual(thirteen[14], frame(` write ${link('/work/src/file-11.ts', 'src/file-11.ts')}`));
  assert.deepEqual(
    thirteen[16],
    frame(' ↑↓ scroll · R clear · F8 or Esc close'),
  );
});

test('truncates the title to the terminal width', () => {
  const overlay = new ModifiedFilesOverlay(
    { requestRender() {} } as never,
    () => [{ path: '/work/src/app.ts', toolName: 'edit' }],
    '/work',
    theme,
    () => {},
    () => {},
  );
  const lines = overlay.render(20);

  assert.equal(lines[1]?.replaceAll('\u001B[0m', ''), '│ Edited files dur…│');
});

test('labels files and keeps spaces while replacing control characters', () => {
  assert.deepEqual(
    renderOverlay([{ path: '/elsewhere/a b.ts', toolName: 'edit' }])[3],
    frame(` edit ${link('/elsewhere/a b.ts', 'external: /elsewhere/a b.ts')}`),
  );
  assert.deepEqual(
    renderOverlay([{ path: '/work/a\u0001b.ts', toolName: 'edit' }])[3],
    frame(` edit ${link('/work/a\u0001b.ts', 'a?b.ts')}`),
  );
  assert.deepEqual(
    renderOverlay([{ path: '/work/a\u007Fb.ts', toolName: 'write' }])[3],
    frame(` write ${link('/work/a\u007Fb.ts', 'a?b.ts')}`),
  );
});

test('opens one overlay with the configured placement', () => {
  const customCalls: Array<{ factory: OverlayFactory; options: OverlayOptions }> =
    [];
  const cleared: unknown[] = [];
  const controller = createModifiedFilesOverlayController(
    () => [],
    (ctx) => {
      cleared.push(ctx);
    },
  );
  const ctx = {
    mode: 'tui',
    cwd: '/work',
    ui: {
      custom(factory: OverlayFactory, options: OverlayOptions) {
        customCalls.push({ factory, options });
        return Promise.resolve();
      },
    },
  } as unknown as ExtensionContext;

  controller.toggle(ctx);

  assert.equal(customCalls.length, 1);
  const [opened] = customCalls;
  assert.ok(opened);
  assert.equal(opened.options.overlay, true);
  assert.deepEqual(Object.keys(opened.options.overlayOptions), [
    'anchor',
    'width',
    'minWidth',
    'maxHeight',
    'visible',
  ]);
  assert.equal(opened.options.overlayOptions.anchor, 'center');
  assert.equal(opened.options.overlayOptions.width, '70%');
  assert.equal(opened.options.overlayOptions.minWidth, 40);
  assert.equal(opened.options.overlayOptions.maxHeight, '80%');
  assert.equal(opened.options.overlayOptions.visible(60), true);
  assert.equal(opened.options.overlayOptions.visible(59), false);

  const component = opened.factory(
    { requestRender() {} },
    theme,
    {},
    () => {},
  );
  assert.ok(component instanceof ModifiedFilesOverlay);
  component.handleInput('r');
  assert.deepEqual(cleared, [ctx]);
});

test('closes an open overlay before a later toggle opens a new one', async () => {
  const customCalls: OverlayFactory[] = [];
  let resolveCustom: (() => void) | undefined;
  const controller = createModifiedFilesOverlayController(
    () => [],
    () => {},
  );
  const ctx = {
    mode: 'tui',
    cwd: '/work',
    ui: {
      custom(factory: OverlayFactory) {
        customCalls.push(factory);
        return new Promise<void>((resolve) => {
          resolveCustom = resolve;
        });
      },
    },
  } as unknown as ExtensionContext;

  controller.toggle(ctx);
  assert.equal(customCalls.length, 1);

  let closes = 0;
  const factory = customCalls[0];
  assert.ok(factory);
  const component = factory(
    { requestRender() {} },
    theme,
    {},
    () => {
      closes += 1;
    },
  );
  assert.ok(component instanceof ModifiedFilesOverlay);

  controller.toggle(ctx);
  assert.equal(closes, 1);
  assert.equal(customCalls.length, 1);

  resolveCustom?.();
  await Promise.resolve();
  await Promise.resolve();

  controller.toggle(ctx);
  assert.equal(customCalls.length, 2);
});

test('does not open the overlay outside the TUI', () => {
  let customCalls = 0;
  const controller = createModifiedFilesOverlayController(
    () => [],
    () => {},
  );
  const ctx = {
    mode: 'print',
    cwd: '/work',
    ui: {
      custom() {
        customCalls += 1;
        return Promise.resolve();
      },
    },
  } as unknown as ExtensionContext;

  controller.toggle(ctx);

  assert.equal(customCalls, 0);
});

test('does not open a second overlay while the first is opening', () => {
  let customCalls = 0;
  let reentered = false;
  const controller = createModifiedFilesOverlayController(
    () => [],
    () => {},
  );
  const ctx = {
    mode: 'tui',
    cwd: '/work',
    ui: {
      custom() {
        customCalls += 1;
        if (!reentered) {
          reentered = true;
          controller.toggle(ctx);
        }
        return Promise.resolve();
      },
    },
  } as unknown as ExtensionContext;

  controller.toggle(ctx);

  assert.equal(customCalls, 1);
});

test('scrolls one row at a time and clamps the offset', () => {
  let renders = 0;
  const overlay = new ModifiedFilesOverlay(
    {
      requestRender() {
        renders += 1;
      },
    } as never,
    () => createFiles(40),
    '/work',
    theme,
    () => {},
    () => {},
  );

  overlay.handleInput('\u001B[B');
  overlay.handleInput('\u001B[B');
  assert.equal(renders, 2);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` edit ${link('/work/src/file-2.ts', 'src/file-2.ts')}`),
  );

  overlay.handleInput('\u001B[A');
  assert.equal(renders, 3);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` write ${link('/work/src/file-1.ts', 'src/file-1.ts')}`),
  );

  overlay.handleInput('\u001B[A');
  overlay.handleInput('\u001B[A');
  assert.equal(renders, 5);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` edit ${link('/work/src/file-0.ts', 'src/file-0.ts')}`),
  );

  const clamped = new ModifiedFilesOverlay(
    { requestRender() {} } as never,
    () => createFiles(13),
    '/work',
    theme,
    () => {},
    () => {},
  );
  for (let press = 0; press < 3; press += 1) {
    clamped.handleInput('\u001B[B');
  }
  const clampedLines = clamped.render(RENDER_WIDTH);
  assert.deepEqual(
    clampedLines[3],
    frame(` write ${link('/work/src/file-1.ts', 'src/file-1.ts')}`),
  );
  assert.deepEqual(
    clampedLines[14],
    frame(` edit ${link('/work/src/file-12.ts', 'src/file-12.ts')}`),
  );
});

test('pages by twelve rows and ignores unrelated keys', () => {
  let renders = 0;
  const overlay = new ModifiedFilesOverlay(
    {
      requestRender() {
        renders += 1;
      },
    } as never,
    () => createFiles(40),
    '/work',
    theme,
    () => {},
    () => {},
  );

  overlay.handleInput('\u001B[6~');
  assert.equal(renders, 1);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` edit ${link('/work/src/file-12.ts', 'src/file-12.ts')}`),
  );

  overlay.handleInput('\u001B[5~');
  assert.equal(renders, 2);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` edit ${link('/work/src/file-0.ts', 'src/file-0.ts')}`),
  );

  overlay.handleInput('\u001B[B');
  overlay.handleInput('\u001B[B');
  overlay.handleInput('\u001B[B');
  overlay.handleInput('\u001B[5~');
  assert.equal(renders, 6);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` edit ${link('/work/src/file-0.ts', 'src/file-0.ts')}`),
  );

  overlay.handleInput('\u001B[B');
  overlay.handleInput('x');
  assert.equal(renders, 7);
  assert.deepEqual(
    overlay.render(RENDER_WIDTH)[3],
    frame(` write ${link('/work/src/file-1.ts', 'src/file-1.ts')}`),
  );
});

test('uses the border, accent, muted, and dim colors in the overlay', () => {
  const expectedColors = [
    'border',
    'border',
    'accent',
    'border',
    'border',
    'border',
    'border',
    'border',
    'muted',
    'border',
    'border',
    'border',
    'border',
    'border',
    'dim',
    'border',
    'border',
  ];

  const fileRecorder = createColorRecorder();
  const fileOverlay = new ModifiedFilesOverlay(
    { requestRender() {} } as never,
    () => [{ path: '/work/src/app.ts', toolName: 'edit' }],
    '/work',
    fileRecorder.theme,
    () => {},
    () => {},
  );
  fileOverlay.render(RENDER_WIDTH);
  assert.deepEqual(fileRecorder.colors, expectedColors);

  const emptyRecorder = createColorRecorder();
  const emptyOverlay = new ModifiedFilesOverlay(
    { requestRender() {} } as never,
    () => [],
    '/work',
    emptyRecorder.theme,
    () => {},
    () => {},
  );
  emptyOverlay.render(RENDER_WIDTH);
  assert.deepEqual(emptyRecorder.colors, expectedColors);
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
