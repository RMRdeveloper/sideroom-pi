// Regenerates media/preview.png and media/preview.mp4, the gallery preview
// assets declared as pi.image and pi.video in package.json.
//
// The TUI widgets only expose render(width) -> ANSI lines, so this script runs
// them offline with a stub host and rasterizes the lines through librsvg, which
// the local ffmpeg build ships. That is why a screen recorder is not needed.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAskUi } from '../extensions/ask/ui.ts';
import { renderModifiedFilesWidget } from '../extensions/modified-files/ui.ts';
import { TODO_STATUS } from '../extensions/todo/model.ts';
import { renderTodoWidget } from '../extensions/todo/ui.ts';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA_DIR = join(REPO_ROOT, 'media');
const FRAME_DIR = join(tmpdir(), 'sideroom-preview-frames');

const ESCAPE = '\u001b';
const BELL = '\u0007';
const ANSI_RESET = `${ESCAPE}[0m`;
// RegExp objects, not literals, because the terminal control ranges are
// rejected by the linter when they appear inline in a pattern.
const SGR_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;]*)m`, 'g');
const OSC_PATTERN = new RegExp(
  `${ESCAPE}\\][^${BELL}${ESCAPE}]*(?:${BELL}|${ESCAPE}\\\\)?`,
  'g',
);
const CSI_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;?]*)([A-Za-z])`, 'g');
const CONTROL_GAP = { from: 0x0b, to: 0x1f };
const DELETE_CODE = 0x7f;
const LOW_CONTROL_END = 0x08;

function isTerminalControl(character) {
  const code = character.codePointAt(0) ?? 0;
  const isLowControl =
    code <= LOW_CONTROL_END ||
    (code >= CONTROL_GAP.from && code <= CONTROL_GAP.to);
  return isLowControl || code === DELETE_CODE;
}

function stripControlCharacters(text) {
  let cleaned = '';
  for (const character of text) {
    if (!isTerminalControl(character)) {
      cleaned += character;
    }
  }
  return cleaned;
}

// Snapshot of pi's own dark theme, from
// pi-coding-agent/dist/modes/interactive/theme/dark.json.
const FOREGROUND = {
  accent: '#8abeb7',
  text: '#d4d4d4',
  muted: '#808080',
  dim: '#666666',
  success: '#b5bd68',
  warning: '#ffff00',
};
const BACKGROUND = { selectedBg: '#3a3a4a' };
const CANVAS = { width: 1600, height: 1000, page: '#18181e', panel: '#1e1e24' };
const FONT_FAMILY = 'DejaVu Sans Mono';
const CELL_RATIO = 1233 / 2048; // DejaVu Sans Mono advance width, in em.
const LINE_RATIO = 1.45;
const PANEL_RADIUS = 20;
const PANEL_BORDER = '#2e2e38';
const PANEL_MARGIN = 40;
const PANEL_PADDING = 30;
const PANEL_GAP = 26;
const PANEL_WIDTH = CANVAS.width - 2 * PANEL_MARGIN;
const COLUMNS = 78;
const SCREEN_ROWS = 48;

const FONT_SIZE = 23;
const FRAME_RATE = 12;
const SHORT_HOLD = 4;
const LONG_HOLD = 7;
const FINAL_SCENE_FRAMES = 28;

const KEY = {
  up: `${ESCAPE}[A`,
  down: `${ESCAPE}[B`,
  enter: '\r',
  space: ' ',
};

const QUESTIONS = [
  {
    id: 'coverage',
    label: 'Coverage',
    prompt: 'Which lines should the rules gate inspect?',
    options: [
      {
        value: 'added',
        label: 'Only the added lines',
        description: 'Fast, and never blocks on inherited code',
      },
      {
        value: 'file',
        label: 'The whole file',
        description: 'Slower, catches pre-existing violations',
      },
      {
        value: 'diff',
        label: 'The staged diff',
        description: 'Only what a reviewer would actually see',
      },
    ],
    selectionMode: 'single',
    recommendedIndices: [0],
  },
  {
    id: 'rollout',
    label: 'Rollout',
    prompt: 'Which gates ship in this release?',
    options: [
      {
        value: 'rules',
        label: 'Rule enforcement',
        description: 'Blocks braceless ifs and swallowed errors',
      },
      {
        value: 'guidelines',
        label: 'Read-before-edit gate',
        description: 'The agent loads the guide before touching code',
      },
      {
        value: 'done',
        label: 'Done gate',
        description: 'No green check, no declared victory',
      },
    ],
    selectionMode: 'multiple',
    recommendedIndices: [0, 2],
  },
  {
    id: 'escape',
    label: 'Escape hatch',
    prompt: 'When may a blocked call go through anyway?',
    options: [
      {
        value: 'breaker',
        label: 'After three blocks',
        description: 'The rule degrades to a warning for the run',
      },
      {
        value: 'manual',
        label: 'Only when I ask',
        description: 'The agent stops and waits for you',
      },
    ],
    selectionMode: 'single',
    recommendedIndices: [0],
  },
];

const BOARD_ITEMS = [
  {
    id: 'schema',
    content: 'Pin the answer contract in one place',
    status: TODO_STATUS.completed,
  },
  {
    id: 'tabs',
    content: 'Render the recommended mark on every tab',
    status: TODO_STATUS.inProgress,
  },
  {
    id: 'breaker',
    content: 'Degrade a rule that keeps firing',
    status: TODO_STATUS.pending,
  },
  {
    id: 'docs',
    content: 'Document the gate in the README',
    status: TODO_STATUS.pending,
  },
];

const EDITED_FILES = [
  { path: join(REPO_ROOT, 'extensions/ask/ui.ts'), toolName: 'edit' },
  { path: join(REPO_ROOT, 'extensions/ask/model.ts'), toolName: 'edit' },
  { path: join(REPO_ROOT, 'extensions/rules/checks.ts'), toolName: 'write' },
];

const TIMELINE = [
  { input: null, frames: LONG_HOLD + 2 },
  { input: KEY.down, frames: LONG_HOLD },
  { input: KEY.down, frames: LONG_HOLD },
  { input: KEY.up, frames: SHORT_HOLD },
  { input: KEY.enter, frames: LONG_HOLD + 4 },
  { input: KEY.space, frames: LONG_HOLD },
  { input: KEY.down, frames: SHORT_HOLD },
  { input: KEY.space, frames: LONG_HOLD },
  { input: KEY.up, frames: SHORT_HOLD },
  { input: KEY.up, frames: SHORT_HOLD },
  { input: KEY.up, frames: SHORT_HOLD },
  { input: KEY.enter, frames: LONG_HOLD + 5 },
  { input: KEY.enter, frames: LONG_HOLD + 8 },
];

function toAnsi(prefix, hexColor) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hexColor.slice(offset, offset + 2), 16),
  );
  return `${ESCAPE}[${prefix};2;${channels.join(';')}m`;
}

function createTheme() {
  function resolve(name, table) {
    const value = table[name];
    if (value === undefined) {
      throw new Error(`Unknown theme color: ${name}`);
    }
    return value;
  }

  return {
    fg: (name, text) =>
      `${toAnsi('38', resolve(name, FOREGROUND))}${text}${ANSI_RESET}`,
    bg: (name, text) =>
      `${toAnsi('48', resolve(name, BACKGROUND))}${text}${ANSI_RESET}`,
    bold: (text) => `${ESCAPE}[1m${text}${ANSI_RESET}`,
  };
}

const theme = createTheme();

function parseSgr(state, parametersText) {
  const codes =
    parametersText.length === 0 ? [0] : parametersText.split(';').map(Number);
  let next = { ...state };

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === 0) {
      next = { fg: null, bg: null, bold: false };
    } else if (code === 1) {
      next = { ...next, bold: true };
    } else if (code === 22) {
      next = { ...next, bold: false };
    } else if (code === 39) {
      next = { ...next, fg: null };
    } else if (code === 49) {
      next = { ...next, bg: null };
    } else if ((code === 38 || code === 48) && codes[index + 1] === 2) {
      const channels = codes.slice(index + 2, index + 5);
      if (channels.length === 3 && channels.every(Number.isInteger)) {
        const hex = channels
          .map((channel) => channel.toString(16).padStart(2, '0'))
          .join('');
        next = { ...next, [code === 38 ? 'fg' : 'bg']: `#${hex}` };
      }
      index += 4;
    }
  }

  return next;
}

// The edited-files widget wraps every path in an OSC 8 hyperlink, so those
// terminal-only sequences must go before a line can become SVG text.
function stripTerminalEscapes(line) {
  return line
    .replace(OSC_PATTERN, '')
    .replace(CSI_PATTERN, (sequence, _parameters, finalByte) =>
      finalByte === 'm' ? sequence : '',
    );
}

function parseAnsiLine(rawLine) {
  const line = stripTerminalEscapes(rawLine);
  const runs = [];
  let state = { fg: null, bg: null, bold: false };
  let column = 0;
  let cursor = 0;

  function pushRun(rawText) {
    const text = stripControlCharacters(rawText);
    if (text.length === 0) {
      return;
    }
    const previous = runs.at(-1);
    const extendsPrevious =
      previous !== undefined &&
      previous.fg === state.fg &&
      previous.bg === state.bg &&
      previous.bold === state.bold;
    if (extendsPrevious) {
      previous.text += text;
    } else {
      runs.push({ ...state, column, text });
    }
    column += text.length;
  }

  for (const match of line.matchAll(SGR_PATTERN)) {
    const matchIndex = match.index ?? 0;
    pushRun(line.slice(cursor, matchIndex));
    state = parseSgr(state, match[1] ?? '');
    cursor = matchIndex + match[0].length;
  }
  pushRun(line.slice(cursor));

  return runs;
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function lineHeightOf(fontSize) {
  return fontSize * LINE_RATIO;
}

function blankLines(count) {
  return Array.from({ length: count }, () => '');
}

// Panels stack, top-aligned, and every frame of a scene shares one measurement
// so the geometry never shifts while the content changes.
function layoutPanels(entries) {
  const heights = entries.map(
    (entry) =>
      entry.lines.length * lineHeightOf(entry.fontSize) + 2 * PANEL_PADDING,
  );
  const stackHeight =
    heights.reduce((total, height) => total + height, 0) +
    PANEL_GAP * (entries.length - 1);
  if (stackHeight > CANVAS.height) {
    throw new Error(
      `Panels need ${Math.round(stackHeight)}px on a ${CANVAS.height}px canvas`,
    );
  }
  let top = (CANVAS.height - stackHeight) / 2;

  return entries.map((entry, index) => {
    const height = heights[index] ?? 0;
    const box = {
      x: PANEL_MARGIN,
      y: Math.round(top),
      width: PANEL_WIDTH,
      height: Math.round(height),
      fontSize: entry.fontSize,
    };
    top += height + PANEL_GAP;
    return { box, lines: entry.lines };
  });
}

function panelSvg(panel) {
  const { box, lines } = panel;
  const cellWidth = box.fontSize * CELL_RATIO;
  const lineHeight = lineHeightOf(box.fontSize);
  const baselineOffset = lineHeight * 0.5 + box.fontSize * 0.35;
  const originX = box.x + (box.width - COLUMNS * cellWidth) / 2;
  const originY = box.y + PANEL_PADDING;
  const parts = [
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${PANEL_RADIUS}" fill="${CANVAS.panel}" stroke="${PANEL_BORDER}" stroke-width="2"/>`,
  ];

  for (let row = 0; row < lines.length; row += 1) {
    const rowTop = originY + row * lineHeight;
    const baseline = rowTop + baselineOffset;
    for (const run of parseAnsiLine(lines[row] ?? '')) {
      const runLeft = originX + run.column * cellWidth;
      if (run.bg !== null) {
        parts.push(
          `<rect x="${runLeft.toFixed(2)}" y="${rowTop.toFixed(2)}" width="${(run.text.length * cellWidth).toFixed(2)}" height="${lineHeight.toFixed(2)}" fill="${run.bg}"/>`,
        );
      }
      if (run.text.trim().length === 0) {
        continue;
      }
      const weight = run.bold ? ' font-weight="bold"' : '';
      parts.push(
        `<text x="${runLeft.toFixed(2)}" y="${baseline.toFixed(2)}" font-family="${FONT_FAMILY}" font-size="${box.fontSize}"${weight} fill="${run.fg ?? FOREGROUND.text}">${escapeXml(run.text)}</text>`,
      );
    }
  }

  return parts.join('\n');
}

function buildSvg(panels) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" xml:space="preserve">`,
    `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${CANVAS.page}"/>`,
    ...panels.map(panelSvg),
    '</svg>',
  ].join('\n');
}

function runFfmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
}

function assertFfmpeg() {
  try {
    runFfmpeg(['-version']);
  } catch (error) {
    throw new Error('ffmpeg is required to render the preview assets', {
      cause: error,
    });
  }
}

// The SVG is only an intermediate for librsvg, so it always lands in the
// scratch directory and never next to a committed asset.
function writeFrame(name, panels, directory) {
  mkdirSync(directory, { recursive: true });
  mkdirSync(FRAME_DIR, { recursive: true });
  const svgPath = join(FRAME_DIR, `${name}.svg`);
  const pngPath = join(directory, `${name}.png`);
  writeFileSync(svgPath, buildSvg(panels));
  runFfmpeg(['-i', svgPath, '-frames:v', '1', pngPath]);
  return pngPath;
}

function resetFrameDirectory() {
  mkdirSync(FRAME_DIR, { recursive: true });
  for (const entry of readdirSync(FRAME_DIR)) {
    rmSync(join(FRAME_DIR, entry));
  }
}

async function createAskComponent() {
  const tui = {
    terminal: { columns: COLUMNS, rows: SCREEN_ROWS },
    requestRender() {},
  };
  const host = { custom: async (factory) => factory(tui, theme, {}, () => {}) };
  return runAskUi(host, QUESTIONS);
}

function boardLines(includeEditedFiles) {
  const board = renderTodoWidget(BOARD_ITEMS, theme) ?? [];
  if (!includeEditedFiles) {
    return board;
  }
  return [
    ...board,
    ...(renderModifiedFilesWidget(EDITED_FILES, REPO_ROOT, theme) ?? []),
  ];
}

function answerTwoQuestions(ask) {
  ask.handleInput('2');
  ask.handleInput(KEY.down);
  ask.handleInput(KEY.enter);
  ask.handleInput(KEY.space);
  ask.handleInput(KEY.down);
  ask.handleInput(KEY.space);
}

async function collectAskFrames() {
  const ask = await createAskComponent();
  const frames = [];
  for (const step of TIMELINE) {
    if (step.input !== null) {
      ask.handleInput(step.input);
    }
    const lines = ask.render(COLUMNS);
    for (let index = 0; index < step.frames; index += 1) {
      frames.push(lines);
    }
  }
  return { ask, frames };
}

async function renderImage() {
  const ask = await createAskComponent();
  answerTwoQuestions(ask);
  return writeFrame(
    'preview',
    layoutPanels([
      { lines: ask.render(COLUMNS), fontSize: FONT_SIZE },
      { lines: boardLines(false), fontSize: FONT_SIZE },
    ]),
    MEDIA_DIR,
  );
}

async function renderVideo() {
  const { ask, frames: questionFrames } = await collectAskFrames();
  const questionLineCount = Math.max(
    ...questionFrames.map((lines) => lines.length),
  );
  const [questionBox] = layoutPanels([
    { lines: blankLines(questionLineCount), fontSize: FONT_SIZE },
  ]);
  const finalScene = layoutPanels([
    { lines: ask.render(COLUMNS), fontSize: FONT_SIZE },
    { lines: boardLines(true), fontSize: FONT_SIZE },
  ]);
  const frames = [
    ...questionFrames.map((lines) => [{ box: questionBox.box, lines }]),
    ...Array.from({ length: FINAL_SCENE_FRAMES }, () => finalScene),
  ];

  resetFrameDirectory();
  frames.forEach((panels, index) => {
    writeFrame(`frame-${String(index).padStart(4, '0')}`, panels, FRAME_DIR);
  });

  const videoPath = join(MEDIA_DIR, 'preview.mp4');
  runFfmpeg([
    '-framerate',
    String(FRAME_RATE),
    '-i',
    join(FRAME_DIR, 'frame-%04d.png'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    videoPath,
  ]);
  return videoPath;
}

async function main() {
  assertFfmpeg();
  mkdirSync(MEDIA_DIR, { recursive: true });
  const imagePath = await renderImage();
  const videoPath = await renderVideo();
  return [imagePath, videoPath];
}

const writtenPaths = await main();
process.stdout.write(`${writtenPaths.join('\n')}\n`);
