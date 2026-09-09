import type { Theme } from '@earendil-works/pi-coding-agent';
import { formatBoardBlock, TODO_STATUS, type TodoItem } from './model.ts';

export function renderTodoWidget(
  items: readonly TodoItem[],
  theme: Theme,
): string[] | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const active = items.filter(
    (item) => item.status === TODO_STATUS.inProgress,
  ).length;
  const queued = items.filter(
    (item) => item.status === TODO_STATUS.pending,
  ).length;
  const blockLines = formatBoardBlock(items).split('\n');
  const rows = blockLines.slice(1, 1 + items.length);
  const header = theme.fg(
    'accent',
    theme.bold(
      `Sideroom board (${String(active)} active, ${String(queued)} queued)`,
    ),
  );
  const renderedRows = rows.map((row, index) => {
    const item = items[index];
    if (item === undefined) {
      return row;
    }
    if (item.status === TODO_STATUS.inProgress) {
      return theme.fg('success', row);
    }
    if (item.status === TODO_STATUS.pending) {
      return theme.fg('text', row);
    }
    return theme.fg('muted', row);
  });

  return [header, ...renderedRows];
}
