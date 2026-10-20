export interface SourceElement {
  readonly kind: 'element';
  readonly tag: string;
  readonly rendered: boolean;
  readonly attributes: Readonly<Record<string, string | undefined>>;
  readonly start: number;
  readonly end: number;
  readonly children: readonly SourceNode[];
}

export type SourceNode =
  | SourceElement
  | { readonly kind: 'text'; readonly value: string }
  | {
    readonly kind: 'group' | 'dynamic';
    readonly children: readonly SourceNode[];
  };

export interface ParsedMarkup {
  readonly nodes: readonly SourceNode[];
  readonly incomplete: boolean;
}

export class InvalidMarkup extends Error {}

export const NON_MARKUP_TAGS = new Set(['script', 'style']);
const PRIVATE_TEXT_TAGS = new Set(['input', 'textarea', 'select']);

export function sourceClasses(element: SourceElement): readonly string[] {
  return [
    ...new Set((element.attributes.class ?? '').split(/\s+/u).filter(Boolean)),
  ];
}

export function sourceText(node: SourceNode): string | undefined {
  if (node.kind === 'text') {
    return node.value;
  }
  if (node.kind === 'dynamic') {
    return undefined;
  }
  if (node.kind === 'element') {
    if (
      NON_MARKUP_TAGS.has(node.tag) ||
      PRIVATE_TEXT_TAGS.has(node.tag) ||
      node.attributes.hidden !== undefined ||
      node.attributes.contenteditable !== undefined
    ) {
      return '';
    }
    if (
      !node.rendered ||
      'hidden' in node.attributes ||
      'contenteditable' in node.attributes
    ) {
      return undefined;
    }
  }
  const pieces = node.children.map(sourceText);
  return pieces.some((piece) => piece === undefined)
    ? undefined
    : pieces.join('');
}

export function normalizedText(text: string): string {
  return [...text]
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? ' '
        : character,
    )
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();
}

interface ElementRangeInput {
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly tag: string;
}

export function verifiedElementRange({
  source,
  start,
  end,
  tag,
}: ElementRangeInput): boolean {
  const opening = source.slice(start, start + tag.length + 2);
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= source.length &&
    opening.slice(0, tag.length + 1).toLowerCase() ===
      `<${tag.toLowerCase()}` &&
    /[\s/>]/u.test(opening[tag.length + 1] ?? '') &&
    source[end - 1] === '>'
  );
}
