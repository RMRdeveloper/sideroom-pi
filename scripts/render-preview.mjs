// Regenerates media/preview.png and media/preview.mp4, the gallery assets that
// package.json declares as pi.image and pi.video.
//
// The widgets only expose render(width) -> ANSI lines, so the scenes drive them
// with a stub host, and librsvg (which the local ffmpeg build ships) turns the
// result into the committed PNG and MP4. Run it with `npm run preview`.

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFfmpegAvailable,
  encodeFrames,
  rasterizeSvg,
  readImageSize,
  readVideoDurationSeconds,
} from './preview/ffmpeg.mjs';
import {
  assertDeclaredMediaMatches,
  IMAGE_FILE_NAME,
  VIDEO_FILE_NAME,
} from './preview/media-manifest.mjs';
import {
  answerTwoQuestions,
  boardLines,
  COLUMNS,
  collectQuestionFrames,
  createAskComponent,
  FINAL_SCENE_FRAMES,
  renderAskLines,
} from './preview/scenes.mjs';
import { buildSvg, CANVAS, measurePanels, padLines } from './preview/svg.mjs';
import { createTheme } from './preview/theme.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MEDIA_DIR = join(REPO_ROOT, 'media');
const PACKAGE_MANIFEST_PATH = join(REPO_ROOT, 'package.json');
const FRAME_DIR = join(tmpdir(), 'sideroom-preview-frames');
const FRAME_PREFIX = 'frame-';
const FRAME_DIGITS = 4;
const FRAME_PATTERN = join(FRAME_DIR, `${FRAME_PREFIX}%0${FRAME_DIGITS}d.png`);
const STILL_NAME = 'still';
const FONT_SIZE = 23;
const FRAME_RATE = 12;

function frameName(index) {
  return `${FRAME_PREFIX}${String(index).padStart(FRAME_DIGITS, '0')}`;
}

function svgPathFor(name) {
  return join(FRAME_DIR, `${name}.svg`);
}

function framePngPath(index) {
  return join(FRAME_DIR, `${frameName(index)}.png`);
}

function writeSvg(svgPath, panels) {
  mkdirSync(FRAME_DIR, { recursive: true });
  writeFileSync(svgPath, buildSvg(panels));
}

// A panel pairs a measured box with the lines drawn inside it.
function toPanels(entries) {
  const boxes = measurePanels(entries, COLUMNS);
  return entries.map((entry, index) => ({
    box: boxes[index],
    lines: entry.lines,
  }));
}

function resetFrameDirectory() {
  mkdirSync(FRAME_DIR, { recursive: true });
  for (const entry of readdirSync(FRAME_DIR)) {
    rmSync(join(FRAME_DIR, entry));
  }
}

function readPackageManifest() {
  const contents = readFileSync(PACKAGE_MANIFEST_PATH, 'utf8');
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Unreadable ${PACKAGE_MANIFEST_PATH}`, { cause: error });
  }
}

async function renderImage(theme) {
  const ask = await createAskComponent(theme);
  answerTwoQuestions(ask);
  const panels = toPanels([
    { lines: renderAskLines(ask), fontSize: FONT_SIZE },
    {
      lines: boardLines(theme, REPO_ROOT, { includeEditedFiles: false }),
      fontSize: FONT_SIZE,
    },
  ]);

  const svgPath = svgPathFor(STILL_NAME);
  const imagePath = join(MEDIA_DIR, IMAGE_FILE_NAME);
  writeSvg(svgPath, panels);
  rasterizeSvg(svgPath, imagePath);
  return imagePath;
}

async function renderVideo(theme) {
  const { ask, frames: questionFrames } = await collectQuestionFrames(theme);
  const questionLineCount = Math.max(
    ...questionFrames.map((lines) => lines.length),
  );
  const questionPanels = questionFrames.map((lines) =>
    toPanels([
      { lines: padLines(lines, questionLineCount), fontSize: FONT_SIZE },
    ]),
  );
  const finalScene = toPanels([
    { lines: renderAskLines(ask), fontSize: FONT_SIZE },
    {
      lines: boardLines(theme, REPO_ROOT, { includeEditedFiles: true }),
      fontSize: FONT_SIZE,
    },
  ]);
  const frames = [
    ...questionPanels,
    ...Array.from({ length: FINAL_SCENE_FRAMES }, () => finalScene),
  ];

  resetFrameDirectory();
  frames.forEach((panels, index) => {
    const svgPath = svgPathFor(frameName(index));
    writeSvg(svgPath, panels);
    rasterizeSvg(svgPath, framePngPath(index));
  });

  const videoPath = join(MEDIA_DIR, VIDEO_FILE_NAME);
  encodeFrames(FRAME_PATTERN, videoPath, FRAME_RATE);
  return videoPath;
}

function assertImageMatchesCanvas(imagePath) {
  const { width, height } = readImageSize(imagePath);
  if (width !== CANVAS.width || height !== CANVAS.height) {
    throw new Error(
      `${imagePath} is ${width}x${height}, expected ${CANVAS.width}x${CANVAS.height}`,
    );
  }
}

function assertVideoHasDuration(videoPath) {
  if (readVideoDurationSeconds(videoPath) <= 0) {
    throw new Error(`${videoPath} has no duration`);
  }
}

async function main() {
  assertFfmpegAvailable();
  assertDeclaredMediaMatches(readPackageManifest(), {
    image: IMAGE_FILE_NAME,
    video: VIDEO_FILE_NAME,
  });
  mkdirSync(MEDIA_DIR, { recursive: true });

  const theme = createTheme();
  const imagePath = await renderImage(theme);
  const videoPath = await renderVideo(theme);
  assertImageMatchesCanvas(imagePath);
  assertVideoHasDuration(videoPath);

  return [imagePath, videoPath];
}

const writtenPaths = await main();
process.stdout.write(`${writtenPaths.join('\n')}\n`);
