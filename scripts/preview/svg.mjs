// Panel geometry and SVG serialization for the preview assets.

import { parseAnsiLine } from './ansi.mjs';
import { PALETTE, SURFACE } from './theme.mjs';

export const CANVAS = Object.freeze({ width: 1600, height: 1000 });

const FONT_FAMILY = 'DejaVu Sans Mono';
const CELL_RATIO = 1233 / 2048; // DejaVu Sans Mono advance width, in em.
const LINE_RATIO = 1.45;
const PANEL_RADIUS = 20;
const PANEL_MARGIN = 40;
const PANEL_PADDING = 30;
const PANEL_GAP = 26;

function lineHeightOf(fontSize) {
  return fontSize * LINE_RATIO;
}

export function padLines(lines, lineCount) {
  if (lines.length > lineCount) {
    throw new Error(
      `Cannot fit ${lines.length} lines into ${lineCount} measured lines`,
    );
  }
  const padding = Array.from({ length: lineCount - lines.length }, () => '');
  return [...lines, ...padding];
}

// Panels stack top-aligned and the whole stack is centred. Measuring is a
// separate step so an animation can reserve one geometry for every frame, and
// renderColumns is the width the widgets were rendered at, which is what each
// panel centres inside its box.
export function measurePanels(entries, renderColumns) {
  if (!Number.isInteger(renderColumns) || renderColumns <= 0) {
    throw new Error(`Invalid render columns: ${renderColumns}`);
  }

  const heights = entries.map(
    (entry) =>
      entry.lines.length * lineHeightOf(entry.fontSize) + 2 * PANEL_PADDING,
  );
  const stackHeight =
    heights.reduce((total, height) => total + height, 0) +
    PANEL_GAP * (entries.length - 1);
  if (stackHeight > CANVAS.height) {
    throw new Error(
      `Panels need ${Math.round(stackHeight)}px on a ${CANVAS.height}px canvas`,
    );
  }
  let top = (CANVAS.height - stackHeight) / 2;

  return entries.map((entry, index) => {
    const height = heights[index];
    const box = {
      x: PANEL_MARGIN,
      y: Math.round(top),
      width: CANVAS.width - 2 * PANEL_MARGIN,
      height: Math.round(height),
      lineCount: entry.lines.length,
      fontSize: entry.fontSize,
      renderColumns,
    };
    top += height + PANEL_GAP;
    return box;
  });
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function runSvg(run, geometry) {
  const { originX, rowTop, cellWidth, lineHeight, baseline, fontSize } =
    geometry;
  const runLeft = originX + run.column * cellWidth;
  const parts = [];

  if (run.bg !== null) {
    parts.push(
      `<rect x="${runLeft.toFixed(2)}" y="${rowTop.toFixed(2)}" width="${(run.text.length * cellWidth).toFixed(2)}" height="${lineHeight.toFixed(2)}" fill="${run.bg}"/>`,
    );
  }
  if (run.text.trim().length === 0) {
    return parts;
  }

  const weight = run.bold ? ' font-weight="bold"' : '';
  const fill = run.fg ?? PALETTE.text;
  parts.push(
    `<text x="${runLeft.toFixed(2)}" y="${baseline.toFixed(2)}" font-family="${FONT_FAMILY}" font-size="${fontSize}"${weight} fill="${fill}">${escapeXml(run.text)}</text>`,
  );
  return parts;
}

function panelSvg(panel) {
  const { box, lines } = panel;
  if (lines.length > box.lineCount) {
    throw new Error(
      `Panel measured for ${box.lineCount} lines cannot draw ${lines.length}`,
    );
  }

  const cellWidth = box.fontSize * CELL_RATIO;
  const lineHeight = lineHeightOf(box.fontSize);
  const originX = box.x + (box.width - box.renderColumns * cellWidth) / 2;
  const baselineOffset = lineHeight * 0.5 + box.fontSize * 0.35;
  const parts = [
    `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${PANEL_RADIUS}" fill="${SURFACE.panel}" stroke="${SURFACE.border}" stroke-width="2"/>`,
  ];

  for (let row = 0; row < lines.length; row += 1) {
    const rowTop = box.y + PANEL_PADDING + row * lineHeight;
    const geometry = {
      originX,
      rowTop,
      cellWidth,
      lineHeight,
      baseline: rowTop + baselineOffset,
      fontSize: box.fontSize,
    };
    for (const run of parseAnsiLine(lines[row] ?? '')) {
      parts.push(...runSvg(run, geometry));
    }
  }

  return parts;
}

export function buildSvg(panels) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}" viewBox="0 0 ${CANVAS.width} ${CANVAS.height}" xml:space="preserve">`,
    `<rect width="${CANVAS.width}" height="${CANVAS.height}" fill="${SURFACE.page}"/>`,
    ...panels.flatMap(panelSvg),
    '</svg>',
  ].join('\n');
}
