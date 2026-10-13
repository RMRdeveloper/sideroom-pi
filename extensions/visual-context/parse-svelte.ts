import { type AST, parse } from 'svelte/compiler';
import { literalText } from './literal.ts';
import {
  InvalidMarkup,
  NON_MARKUP_TAGS,
  type ParsedMarkup,
  type SourceNode,
  verifiedElementRange,
} from './markup.ts';

export function parseSvelte(source: string): ParsedMarkup {
  let document: AST.Root;
  try {
    document = parse(source, { modern: true });
  } catch (cause) {
    if (
      cause instanceof Error &&
      cause.name === 'CompileError' &&
      'code' in cause
    ) {
      throw new InvalidMarkup('Invalid Svelte source', { cause });
    }
    throw new Error('Cannot parse Svelte source', { cause });
  }
  let incomplete = false;
  function fragment(
    node: AST.Fragment | null | undefined,
  ): readonly SourceNode[] {
    return node?.nodes.flatMap(convert) ?? [];
  }
  function convert(node: AST.TemplateNode): readonly SourceNode[] {
    if (node.type === 'Text') {
      return [{ kind: 'text', value: node.data }];
    }
    if (node.type === 'ExpressionTag') {
      const value = literalText(source.slice(node.start + 1, node.end - 1));
      return value === undefined
        ? [{ kind: 'dynamic', children: [] }]
        : [{ kind: 'text', value }];
    }
    if (node.type === 'IfBlock') {
      return [
        {
          kind: 'dynamic',
          children: [...fragment(node.consequent), ...fragment(node.alternate)],
        },
      ];
    }
    if (node.type === 'EachBlock' || node.type === 'SnippetBlock') {
      return [
        {
          kind: 'dynamic',
          children: [
            ...fragment(node.body),
            ...fragment(node.type === 'EachBlock' ? node.fallback : undefined),
          ],
        },
      ];
    }
    if (node.type === 'AwaitBlock') {
      return [
        {
          kind: 'dynamic',
          children: [
            ...fragment(node.pending),
            ...fragment(node.then),
            ...fragment(node.catch),
          ],
        },
      ];
    }
    if (node.type === 'KeyBlock') {
      return [{ kind: 'group', children: fragment(node.fragment) }];
    }
    if (!('fragment' in node && 'name' in node && 'attributes' in node)) {
      return ['HtmlTag', 'RenderTag'].includes(node.type)
        ? [{ kind: 'dynamic', children: [] }]
        : [];
    }
    if (NON_MARKUP_TAGS.has(node.name)) {
      return [];
    }
    const children = fragment(node.fragment);
    const start = node.start;
    const end = node.end;
    if (!verifiedElementRange({ source, start, end, tag: node.name })) {
      incomplete = true;
      return [];
    }
    let attributes: Record<string, string | undefined> = {};
    for (const attribute of node.attributes) {
      if (attribute.type === 'SpreadAttribute') {
        attributes = { hidden: undefined, contenteditable: undefined };
        continue;
      }
      if (attribute.type !== 'Attribute') {
        continue;
      }
      if (attribute.value === true) {
        attributes[attribute.name] = '';
        continue;
      }
      const pieces = (
        Array.isArray(attribute.value) ? attribute.value : [attribute.value]
      ).map((piece) =>
        piece.type === 'Text'
          ? piece.data
          : literalText(source.slice(piece.start + 1, piece.end - 1)),
      );
      attributes[attribute.name] = pieces.some((piece) => piece === undefined)
        ? undefined
        : pieces.join('');
    }
    return [
      {
        kind: 'element',
        tag: node.name,
        rendered: ['RegularElement', 'TitleElement'].includes(node.type),
        attributes,
        start,
        end,
        children,
      },
    ];
  }
  const nodes = fragment(document.fragment);
  return { nodes, incomplete };
}
