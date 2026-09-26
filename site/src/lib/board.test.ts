import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOARD_STATUS,
  BOARD_STATUS_COLUMN,
  type BoardItem,
  type BoardStatus,
  boardIdWidth,
  countByStatus,
  selectVisibleBoardRows,
  statusMark,
} from './board.ts';

function boardItem(id: string, status: BoardStatus): BoardItem {
  return { id, content: `${id} content`, status };
}

test('keeps the step in progress and the queued ones when the board does not fit', () => {
  const items = [
    boardItem('read', BOARD_STATUS.COMPLETED),
    boardItem('grill', BOARD_STATUS.COMPLETED),
    boardItem('plan', BOARD_STATUS.COMPLETED),
    boardItem('rebuild', BOARD_STATUS.IN_PROGRESS),
    boardItem('copy', BOARD_STATUS.PENDING),
    boardItem('design', BOARD_STATUS.PENDING),
    boardItem('check', BOARD_STATUS.PENDING),
    boardItem('review', BOARD_STATUS.PENDING),
  ];

  const visible = selectVisibleBoardRows(items, 5);

  assert.deepEqual(visible.indexes, [3, 4, 5, 6, 7]);
  assert.equal(visible.hiddenCount, 3);
});

test('shows every row when the board fits', () => {
  const items = [
    boardItem('one', BOARD_STATUS.IN_PROGRESS),
    boardItem('two', BOARD_STATUS.PENDING),
  ];

  const visible = selectVisibleBoardRows(items, 5);

  assert.deepEqual(visible.indexes, [0, 1]);
  assert.equal(visible.hiddenCount, 0);
});

test('returns the visible indexes in board order, not in rank order', () => {
  const items = [
    boardItem('done', BOARD_STATUS.COMPLETED),
    boardItem('next', BOARD_STATUS.PENDING),
    boardItem('now', BOARD_STATUS.IN_PROGRESS),
    boardItem('later', BOARD_STATUS.PENDING),
    boardItem('old', BOARD_STATUS.COMPLETED),
    boardItem('queued', BOARD_STATUS.PENDING),
  ];

  const visible = selectVisibleBoardRows(items, 3);

  assert.deepEqual(visible.indexes, [1, 2, 3]);
  assert.equal(visible.hiddenCount, 3);
});

test('prints the mark the terminal prints for each status', () => {
  assert.equal(statusMark(BOARD_STATUS.IN_PROGRESS), '>');
  assert.equal(statusMark(BOARD_STATUS.PENDING), '-');
  assert.equal(statusMark(BOARD_STATUS.COMPLETED), '\u2713');
});

test('pads the id column to the longest id on the board', () => {
  assert.equal(
    boardIdWidth([
      boardItem('ask', BOARD_STATUS.PENDING),
      boardItem('monorepo-skills', BOARD_STATUS.PENDING),
    ]),
    15,
  );
  assert.equal(boardIdWidth([]), 1);
});

test('pads the status column to the width the terminal pads it to', () => {
  assert.equal(BOARD_STATUS_COLUMN, 11);
});

test('counts the rows of one status', () => {
  const items = [
    boardItem('a', BOARD_STATUS.COMPLETED),
    boardItem('b', BOARD_STATUS.IN_PROGRESS),
    boardItem('c', BOARD_STATUS.PENDING),
  ];

  assert.equal(countByStatus(items, BOARD_STATUS.PENDING), 1);
  assert.equal(countByStatus(items, BOARD_STATUS.COMPLETED), 1);
});
