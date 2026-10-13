import { type DefaultTreeAdapterMap, parseFragment } from 'parse5';
import {
  NON_MARKUP_TAGS,
  type ParsedMarkup,
  type SourceNode,
  verifiedElementRange,
} from './markup.ts';

type HtmlNode = DefaultTreeAdapterMap['node'];

export function decodedHtmlText(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  const document = parseFragment(
    `<textarea>${text.replace(/</gu, '&lt;')}</textarea>`,
  );
  const element = document.childNodes[0];
  if (!element || !('childNodes' in element)) {
    throw new Error('Cannot decode HTML character references');
  }
  return element.childNodes
    .map((node) => ('value' in node ? node.value : ''))
    .join('');
}

export function parseHtml(source: string): ParsedMarkup {
  const document = parseFragment(source, { sourceCodeLocationInfo: true });
  let incomplete = false;
  function convert(node: HtmlNode): readonly SourceNode[] {
    if (node.nodeName === '#text' && 'value' in node) {
      return [{ kind: 'text', value: node.value }];
    }
    if (!('tagName' in node)) {
      return 'childNodes' in node ? node.childNodes.flatMap(convert) : [];
    }
    if (NON_MARKUP_TAGS.has(node.tagName)) {
      return [];
    }
    const children = (
      'content' in node ? node.content.childNodes : node.childNodes
    ).flatMap(convert);
    if (node.tagName === 'template') {
      return [{ kind: 'group', children }];
    }
    const location = node.sourceCodeLocation;
    if (!location?.startTag) {
      return children;
    }
    const start = location.startOffset;
    const end = location.endTag?.endOffset ?? location.startTag.endOffset;
    if (!verifiedElementRange({ source, start, end, tag: node.tagName })) {
      incomplete = true;
      return children;
    }
    return [
      {
        kind: 'element',
        tag: node.tagName,
        rendered: true,
        attributes: Object.fromEntries(
          node.attrs.map(({ name, value }) => [name, value]),
        ),
        start,
        end,
        children,
      },
    ];
  }
  const nodes = document.childNodes.flatMap(convert);
  return { nodes, incomplete };
}
