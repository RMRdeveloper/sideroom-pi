import type { ResearchReader } from './reader.ts';

const MAX_MATCHES = 50;
const MAX_MATCH_CHARS = 500;

export interface ResearchSearch {
  readonly paths: readonly string[];
  readonly text: string;
  readonly offset?: number;
}

export async function searchResearchFiles(reader: ResearchReader, search: ResearchSearch, signal?: AbortSignal): Promise<string> {
  const lines: string[] = [];
  let matches = 0;
  let limited = false;
  for (const path of search.paths) {
    signal?.throwIfAborted();
    let excerpt;
    try {
      excerpt = await reader.readLines({ path, offset: search.offset, signal });
    } catch (error) {
      signal?.throwIfAborted();
      const message = error instanceof Error ? error.message : String(error);
      lines.push(`${JSON.stringify(path)}: could not read: ${message.slice(0, MAX_MATCH_CHARS)}`);
      continue;
    }
    for (const [index, line] of excerpt.lines.entries()) {
      const matchIndex = line.indexOf(search.text);
      if (matchIndex < 0) {
        continue;
      }
      if (matches >= MAX_MATCHES) {
        limited = true;
        break;
      }
      const start = line.length <= MAX_MATCH_CHARS ? 0 : Math.max(0, matchIndex - Math.floor((MAX_MATCH_CHARS - search.text.length) / 2));
      const end = Math.min(line.length, start + MAX_MATCH_CHARS);
      const visible = `${start > 0 ? '[...] ' : ''}${line.slice(start, end)}${end < line.length ? ' [match shortened]' : ''}`;
      lines.push(`${JSON.stringify(path)}: ${String(excerpt.offset + index)}: ${visible}`);
      matches += 1;
    }
    if (limited) {
      break;
    }
  }
  if (limited) {
    lines.push(`Stopped after ${String(MAX_MATCHES)} matches; remaining files were not searched.`);
  }
  const offset = search.offset ?? 1;
  lines.push(`Search covers at most 200 lines of each readable file starting at line ${String(offset)}.`);
  return lines.join('\n');
}
