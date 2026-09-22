import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import { JEV_STATUS } from './guard.ts';
import {
  JevKeyOverlay,
  MAX_KEY_LENGTH,
  readPastedKey,
  statusLabel,
} from './ui.ts';

interface Recorded {
  readonly stored: string[];
  cleared: number;
  retried: number;
  usage: number;
}

interface Harness {
  readonly overlay: JevKeyOverlay;
  readonly recorded: Recorded;
  readonly closed: boolean[];
  readonly notifications: string[];
}

function createOverlay(): Harness {
  const recorded: Recorded = { stored: [], cleared: 0, retried: 0, usage: 0 };
  const closed: boolean[] = [];
  const notifications: string[] = [];
  const tui = { requestRender() {} } as unknown as TUI;
  const theme = {
    fg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as unknown as Theme;
  const ctx = {
    mode: 'tui',
    ui: {
      notify(message: string) {
        notifications.push(message);
      },
    },
  } as unknown as ExtensionContext;

  const overlay = new JevKeyOverlay(
    tui,
    theme,
    () => {
      closed.push(true);
    },
    {
      store: (apiKey) => {
        recorded.stored.push(apiKey);
      },
      clear: () => {
        recorded.cleared += 1;
      },
      retry: () => {
        recorded.retried += 1;
      },
      origin: () => undefined,
      usage: () => recorded.usage,
      refresh: () => {},
    },
    ctx,
  );

  return { overlay, recorded, closed, notifications };
}

function renderedMask(overlay: JevKeyOverlay, width = 60): string {
  return overlay.render(width).join('\n');
}

// The rendered line is truncated to the panel width, so the cap is only visible
// in a panel wide enough to hold it.
function maskCount(overlay: JevKeyOverlay, width = 60): number {
  return renderedMask(overlay, width).split('•').length - 1;
}

test('shows the session call count on the capture screen', () => {
  const { overlay, recorded } = createOverlay();
  recorded.usage = 12;
  assert.match(renderedMask(overlay), /calls this session: 12/);
});

test('appends the session call count to the footer label', () => {
  assert.equal(statusLabel(JEV_STATUS.ready), 'jev: ready');
  assert.equal(
    statusLabel(JEV_STATUS.ready, 'jev-1.13.0'),
    'jev: ready (jev-1.13.0)',
  );
  assert.equal(
    statusLabel(JEV_STATUS.ready, 'jev-1.13.0', 1),
    'jev: ready (jev-1.13.0) · 1 call',
  );
  assert.equal(
    statusLabel(JEV_STATUS.quota, undefined, 4),
    'jev: out of quota (F10) · 4 calls',
  );
});

test('reads the payload out of a bracketed paste', () => {
  assert.equal(readPastedKey('\x1b[200~ts_abc123\x1b[201~'), 'ts_abc123');
  assert.equal(readPastedKey('before\x1b[200~ts_abc\x1b[201~after'), 'ts_abc');
  assert.equal(readPastedKey('\x1b[200~ts_abc'), 'ts_abc');
  assert.equal(readPastedKey('ts_abc'), undefined);
});

test('drops what a key cannot contain', () => {
  assert.equal(readPastedKey('\x1b[200~ts_abc123\n\x1b[201~'), 'ts_abc123');
  assert.equal(readPastedKey('\x1b[200~ts abc\tdef\x1b[201~'), 'tsabcdef');
  assert.equal(readPastedKey('\x1b[200~\n\n\x1b[201~'), '');
});

test('puts a pasted key in the field', () => {
  const { overlay } = createOverlay();
  overlay.handleInput('\x1b[200~ts_secret_key\x1b[201~');
  assert.equal(maskCount(overlay), 'ts_secret_key'.length);
});

test('stores the pasted key on Enter and never renders it', () => {
  const { overlay, recorded } = createOverlay();
  overlay.handleInput('\x1b[200~ts_secret_key\x1b[201~');
  assert.equal(renderedMask(overlay).includes('ts_secret_key'), false);

  overlay.handleInput('\r');
  assert.deepEqual(recorded.stored, ['ts_secret_key']);
});

test('still accepts typed characters and backspace', () => {
  const { overlay } = createOverlay();
  overlay.handleInput('a');
  overlay.handleInput('b');
  overlay.handleInput('c');
  assert.equal(maskCount(overlay), 3);

  overlay.handleInput('\x7f');
  assert.equal(maskCount(overlay), 2);
});

test('caps the field so a huge paste cannot grow it', () => {
  const { overlay } = createOverlay();
  overlay.handleInput(`\x1b[200~${'a'.repeat(MAX_KEY_LENGTH * 2)}\x1b[201~`);
  assert.equal(maskCount(overlay, MAX_KEY_LENGTH * 2), MAX_KEY_LENGTH);
});

test('clears the stored key and the field', () => {
  const { overlay, recorded, notifications, closed } = createOverlay();
  overlay.handleInput('\x1b[200~ts_secret_key\x1b[201~');
  overlay.handleInput('\x15');

  assert.equal(recorded.cleared, 1);
  assert.equal(recorded.retried, 1);
  assert.equal(maskCount(overlay), 0);
  assert.equal(notifications.length, 1);
  assert.equal(closed.length, 1);
});

test('ignores Enter on an empty field', () => {
  const { overlay, recorded, closed } = createOverlay();
  overlay.handleInput('\r');
  assert.deepEqual(recorded.stored, []);
  assert.deepEqual(closed, []);
});
