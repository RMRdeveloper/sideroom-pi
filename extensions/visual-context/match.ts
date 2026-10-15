import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import {
  InvalidMarkup,
  normalizedText,
  type ParsedMarkup,
  type SourceElement,
  type SourceNode,
  sourceClasses,
  sourceText,
} from './markup.ts';
import type {
  SourceCandidate,
  VisualElement,
  VisualSelection,
} from './model.ts';
import { SOURCE_METHOD } from './model.ts';
import { parseAstro } from './parse-astro.ts';
import { parseHtml } from './parse-html.ts';
import { parseJsx } from './parse-jsx.ts';
import { parseSvelte } from './parse-svelte.ts';
import { parseVue } from './parse-vue.ts';

const MIN_SCORE = 3;
const MAX_CAPTURE_TEXT = 160;
const MAX_ANCESTORS = 4;
const WEIGHTS = {
  tag: 1,
  id: 12,
  text: 8,
  prefix: 3,
  classes: 6,
  ancestor: 1,
} as const;

export function sourceFingerprint(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function parseSource(path: string, source: string): ParsedMarkup {
  switch (extname(path).toLowerCase()) {
    case '.jsx':
    case '.js':
    case '.mjs':
      return parseJsx(source, false);
    case '.tsx':
    case '.ts':
    case '.mts':
      return parseJsx(source, true);
    case '.vue':
      return parseVue(source);
    case '.svelte':
      return parseSvelte(source);
    case '.astro':
      return parseAstro(source);
    case '.html':
    case '.htm':
      return parseHtml(source);
    default:
      throw new Error(`Unsupported visual source: ${path}`);
  }
}

interface MatchSourceInput {
  readonly path: string;
  readonly source: string;
  readonly selection: VisualSelection;
  readonly location?: { readonly line: number; readonly column: number };
}

export function matchSource(
  input: MatchSourceInput,
): readonly SourceCandidate[] {
  return [...sourceMatches(input)];
}

export function* sourceMatches({
  path,
  source,
  selection,
  location,
}: MatchSourceInput): Generator<SourceCandidate> {
  const document = parseSource(path, source);
  if (document.incomplete) {
    throw new InvalidMarkup(`Cannot verify all markup locations in ${path}`);
  }
  const fingerprint = sourceFingerprint(source);
  const lineOffsets = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') {
      lineOffsets.push(index + 1);
    }
  }
  function lineAt(offset: number): number {
    let low = 0;
    let high = lineOffsets.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const lineOffset = lineOffsets[middle];
      if (lineOffset === undefined) {
        throw new Error('Source line index is out of bounds');
      }
      if (lineOffset <= offset) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }
  function* visit(
    node: SourceNode,
    ancestors: readonly SourceElement[],
  ): Generator<SourceCandidate> {
    if (node.kind === 'text') {
      return;
    }
    if (node.kind !== 'element') {
      for (const child of node.children) {
        yield* visit(child, ancestors);
      }
      return;
    }
    if (
      node.rendered &&
      node.tag.toLowerCase() === selection.element.tag.toLowerCase()
    ) {
      const match = scoreElement(node, selection);
      const atLocation =
        location !== undefined &&
        lineAt(node.start) === location.line &&
        node.start - (lineOffsets[location.line - 1] ?? -1) + 1 ===
          location.column;
      const contradictoryId =
        selection.element.elementId &&
        node.attributes.id !== undefined &&
        node.attributes.id !== selection.element.elementId;
      if (
        location ? atLocation && !contradictoryId : match.score >= MIN_SCORE
      ) {
        const parentReasons = ancestorReasons(ancestors, selection.ancestors);
        yield {
          path,
          startLine: lineAt(node.start),
          endLine: lineAt(node.end - 1),
          fingerprint,
          score: match.score + parentReasons.length * WEIGHTS.ancestor,
          reasons: location
            ? ['compiler location checked against local markup']
            : [...match.reasons, ...parentReasons],
          ...(location
            ? { method: SOURCE_METHOD.compiler, startColumn: location.column }
            : {}),
        };
      }
    }
    const parents = node.rendered
      ? [...ancestors.slice(-(MAX_ANCESTORS - 1)), node]
      : ancestors;
    for (const child of node.children) {
      yield* visit(child, parents);
    }
  }
  for (const node of document.nodes) {
    yield* visit(node, []);
  }
}

function ancestorReasons(
  ancestors: readonly SourceElement[],
  descriptors: readonly VisualElement[],
): readonly string[] {
  const reasons: string[] = [];
  let cursor = ancestors.length - 1;
  for (const descriptor of descriptors) {
    for (let index = cursor; index >= 0; index -= 1) {
      const parent = ancestors[index];
      if (
        !parent ||
        parent.tag.toLowerCase() !== descriptor.tag.toLowerCase()
      ) {
        continue;
      }
      if (
        descriptor.elementId &&
        parent.attributes.id !== undefined &&
        descriptor.elementId !== parent.attributes.id
      ) {
        continue;
      }
      const sameId =
        descriptor.elementId && descriptor.elementId === parent.attributes.id;
      const matched = descriptor.classes.find((name) =>
        sourceClasses(parent).includes(name),
      );
      if (sameId || matched) {
        reasons.push(
          `ancestor ${descriptor.tag}${sameId ? `#${descriptor.elementId}` : `.${matched}`}`,
        );
        cursor = index - 1;
        break;
      }
    }
  }
  return reasons;
}

function scoreElement(
  element: SourceElement,
  selection: VisualSelection,
): { readonly score: number; readonly reasons: readonly string[] } {
  const identifier = element.attributes.id;
  if (
    selection.element.elementId &&
    identifier !== undefined &&
    identifier !== selection.element.elementId
  ) {
    return { score: 0, reasons: [] };
  }
  const classes = sourceClasses(element);
  const domClasses = [...new Set(selection.element.classes.filter(Boolean))];
  const matched = domClasses.filter((name) => classes.includes(name));
  const unionSize = new Set([...classes, ...domClasses]).size;
  const classScore =
    matched.length === 0
      ? 0
      : Math.max(2, Math.round((WEIGHTS.classes * matched.length) / unionSize));
  const sameId = Boolean(
    selection.element.elementId && identifier === selection.element.elementId,
  );
  const rawText = sourceText(element);
  const text = rawText === undefined ? undefined : normalizedText(rawText);
  const capturedText = normalizedText(selection.text);
  const sameText = capturedText.length >= 4 && text === capturedText;
  const prefixText =
    !sameText &&
    selection.text.length === MAX_CAPTURE_TEXT &&
    text?.startsWith(capturedText);
  const reasons = [
    ...matched.map((name) => `class ${name}`),
    ...(sameId ? [`id ${identifier}`] : []),
    ...(sameText ? ['static text'] : []),
    ...(prefixText ? ['text prefix (capture limit)'] : []),
  ];
  return {
    score:
      WEIGHTS.tag +
      classScore +
      Number(sameId) * WEIGHTS.id +
      Number(sameText) * WEIGHTS.text +
      Number(Boolean(prefixText)) * WEIGHTS.prefix,
    reasons,
  };
}
