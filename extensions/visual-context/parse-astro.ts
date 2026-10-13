import { parse } from '@astrojs/compiler/sync';
import type { Node } from '@astrojs/compiler/types';
import { literalText } from './literal.ts';
import {
  InvalidMarkup,
  NON_MARKUP_TAGS,
  type ParsedMarkup,
  type SourceNode,
  verifiedElementRange,
} from './markup.ts';
import { decodedHtmlText } from './parse-html.ts';

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function byteOffsets(source: string): Int32Array {
  const offsets = new Int32Array(Buffer.byteLength(source) + 1).fill(-1);
  let byte = 0;
  let character = 0;
  for (const point of source) {
    offsets[byte] = character;
    byte += Buffer.byteLength(point);
    character += point.length;
  }
  offsets[byte] = character;
  return offsets;
}

// Astro's self-closing node end may precede its attributes. Find only the end
// of its original opening tag, respecting quoted and braced attribute values.
function openingTagEnd(source: string, start: number): number {
  let quote = '';
  let braces = 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\' && braces > 0) {
        index += 1;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '{') {
      braces += 1;
    } else if (character === '}') {
      braces -= 1;
    } else if (character === '>' && braces === 0) {
      return index + 1;
    }
  }
  return -1;
}

export function parseAstro(source: string): ParsedMarkup {
  const document = parse(source, { position: true });
  if (document.diagnostics.some((diagnostic) => diagnostic.severity === 1)) {
    throw new InvalidMarkup('Invalid Astro source');
  }
  const offsets = byteOffsets(source);
  let incomplete = false;
  function convert(node: Node): readonly SourceNode[] {
    if (node.type === 'text') {
      return [{ kind: 'text', value: decodedHtmlText(node.value) }];
    }
    if (node.type === 'expression') {
      const textNodes = node.children.filter((child) => child.type === 'text');
      const expression =
        textNodes.length === node.children.length
          ? textNodes.map((child) => child.value).join('')
          : undefined;
      const value =
        expression === undefined ? undefined : literalText(expression);
      // Expression text is JS source, not rendered text. Visit only real tags.
      return value === undefined
        ? [
            {
              kind: 'dynamic',
              children: node.children
                .filter((child) => child.type !== 'text')
                .flatMap(convert),
            },
          ]
        : [{ kind: 'text', value }];
    }
    if (node.type === 'root' || node.type === 'fragment') {
      return [{ kind: 'group', children: node.children.flatMap(convert) }];
    }
    if (
      !('name' in node && 'attributes' in node) ||
      NON_MARKUP_TAGS.has(node.name)
    ) {
      return [];
    }
    const start = offsets[node.position?.start.offset ?? -1] ?? -1;
    const openingEnd = openingTagEnd(source, start);
    const opening = source.slice(start, openingEnd);
    const reportedEnd = offsets[node.position?.end?.offset ?? -1] ?? -1;
    const isClosed = VOID_TAGS.has(node.name) || opening.endsWith('/>');
    const reportedRange = source.slice(start, reportedEnd);
    const closingTag = reportedRange
      .slice(reportedRange.lastIndexOf('</'))
      .replace(/\s+>$/u, '>');
    // When the compiler's closing position is wrong, the verified opening tag
    // is still a valid source range; never extend it to a guessed closing tag.
    const end =
      isClosed || closingTag !== `</${node.name}>` ? openingEnd : reportedEnd;
    if (!node.position?.end && !isClosed) {
      incomplete = true;
      return [];
    }
    if (!verifiedElementRange({ source, start, end, tag: node.name })) {
      incomplete = true;
      return [];
    }
    let attributes: Record<string, string | undefined> = {};
    for (const attribute of node.attributes) {
      if (attribute.kind === 'spread') {
        attributes = { hidden: undefined, contenteditable: undefined };
        continue;
      }
      switch (attribute.kind) {
        case 'expression':
          attributes[attribute.name] = literalText(attribute.value);
          break;
        case 'template-literal':
          attributes[attribute.name] = literalText(attribute.raw ?? '');
          break;
        case 'shorthand':
          attributes[attribute.name] = undefined;
          break;
        default:
          attributes[attribute.name] = decodedHtmlText(attribute.value);
      }
    }
    return [
      {
        kind: 'element',
        tag: node.name,
        rendered: node.type !== 'component',
        attributes,
        start,
        end,
        children: node.children.flatMap(convert),
      },
    ];
  }
  const nodes = convert(document.ast);
  return { nodes, incomplete };
}
