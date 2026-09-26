// The board widget's own rules, kept here so the page shows the same rows the
// terminal shows: the step in progress first, then the queued ones, then the
// resolved ones.

export const BOARD_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const;

export type BoardStatus = (typeof BOARD_STATUS)[keyof typeof BOARD_STATUS];

const BOARD_STATUSES: readonly BoardStatus[] = Object.values(BOARD_STATUS);

// The terminal pads the status column to its longest value.
export const BOARD_STATUS_COLUMN = Math.max(
  ...BOARD_STATUSES.map((status) => status.length),
);

export interface BoardItem {
  readonly id: string;
  readonly content: string;
  readonly status: BoardStatus;
}

export interface VisibleBoardRows {
  readonly indexes: readonly number[];
  readonly hiddenCount: number;
}

// U+2713 is the glyph the tool prints for a resolved item, not ornament.
const STATUS_MARKS: Readonly<Record<BoardStatus, string>> = {
  [BOARD_STATUS.IN_PROGRESS]: '>',
  [BOARD_STATUS.PENDING]: '-',
  [BOARD_STATUS.COMPLETED]: '\u2713',
};

const SELECTION_RANK: Readonly<Record<BoardStatus, number>> = {
  [BOARD_STATUS.IN_PROGRESS]: 0,
  [BOARD_STATUS.PENDING]: 1,
  [BOARD_STATUS.COMPLETED]: 2,
};

export function statusMark(status: BoardStatus): string {
  return STATUS_MARKS[status];
}

export function selectVisibleBoardRows(
  items: readonly BoardItem[],
  limit: number,
): VisibleBoardRows {
  if (items.length <= limit) {
    return { indexes: items.map((_item, index) => index), hiddenCount: 0 };
  }

  const indexes = items
    .map((item, index) => ({ index, rank: SELECTION_RANK[item.status] }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.index)
    .sort((left, right) => left - right);
  return { indexes, hiddenCount: items.length - indexes.length };
}

export function boardIdWidth(items: readonly BoardItem[]): number {
  return Math.max(1, ...items.map((item) => item.id.length));
}

export function countByStatus(
  items: readonly BoardItem[],
  status: BoardStatus,
): number {
  return items.filter((item) => item.status === status).length;
}
