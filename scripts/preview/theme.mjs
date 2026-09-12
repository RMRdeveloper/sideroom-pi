// Snapshot of pi's own dark theme, taken from
// pi-coding-agent/dist/modes/interactive/theme/dark.json.

import { ESCAPE, RESET } from './ansi.mjs';

export const PALETTE = Object.freeze({
  accent: '#8abeb7',
  text: '#d4d4d4',
  muted: '#808080',
  dim: '#666666',
  success: '#b5bd68',
  warning: '#ffff00',
});

const BACKGROUNDS = Object.freeze({ selectedBg: '#3a3a4a' });

export const SURFACE = Object.freeze({
  page: '#18181e',
  panel: '#1e1e24',
  border: '#2e2e38',
});

const FOREGROUND_PREFIX = '38';
const BACKGROUND_PREFIX = '48';

function toTrueColorAnsi(prefix, hexColor) {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hexColor.slice(offset, offset + 2), 16),
  );
  return `${ESCAPE}[${prefix};2;${channels.join(';')}m`;
}

function resolveColor(name, table) {
  const value = table[name];
  if (value === undefined) {
    throw new Error(`Unknown theme color: ${name}`);
  }
  return value;
}

// The subset of pi's Theme that the rendered widgets call.
export function createTheme() {
  return {
    fg: (name, text) =>
      `${toTrueColorAnsi(FOREGROUND_PREFIX, resolveColor(name, PALETTE))}${text}${RESET}`,
    bg: (name, text) =>
      `${toTrueColorAnsi(BACKGROUND_PREFIX, resolveColor(name, BACKGROUNDS))}${text}${RESET}`,
    bold: (text) => `${ESCAPE}[1m${text}${RESET}`,
  };
}
