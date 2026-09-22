import { readFileSync } from 'node:fs';

// A missing file is an expected answer to "what was there before", not a
// failure. Anything else about the read is a real problem and surfaces.
export function readFileIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
