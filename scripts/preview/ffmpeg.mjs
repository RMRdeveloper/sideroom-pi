// The ffmpeg boundary: rasterizing SVG frames and encoding them into the video.

import { execFileSync } from 'node:child_process';

const FFMPEG = 'ffmpeg';
const FFPROBE = 'ffprobe';
const QUIET = ['-hide_banner', '-loglevel', 'error'];
const VIDEO_CODEC = 'libx264';
const PIXEL_FORMAT = 'yuv420p';
const QUALITY = '20';
const STREAMING_FLAGS = '+faststart';

function parseProbeOutput(output, sourcePath) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`ffprobe returned unreadable JSON for ${sourcePath}`, {
      cause: error,
    });
  }
}

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const details = typeof error.stderr === 'string' ? error.stderr.trim() : '';
    throw new Error(`${command} failed: ${details || error.message}`, {
      cause: error,
    });
  }
}

export function assertFfmpegAvailable() {
  run(FFMPEG, ['-version']);
}

export function rasterizeSvg(svgPath, pngPath) {
  run(FFMPEG, ['-y', ...QUIET, '-i', svgPath, '-frames:v', '1', pngPath]);
}

export function encodeFrames(framePattern, videoPath, frameRate) {
  run(FFMPEG, [
    '-y',
    ...QUIET,
    '-framerate',
    String(frameRate),
    '-i',
    framePattern,
    '-c:v',
    VIDEO_CODEC,
    '-pix_fmt',
    PIXEL_FORMAT,
    '-crf',
    QUALITY,
    '-movflags',
    STREAMING_FLAGS,
    videoPath,
  ]);
}

export function readImageSize(pngPath) {
  const output = run(FFPROBE, [
    '-v',
    'error',
    '-select_streams',
    'v',
    '-show_entries',
    'stream=width,height',
    '-of',
    'json',
    pngPath,
  ]);
  const stream = parseProbeOutput(output, pngPath).streams?.[0];
  if (stream === undefined) {
    throw new Error(`No image stream in ${pngPath}`);
  }
  return { width: stream.width, height: stream.height };
}

export function readVideoDurationSeconds(videoPath) {
  const output = run(FFPROBE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    videoPath,
  ]);
  const duration = Number.parseFloat(
    parseProbeOutput(output, videoPath).format?.duration ?? '',
  );
  if (!Number.isFinite(duration)) {
    throw new Error(`Unreadable duration in ${videoPath}`);
  }
  return duration;
}
