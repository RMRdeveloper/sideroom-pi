import { readFileSync } from 'node:fs';
import { GUIDELINE_SKILL_PATH, languageGuideFor } from './catalog.ts';

export interface GuidelinesToolResult {
  readonly content: { readonly type: 'text'; readonly text: string }[];
  readonly details: { readonly paths: readonly string[] };
}

interface GuidelinesLoadOptions {
  readonly loadedPaths?: ReadonlySet<string>;
  readonly readDocument?: (path: string) => string;
}

export function executeGuidelines(
  path: string,
  {
    loadedPaths = new Set(),
    readDocument = (path) => readFileSync(path, 'utf8'),
  }: GuidelinesLoadOptions = {},
): GuidelinesToolResult {
  const guidePath = languageGuideFor(path);
  const paths = [
    GUIDELINE_SKILL_PATH,
    ...(guidePath === undefined ? [] : [guidePath]),
  ].filter((documentPath) => !loadedPaths.has(documentPath));
  if (paths.length === 0) {
    return {
      content: [{ type: 'text', text: 'The required complete guidelines are already loaded in this run.' }],
      details: { paths },
    };
  }
  const content = paths.map((documentPath) => {
    const text = readDocument(documentPath);
    if (text.trim().length === 0) {
      throw new Error(`Empty guidelines document: ${documentPath}`);
    }
    return { type: 'text' as const, text };
  });
  return { content, details: { paths } };
}
