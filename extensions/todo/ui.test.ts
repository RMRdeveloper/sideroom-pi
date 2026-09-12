import assert from 'node:assert/strict';
import test from 'node:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { TODO_STATUS, type TodoItem } from './model.ts';
import {
  renderTodoWidget,
  selectVisibleBoardRows,
  TodoBoardOverlay,
} from './ui.ts';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function board(statuses: readonly TodoItem['status'][]): TodoItem[] {
  return statuses.map((status, index) => ({
    id: `item-${String(index)}`,
    content: `Work ${String(index)}`,
    status,
  }));
}

test('keeps every row when the board fits under the limit', () => {
  const items = board([TODO_STATUS.inProgress, TODO_STATUS.pending]);

  assert.deepEqual(selectVisibleBoardRows(items, 5), {
    indexes: [0, 1],
    hiddenCount: 0,
  });
});

test('hides resolved rows before open rows while keeping board order', () => {
  const items = board([
    TODO_STATUS.completed,
    TODO_STATUS.pending,
    TODO_STATUS.cancelled,
    TODO_STATUS.inProgress,
    TODO_STATUS.completed,
    TODO_STATUS.pending,
  ]);

  assert.deepEqual(selectVisibleBoardRows(items, 5), {
    indexes: [0, 1, 2, 3, 5],
    hiddenCount: 1,
  });
});

test('guarantees the in_progress row when it falls outside the limit', () => {
  const items = board([
    TODO_STATUS.pending,
    TODO_STATUS.pending,
    TODO_STATUS.pending,
    TODO_STATUS.inProgress,
  ]);

  assert.deepEqual(selectVisibleBoardRows(items, 3), {
    indexes: [0, 1, 3],
    hiddenCount: 1,
  });
});

test('renders a capped board with the hidden-row hint', () => {
  const items = board([
    TODO_STATUS.completed,
    TODO_STATUS.cancelled,
    TODO_STATUS.inProgress,
    TODO_STATUS.pending,
    TODO_STATUS.pending,
    TODO_STATUS.pending,
  ]);

  const lines = renderTodoWidget(items, theme);

  assert.ok(lines);
  assert.equal(lines.length, 7);
  assert.match(lines[0] ?? '', /^Sideroom board \(1 active, 3 queued\)$/);
  assert.match(lines[1] ?? '', /Work 0/);
  assert.match(lines[5] ?? '', /Work 5/);
  assert.doesNotMatch(lines.join('\n'), /Work 1\b/);
  assert.equal(lines[6], '…+1 more · F9: view all');
});

test('renders no widget for an empty board', () => {
  assert.equal(renderTodoWidget([], theme), undefined);
});

test('scrolls the extended overlay and closes on Esc or F9', () => {
  let renders = 0;
  let closed = 0;
  const items = board([
    TODO_STATUS.inProgress,
    ...Array.from({ length: 12 }, () => TODO_STATUS.pending),
  ]);
  const overlay = new TodoBoardOverlay(
    {
      requestRender: () => {
        renders += 1;
      },
    } as never,
    () => items,
    theme,
    () => {
      closed += 1;
    },
  );

  const firstPage = overlay.render(80).join('\n');
  assert.match(firstPage, /Work board \(13\)/);
  assert.match(firstPage, /Work 0/);
  assert.doesNotMatch(firstPage, /Work 12/);

  overlay.handleInput('\u001B[B');
  assert.equal(renders, 1);
  assert.match(overlay.render(80).join('\n'), /Work 12/);

  overlay.handleInput('r');
  assert.equal(closed, 0);

  overlay.handleInput('\u001B[20~');
  assert.equal(closed, 1);

  overlay.handleInput('\u001B');
  assert.equal(closed, 2);
});
