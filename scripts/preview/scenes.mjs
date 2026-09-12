// The demo scene: what the previews show, and the code that drives the real
// widgets through it. The widgets are rendered offline with a stub host, so
// nothing here opens a terminal.

import { join } from 'node:path';
import { runAskUi } from '../../extensions/ask/ui.ts';
import { renderModifiedFilesWidget } from '../../extensions/modified-files/ui.ts';
import { TODO_STATUS } from '../../extensions/todo/model.ts';
import { renderTodoWidget } from '../../extensions/todo/ui.ts';
import { ESCAPE } from './ansi.mjs';

export const COLUMNS = 78;
export const FINAL_SCENE_FRAMES = 28;

const SCREEN_ROWS = 48;
const SHORT_HOLD = 4;
const LONG_HOLD = 7;
const FIRST_ANSWER_KEY = '2';

const KEY = Object.freeze({
  up: `${ESCAPE}[A`,
  down: `${ESCAPE}[B`,
  enter: '\r',
  space: ' ',
});

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
  { path: 'extensions/ask/ui.ts', toolName: 'edit' },
  { path: 'extensions/ask/model.ts', toolName: 'edit' },
  { path: 'extensions/rules/checks.ts', toolName: 'write' },
];

// input: null holds the current frame while the previous key stays on screen.
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

export async function createAskComponent(theme) {
  const tui = {
    terminal: { columns: COLUMNS, rows: SCREEN_ROWS },
    requestRender() {},
  };
  const host = { custom: async (factory) => factory(tui, theme, {}, () => {}) };
  return runAskUi(host, QUESTIONS);
}

export function renderAskLines(ask) {
  return ask.render(COLUMNS);
}

export function answerTwoQuestions(ask) {
  ask.handleInput(FIRST_ANSWER_KEY);
  ask.handleInput(KEY.down);
  ask.handleInput(KEY.enter);
  ask.handleInput(KEY.space);
  ask.handleInput(KEY.down);
  ask.handleInput(KEY.space);
}

export function boardLines(theme, cwd, { includeEditedFiles }) {
  const board = renderTodoWidget(BOARD_ITEMS, theme) ?? [];
  if (!includeEditedFiles) {
    return board;
  }
  const editedFiles = EDITED_FILES.map((file) => ({
    ...file,
    path: join(cwd, file.path),
  }));
  return [
    ...board,
    ...(renderModifiedFilesWidget(editedFiles, cwd, theme) ?? []),
  ];
}

export async function collectQuestionFrames(theme) {
  const ask = await createAskComponent(theme);
  const frames = [];

  for (const step of TIMELINE) {
    if (step.input !== null) {
      ask.handleInput(step.input);
    }
    const lines = renderAskLines(ask);
    for (let index = 0; index < step.frames; index += 1) {
      frames.push(lines);
    }
  }

  return { ask, frames };
}
