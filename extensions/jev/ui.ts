import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import {
  type Component,
  Key,
  matchesKey,
  type TUI,
  truncateToWidth,
} from '@earendil-works/pi-tui';
import { JEV_STATUS, type JevStatus } from './guard.ts';
import { JEV_KEY_ENV_VAR, type JevKeySource } from './key.ts';

export const JEV_STATUS_KEY = 'sideroom-jev';
export const JEV_SHORTCUT = 'f10';

const MASK_CHARACTER = '•';
const CLEAR_KEY = Key.ctrl('u');

// Pi wraps every paste in bracketed-paste markers before it reaches a component,
// so the leading escape byte made the whole chunk look like a control sequence
// and nothing landed in the field.
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

// A pasted line usually carries a trailing newline, and no key holds
// whitespace, so everything unprintable is dropped.
export const MAX_KEY_LENGTH = 512;

const STATUS_LABEL: Readonly<Record<JevStatus, string>> = {
  [JEV_STATUS.ready]: 'jev: ready',
  [JEV_STATUS.noKey]: 'jev: no key (F10)',
  [JEV_STATUS.quota]: 'jev: out of quota (F10)',
  [JEV_STATUS.auth]: 'jev: key rejected (F10)',
  [JEV_STATUS.unavailable]: 'jev: unreachable',
};

export interface JevKeyActions {
  readonly store: (apiKey: string) => void;
  readonly clear: () => void;
  readonly retry: () => void;
  readonly origin: () => JevKeySource['origin'] | undefined;
  readonly usage: () => number;
  readonly refresh: (ctx: ExtensionContext) => void;
}

export interface JevKeyController {
  open(ctx: ExtensionContext): void;
}

export function statusLabel(
  status: JevStatus,
  model?: string,
  calls = 0,
): string {
  const base =
    status === JEV_STATUS.ready && model !== undefined
      ? `jev: ready (${model})`
      : STATUS_LABEL[status];
  if (calls === 0) {
    return base;
  }
  return `${base} · ${String(calls)} call${calls === 1 ? '' : 's'}`;
}

export function createJevKeyController(
  actions: JevKeyActions,
): JevKeyController {
  let opening = false;

  return {
    open(ctx) {
      if (opening) {
        return;
      }
      if (ctx.mode !== 'tui') {
        ctx.ui.notify(
          `Set ${JEV_KEY_ENV_VAR} in the environment: capturing a key needs the terminal.`,
          'warning',
        );
        return;
      }
      opening = true;
      void ctx.ui
        .custom<void>(
          (tui, theme, _keybindings, done) =>
            new JevKeyOverlay(tui, theme, done, actions, ctx),
          {
            overlay: true,
            overlayOptions: {
              anchor: 'center',
              width: '70%',
              minWidth: 44,
              maxHeight: '60%',
              visible: (terminalWidth) => terminalWidth >= 60,
            },
          },
        )
        .finally(() => {
          opening = false;
        });
    },
  };
}

// The packaged Input component has no masking, and a key must never render, so
// this draws its own single masked field.
export class JevKeyOverlay implements Component {
  private entry = '';
  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly close: () => void;
  private readonly actions: JevKeyActions;
  private readonly ctx: ExtensionContext;

  constructor(
    tui: TUI,
    theme: Theme,
    close: () => void,
    actions: JevKeyActions,
    ctx: ExtensionContext,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.close = close;
    this.actions = actions;
    this.ctx = ctx;
  }

  handleInput(keyData: string): void {
    const pasted = readPastedKey(keyData);
    if (pasted !== undefined) {
      this.append(pasted);
      return;
    }
    if (matchesKey(keyData, Key.escape)) {
      this.close();
      return;
    }
    if (matchesKey(keyData, Key.enter)) {
      this.save();
      return;
    }
    if (matchesKey(keyData, Key.backspace)) {
      this.entry = this.entry.slice(0, -1);
      this.tui.requestRender();
      return;
    }
    if (matchesKey(keyData, CLEAR_KEY)) {
      this.clearStored();
      return;
    }
    if (isTypedCharacter(keyData)) {
      this.append(keyData);
    }
  }

  private append(text: string): void {
    if (text.length === 0) {
      return;
    }
    this.entry = `${this.entry}${text}`.slice(0, MAX_KEY_LENGTH);
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - 2);
    const border = (text: string) => this.theme.fg('border', text);
    const line = (text: string) => truncateToWidth(text, innerWidth, '…', true);
    const row = (text: string) => `${border('│')}${line(text)}${border('│')}`;

    const lines = [
      border(`╭${'─'.repeat(innerWidth)}╮`),
      row(this.theme.fg('accent', this.theme.bold(' Jev API key '))),
      border(`├${'─'.repeat(innerWidth)}┤`),
      row(` ${MASK_CHARACTER.repeat(this.entry.length)}`),
      row(this.theme.fg('dim', ` source: ${this.originLabel()}`)),
      row(
        this.theme.fg(
          'dim',
          ` calls this session: ${String(this.actions.usage())}`,
        ),
      ),
      border(`├${'─'.repeat(innerWidth)}┤`),
      row(
        this.theme.fg(
          'dim',
          ' The key is stored in sideroom.json, never in the session.',
        ),
      ),
      row(
        this.theme.fg(
          'dim',
          ` ${JEV_KEY_ENV_VAR} wins over the file when both are set.`,
        ),
      ),
      border(`├${'─'.repeat(innerWidth)}┤`),
      row(this.theme.fg('dim', ' Enter save · Ctrl+U clear · Esc close')),
      border(`╰${'─'.repeat(innerWidth)}╯`),
    ];
    return lines;
  }

  invalidate(): void {}

  private save(): void {
    const apiKey = this.entry.trim();
    if (apiKey.length === 0) {
      return;
    }
    this.actions.store(apiKey);
    this.finish('Jev API key stored.');
  }

  private clearStored(): void {
    this.entry = '';
    this.actions.clear();
    this.finish('Jev API key cleared.');
  }

  private finish(message: string): void {
    this.actions.retry();
    this.actions.refresh(this.ctx);
    this.ctx.ui.notify(message, 'info');
    this.close();
  }

  private originLabel(): string {
    const origin = this.actions.origin();
    if (origin === 'environment') {
      return `from ${JEV_KEY_ENV_VAR}`;
    }
    if (origin === 'config') {
      return 'stored in sideroom.json';
    }
    return 'not configured';
  }
}

// Pi re-wraps paste content as `ESC[200~ ... ESC[201~`, so the payload is read
// between the markers. A paste split across chunks still contributes whatever
// arrived after the opening marker.
export function readPastedKey(keyData: string): string | undefined {
  const start = keyData.indexOf(PASTE_START);
  if (start === -1) {
    return undefined;
  }
  const from = start + PASTE_START.length;
  const end = keyData.indexOf(PASTE_END, from);
  const body = end === -1 ? keyData.slice(from) : keyData.slice(from, end);
  return printableOnly(body);
}

// C0 control bytes and DEL are the only boundaries that matter here, and they
// live in one place so the two input paths cannot drift apart.
function isControlCode(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

// Paste drops the space as well: no key holds one, and a pasted line carries a
// trailing newline that would otherwise sit right before the closing marker.
function printableOnly(text: string): string {
  let printable = '';
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (!isControlCode(code) && character !== ' ') {
      printable += character;
    }
  }
  return printable;
}

function isTypedCharacter(keyData: string): boolean {
  if (keyData.length === 0) {
    return false;
  }
  for (const character of keyData) {
    if (isControlCode(character.codePointAt(0) ?? 0)) {
      return false;
    }
  }
  return true;
}
