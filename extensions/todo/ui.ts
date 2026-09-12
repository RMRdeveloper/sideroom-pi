import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import {
  type Component,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import {
  formatBoardBlock,
  TODO_STATUS,
  type TodoItem,
  type TodoStatus,
} from './model.ts';

const COMPACT_ROW_LIMIT = 5;
const EXTENDED_ROW_LIMIT = 12;

const SELECTION_RANK = {
  inProgress: 0,
  pending: 1,
  resolved: 2,
} as const;

export interface VisibleBoardRows {
  readonly indexes: readonly number[];
  readonly hiddenCount: number;
}

export function selectVisibleBoardRows(
  items: readonly TodoItem[],
  limit: number,
): VisibleBoardRows {
  if (items.length <= limit) {
    return { indexes: items.map((_item, index) => index), hiddenCount: 0 };
  }

  const indexes = items
    .map((item, index) => ({ index, rank: selectionRank(item) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .slice(0, limit)
    .map((row) => row.index)
    .sort((left, right) => left - right);
  return { indexes, hiddenCount: items.length - indexes.length };
}

export function renderTodoWidget(
  items: readonly TodoItem[],
  theme: Theme,
): string[] | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const rows = boardRowLines(items);
  const visible = selectVisibleBoardRows(items, COMPACT_ROW_LIMIT);
  const renderedRows = visible.indexes.flatMap((index) => {
    const item = items[index];
    const row = rows[index];
    if (item === undefined || row === undefined) {
      return [];
    }
    return [colorizeBoardRow(row, item.status, theme)];
  });
  const lines = [
    theme.fg('accent', theme.bold(boardHeader(items))),
    ...renderedRows,
  ];
  if (visible.hiddenCount > 0) {
    lines.push(theme.fg('dim', hiddenRowsHint(visible.hiddenCount)));
  }
  return lines;
}

export interface TodoBoardOverlayController {
  toggle(ctx: ExtensionContext): void;
}

export function createTodoBoardOverlayController(
  items: () => readonly TodoItem[],
): TodoBoardOverlayController {
  let close: (() => void) | undefined;
  let opening = false;

  return {
    toggle(ctx) {
      if (close !== undefined) {
        close();
        return;
      }
      if (opening || ctx.mode !== 'tui') {
        return;
      }

      opening = true;
      void ctx.ui
        .custom<void>(
          (tui, theme, _keybindings, done) => {
            close = done;
            return new TodoBoardOverlay(tui, items, theme, done);
          },
          {
            overlay: true,
            overlayOptions: {
              anchor: 'center',
              width: '70%',
              minWidth: 40,
              maxHeight: '80%',
              visible: (terminalWidth) => terminalWidth >= 60,
            },
          },
        )
        .finally(() => {
          close = undefined;
          opening = false;
        });
    },
  };
}

export class TodoBoardOverlay implements Component {
  private offset = 0;
  private readonly tui: TUI;
  private readonly items: () => readonly TodoItem[];
  private readonly theme: Theme;
  private readonly close: () => void;

  constructor(
    tui: TUI,
    items: () => readonly TodoItem[],
    theme: Theme,
    close: () => void,
  ) {
    this.tui = tui;
    this.items = items;
    this.theme = theme;
    this.close = close;
  }

  handleInput(data: string): void {
    const maxOffset = Math.max(0, this.items().length - EXTENDED_ROW_LIMIT);
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.f9)) {
      this.close();
      return;
    }
    if (matchesKey(data, Key.up)) {
      this.offset = Math.max(0, this.offset - 1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.offset = Math.min(maxOffset, this.offset + 1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageUp)) {
      this.offset = Math.max(0, this.offset - EXTENDED_ROW_LIMIT);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.offset = Math.min(maxOffset, this.offset + EXTENDED_ROW_LIMIT);
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const items = this.items();
    const rows = boardRowLines(items);
    const visibleRows = items
      .map((item, index) => ({ item, row: rows[index] }))
      .slice(this.offset, this.offset + EXTENDED_ROW_LIMIT);
    const border = (text: string) => this.theme.fg('border', text);
    const line = (text: string) => truncateToWidth(text, innerWidth, '…', true);
    const title = line(` Work board (${String(items.length)}) `);
    const lines = [
      border(`╭${'─'.repeat(innerWidth)}╮`),
      `${border('│')}${line(this.theme.fg('accent', this.theme.bold(title)))}${border('│')}`,
      `${border('├')}${border('─'.repeat(innerWidth))}${border('┤')}`,
    ];

    for (const entry of visibleRows) {
      const row =
        entry.row === undefined
          ? ''
          : colorizeBoardRow(entry.row, entry.item.status, this.theme);
      lines.push(`${border('│')}${line(row)}${border('│')}`);
    }
    if (items.length === 0) {
      lines.push(
        `${border('│')}${line(this.theme.fg('muted', ' No items on the board.'))}${border('│')}`,
      );
    }

    const scrollHint = items.length > EXTENDED_ROW_LIMIT ? ' ↑↓ scroll ·' : '';
    lines.push(`${border('├')}${border('─'.repeat(innerWidth))}${border('┤')}`);
    lines.push(
      `${border('│')}${line(this.theme.fg('dim', `${scrollHint} F9 or Esc close`))}${border('│')}`,
    );
    lines.push(border(`╰${'─'.repeat(innerWidth)}╯`));
    return lines;
  }

  invalidate(): void {}
}

function selectionRank(item: TodoItem): number {
  if (item.status === TODO_STATUS.inProgress) {
    return SELECTION_RANK.inProgress;
  }
  if (item.status === TODO_STATUS.pending) {
    return SELECTION_RANK.pending;
  }
  return SELECTION_RANK.resolved;
}

function boardHeader(items: readonly TodoItem[]): string {
  const active = items.filter(
    (item) => item.status === TODO_STATUS.inProgress,
  ).length;
  const queued = items.filter(
    (item) => item.status === TODO_STATUS.pending,
  ).length;
  return `Sideroom board (${String(active)} active, ${String(queued)} queued)`;
}

function boardRowLines(items: readonly TodoItem[]): string[] {
  return formatBoardBlock(items)
    .split('\n')
    .slice(1, 1 + items.length);
}

function colorizeBoardRow(
  row: string,
  status: TodoStatus,
  theme: Theme,
): string {
  if (status === TODO_STATUS.inProgress) {
    return theme.fg('success', row);
  }
  if (status === TODO_STATUS.pending) {
    return theme.fg('text', row);
  }
  return theme.fg('muted', row);
}

function hiddenRowsHint(hiddenCount: number): string {
  return `…+${String(hiddenCount)} more · F9: view all`;
}
