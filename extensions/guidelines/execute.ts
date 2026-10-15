import { readFileSync } from 'node:fs';
import { GUIDELINE_SKILL_PATH, languageGuideFor } from './catalog.ts';

export interface GuidelinesToolResult {
  readonly content: { readonly type: 'text'; readonly text: string }[];
  readonly details: { readonly paths: readonly string[] };
}

export function executeGuidelines(
  path: string,
  readDocument: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): GuidelinesToolResult {
  const guidePath = languageGuideFor(path);
  const paths = [
    GUIDELINE_SKILL_PATH,
    ...(guidePath === undefined ? [] : [guidePath]),
  ];
  const content = paths.map((documentPath) => {
    const text = readDocument(documentPath);
    if (text.trim().length === 0) {
      throw new Error(`Empty guidelines document: ${documentPath}`);
    }
    return { type: 'text' as const, text };
  });
  return { content, details: { paths } };
}
