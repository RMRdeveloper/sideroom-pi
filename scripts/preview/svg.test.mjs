import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESCAPE, RESET } from './ansi.mjs';
import { buildSvg, CANVAS, measurePanels, padLines } from './svg.mjs';

const RENDER_COLUMNS = 40;
const FONT_SIZE = 20;
const PLAIN = `${ESCAPE}[38;2;212;212;212m`;
const BACKGROUND_SELECTED = `${ESCAPE}[48;2;58;58;74m`;

function panelsFor(lines) {
  const entries = [{ lines, fontSize: FONT_SIZE }];
  const boxes = measurePanels(entries, RENDER_COLUMNS);
  return [{ box: boxes[0], lines }];
}

test('centres the panel stack on the canvas', () => {
  const boxes = measurePanels(
    [
      { lines: ['a', 'b'], fontSize: FONT_SIZE },
      { lines: ['c'], fontSize: FONT_SIZE },
    ],
    RENDER_COLUMNS,
  );

  assert.equal(boxes[0].x, 40);
  assert.equal(boxes[0].width, CANVAS.width - 80);
  assert.ok(boxes[1].y > boxes[0].y + boxes[0].height);
  const topMargin = boxes[0].y;
  const bottomMargin = CANVAS.height - (boxes[1].y + boxes[1].height);
  assert.ok(Math.abs(topMargin - bottomMargin) <= 1);
});

test('refuses a stack that is taller than the canvas', () => {
  const lines = Array.from({ length: 200 }, () => 'line');

  assert.throws(
    () => measurePanels([{ lines, fontSize: 30 }], RENDER_COLUMNS),
    /canvas/,
  );
});

test('refuses an unusable render column count', () => {
  const entries = [{ lines: ['a'], fontSize: FONT_SIZE }];

  assert.throws(() => measurePanels(entries, 0), /render columns/);
  assert.throws(() => measurePanels(entries, undefined), /render columns/);
});

test('declares the canvas size and the page background', () => {
  const svg = buildSvg(panelsFor([`${PLAIN}hi${RESET}`]));

  assert.match(svg, /width="1600" height="1000"/);
  assert.match(svg, /fill="#18181e"/);
});

test('escapes XML in the rendered text', () => {
  const svg = buildSvg(panelsFor([`${PLAIN}a & b <c>${RESET}`]));

  assert.match(svg, /a &amp; b &lt;c&gt;/);
});

test('paints a rectangle for a background run', () => {
  const svg = buildSvg(panelsFor([`${BACKGROUND_SELECTED} Rollout ${RESET}`]));

  assert.match(svg, /fill="#3a3a4a"/);
});

test('refuses to draw more lines than the panel was measured for', () => {
  const panels = panelsFor([`${PLAIN}one line${RESET}`]);

  assert.throws(
    () => buildSvg([{ ...panels[0], lines: ['one', 'two'] }]),
    /cannot draw/,
  );
});

test('pads short frames and rejects a target that is too small', () => {
  assert.deepEqual(padLines(['a'], 3), ['a', '', '']);
  assert.deepEqual(padLines(['a', 'b'], 2), ['a', 'b']);
  assert.throws(() => padLines(['a', 'b'], 1), /Cannot fit 2 lines/);
});
