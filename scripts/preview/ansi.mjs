// Turns one TUI line into styled runs. The widgets hand back truecolor SGR
// sequences, and the edited-files widget also wraps paths in OSC 8 hyperlinks.

export const ESCAPE = '\u001b';
export const RESET = `${ESCAPE}[0m`;

const BELL = '\u0007';
const LOW_CONTROL_END = 0x08;
const CONTROL_GAP_START = 0x0b;
const CONTROL_GAP_END = 0x1f;
const DELETE_CODE = 0x7f;
const FOREGROUND_CODE = 38;
const BACKGROUND_CODE = 48;
const TRUECOLOR_CODE = 2;
const RESET_CODE = 0;
const BOLD_CODE = 1;
const BOLD_OFF_CODE = 22;
const FOREGROUND_OFF_CODE = 39;
const BACKGROUND_OFF_CODE = 49;
const TRUECOLOR_PARAMETER_COUNT = 4;

// RegExp objects rather than literals: the linter rejects a control range
// written inline in a pattern, and its autofix rewrites the literal back.
const SGR_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;]*)m`, 'g');
const OSC_PATTERN = new RegExp(
  `${ESCAPE}\\][^${BELL}${ESCAPE}]*(?:${BELL}|${ESCAPE}\\\\)?`,
  'g',
);
const CSI_PATTERN = new RegExp(`${ESCAPE}\\[([0-9;?]*)([A-Za-z])`, 'g');

const UNSTYLED = { fg: null, bg: null, bold: false };

function isTerminalControl(character) {
  const code = character.codePointAt(0) ?? 0;
  const isLowControl =
    code <= LOW_CONTROL_END ||
    (code >= CONTROL_GAP_START && code <= CONTROL_GAP_END);
  return isLowControl || code === DELETE_CODE;
}

function stripControlCharacters(text) {
  let cleaned = '';
  for (const character of text) {
    if (!isTerminalControl(character)) {
      cleaned += character;
    }
  }
  return cleaned;
}

// A hyperlink ends with BEL or with the string terminator, and the text between
// them must not reach the SVG.
function stripTerminalEscapes(line) {
  return line
    .replace(OSC_PATTERN, '')
    .replace(CSI_PATTERN, (sequence, _parameters, finalByte) =>
      finalByte === 'm' ? sequence : '',
    );
}

function readColor(codes, start) {
  const channels = codes.slice(start, start + 3);
  if (channels.length !== 3 || !channels.every(Number.isInteger)) {
    return undefined;
  }
  const hex = channels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('');
  return `#${hex}`;
}

function parseSgr(style, parametersText) {
  const codes =
    parametersText.length === 0
      ? [RESET_CODE]
      : parametersText.split(';').map(Number);
  let next = { ...style };

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index];
    if (code === RESET_CODE) {
      next = { ...UNSTYLED };
    } else if (code === BOLD_CODE) {
      next = { ...next, bold: true };
    } else if (code === BOLD_OFF_CODE) {
      next = { ...next, bold: false };
    } else if (code === FOREGROUND_OFF_CODE) {
      next = { ...next, fg: null };
    } else if (code === BACKGROUND_OFF_CODE) {
      next = { ...next, bg: null };
    } else if (
      (code === FOREGROUND_CODE || code === BACKGROUND_CODE) &&
      codes[index + 1] === TRUECOLOR_CODE
    ) {
      const color = readColor(codes, index + 2);
      if (color !== undefined) {
        next = { ...next, [code === FOREGROUND_CODE ? 'fg' : 'bg']: color };
      }
      index += TRUECOLOR_PARAMETER_COUNT;
    }
  }

  return next;
}

function hasSameStyle(run, segment) {
  return (
    run.fg === segment.fg && run.bg === segment.bg && run.bold === segment.bold
  );
}

// The column of a run is its visible offset, so escapes must not count.
function mergeAdjacentRuns(segments) {
  const runs = [];
  let column = 0;

  for (const segment of segments) {
    const previous = runs.at(-1);
    if (previous !== undefined && hasSameStyle(previous, segment)) {
      runs[runs.length - 1] = {
        ...previous,
        text: previous.text + segment.text,
      };
    } else {
      runs.push({ ...segment, column });
    }
    column += segment.text.length;
  }

  return runs;
}

export function parseAnsiLine(rawLine) {
  const line = stripTerminalEscapes(rawLine);
  const segments = [];
  let style = { ...UNSTYLED };
  let cursor = 0;

  function collect(rawText) {
    const text = stripControlCharacters(rawText);
    if (text.length === 0) {
      return;
    }
    segments.push({ fg: style.fg, bg: style.bg, bold: style.bold, text });
  }

  for (const match of line.matchAll(SGR_PATTERN)) {
    const matchIndex = match.index ?? 0;
    collect(line.slice(cursor, matchIndex));
    style = parseSgr(style, match[1] ?? '');
    cursor = matchIndex + match[0].length;
  }
  collect(line.slice(cursor));

  return mergeAdjacentRuns(segments);
}
