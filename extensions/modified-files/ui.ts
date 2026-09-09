import { pathToFileURL } from 'node:url';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import {
  type Component,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import { displayModifiedPath, type ModifiedFile } from './model.ts';

const COMPACT_FILE_LIMIT = 5;
const EXTENDED_FILE_LIMIT = 12;

export function renderModifiedFilesWidget(
  files: readonly ModifiedFile[],
  cwd: string,
  theme: Theme,
): string[] | undefined {
  if (files.length === 0) {
    return undefined;
  }

  const visibleFiles = files.slice(0, COMPACT_FILE_LIMIT);
  const lines = [
    '',
    theme.fg(
      'dim',
      `── Edited files this session (${String(files.length)}) ──`,
    ),
    ...visibleFiles.map((file) => renderFileLine(file, cwd, theme)),
  ];
  lines.push(theme.fg('dim', 'F8: view all'));
  return lines;
}

export interface ModifiedFilesOverlayController {
  toggle(ctx: ExtensionContext): void;
}

export function createModifiedFilesOverlayController(
  files: () => readonly ModifiedFile[],
  clearFiles: (ctx: ExtensionContext) => void,
): ModifiedFilesOverlayController {
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
            return new ModifiedFilesOverlay(
              tui,
              files,
              ctx.cwd,
              theme,
              done,
              () => clearFiles(ctx),
            );
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

export class ModifiedFilesOverlay implements Component {
  private offset = 0;
  private readonly tui: TUI;
  private readonly files: () => readonly ModifiedFile[];
  private readonly cwd: string;
  private readonly theme: Theme;
  private readonly close: () => void;
  private readonly clear: () => void;

  constructor(
    tui: TUI,
    files: () => readonly ModifiedFile[],
    cwd: string,
    theme: Theme,
    close: () => void,
    clear: () => void,
  ) {
    this.tui = tui;
    this.files = files;
    this.cwd = cwd;
    this.theme = theme;
    this.close = close;
    this.clear = clear;
  }

  handleInput(data: string): void {
    const maxOffset = Math.max(0, this.files().length - EXTENDED_FILE_LIMIT);
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.f8)) {
      this.close();
      return;
    }
    if (matchesKey(data, 'r')) {
      this.clear();
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
      this.offset = Math.max(0, this.offset - EXTENDED_FILE_LIMIT);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
      this.offset = Math.min(maxOffset, this.offset + EXTENDED_FILE_LIMIT);
      this.tui.requestRender();
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const files = this.files();
    const visibleFiles = files.slice(
      this.offset,
      this.offset + EXTENDED_FILE_LIMIT,
    );
    const border = (text: string) => this.theme.fg('border', text);
    const line = (text: string) => truncateToWidth(text, innerWidth, '…', true);
    const title = line(
      ` Edited files during this session (${String(files.length)}) `,
    );
    const lines = [
      border(`╭${'─'.repeat(innerWidth)}╮`),
      `${border('│')}${line(this.theme.fg('accent', this.theme.bold(title)))}${border('│')}`,
      `${border('├')}${border('─'.repeat(innerWidth))}${border('┤')}`,
    ];

    for (const file of visibleFiles) {
      lines.push(
        `${border('│')}${line(renderFileLine(file, this.cwd, this.theme))}${border('│')}`,
      );
    }
    if (visibleFiles.length === 0) {
      lines.push(
        `${border('│')}${line(this.theme.fg('muted', ' No files edited yet.'))}${border('│')}`,
      );
    }

    const scrollHint = files.length > EXTENDED_FILE_LIMIT ? ' ↑↓ scroll ·' : '';
    lines.push(`${border('├')}${border('─'.repeat(innerWidth))}${border('┤')}`);
    lines.push(
      `${border('│')}${line(this.theme.fg('dim', `${scrollHint} R clear · F8 or Esc close`))}${border('│')}`,
    );
    lines.push(border(`╰${'─'.repeat(innerWidth)}╯`));
    return lines;
  }

  invalidate(): void {}
}

function renderFileLine(file: ModifiedFile, cwd: string, theme: Theme): string {
  const operation = file.toolName === 'write' ? 'write' : 'edit';
  const path = displayModifiedPath(cwd, file.path);
  return ` ${theme.fg('muted', `${operation} `)}${fileHyperlink(file.path, path)}`;
}

function fileHyperlink(path: string, label: string): string {
  const target = pathToFileURL(path).href;
  return `\u001B]8;;${target}\u0007${safeLabel(label)}\u001B]8;;\u0007`;
}

function safeLabel(value: string): string {
  return [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? '?' : character;
    })
    .join('');
}
