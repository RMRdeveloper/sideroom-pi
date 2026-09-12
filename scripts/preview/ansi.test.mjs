import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESCAPE, parseAnsiLine, RESET } from './ansi.mjs';

const FOREGROUND_ACCENT = `${ESCAPE}[38;2;138;190;183m`;
const FOREGROUND_MUTED = `${ESCAPE}[38;2;128;128;128m`;
const BACKGROUND_SELECTED = `${ESCAPE}[48;2;58;58;74m`;
const BELL = '\u0007';

function textOf(runs) {
  return runs.map((run) => run.text).join('');
}

test('reads a truecolor foreground and the text it covers', () => {
  const runs = parseAnsiLine(`${FOREGROUND_ACCENT}hello${RESET}`);

  assert.deepEqual(runs, [
    { fg: '#8abeb7', bg: null, bold: false, column: 0, text: 'hello' },
  ]);
});

test('keeps the background when a foreground wraps it', () => {
  const runs = parseAnsiLine(
    `${BACKGROUND_SELECTED}${FOREGROUND_ACCENT}Rollout${RESET}${RESET}`,
  );

  assert.equal(runs.length, 1);
  assert.equal(runs[0].fg, '#8abeb7');
  assert.equal(runs[0].bg, '#3a3a4a');
});

test('marks bold until a reset clears it', () => {
  const runs = parseAnsiLine(`${ESCAPE}[1mprompt${RESET}plain`);

  assert.equal(runs[0].bold, true);
  assert.equal(runs[1].bold, false);
  assert.equal(textOf(runs), 'promptplain');
});

test('counts columns by visible characters only', () => {
  const runs = parseAnsiLine(
    `${FOREGROUND_ACCENT}ab${RESET}${FOREGROUND_MUTED}cd${RESET}`,
  );

  assert.deepEqual(
    runs.map((run) => run.column),
    [0, 2],
  );
  assert.deepEqual(
    runs.map((run) => run.text),
    ['ab', 'cd'],
  );
});

test('merges adjacent runs that share a style', () => {
  const runs = parseAnsiLine(
    `${FOREGROUND_ACCENT}a${RESET}${FOREGROUND_ACCENT}b${RESET}`,
  );

  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, 'ab');
});

test('drops an OSC 8 hyperlink and keeps its label', () => {
  const hyperlink = `${ESCAPE}]8;;file:///tmp/checks.ts${BELL}extensions/rules/checks.ts${ESCAPE}]8;;${BELL}`;

  assert.equal(textOf(parseAnsiLine(hyperlink)), 'extensions/rules/checks.ts');
});

test('drops cursor movement sequences and stray control characters', () => {
  const line = `${ESCAPE}[2Aline${ESCAPE}[K\u0007end`;

  assert.equal(textOf(parseAnsiLine(line)), 'lineend');
});

test('ignores unknown SGR parameters without losing text', () => {
  const runs = parseAnsiLine(`${ESCAPE}[4munderlined${RESET}`);

  assert.equal(runs[0].text, 'underlined');
  assert.equal(runs[0].fg, null);
});
