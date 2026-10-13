import {
  ElementTypes,
  NodeTypes,
  parse,
  type TemplateChildNode,
} from '@vue/compiler-dom';
import { literalText } from './literal.ts';
import {
  InvalidMarkup,
  NON_MARKUP_TAGS,
  type ParsedMarkup,
  type SourceNode,
  verifiedElementRange,
} from './markup.ts';

export function parseVue(source: string): ParsedMarkup {
  let document: ReturnType<typeof parse>;
  try {
    document = parse(source, { comments: false });
  } catch (cause) {
    if (cause instanceof SyntaxError && 'code' in cause) {
      throw new InvalidMarkup('Invalid Vue template', { cause });
    }
    throw new Error('Cannot parse Vue template', { cause });
  }
  let incomplete = false;
  function convert(node: TemplateChildNode): readonly SourceNode[] {
    if (node.type === NodeTypes.TEXT) {
      return [{ kind: 'text', value: node.content }];
    }
    if (node.type === NodeTypes.INTERPOLATION) {
      const text = literalText(node.content.loc.source);
      return text === undefined
        ? [{ kind: 'dynamic', children: [] }]
        : [{ kind: 'text', value: text }];
    }
    if (node.type !== NodeTypes.ELEMENT || NON_MARKUP_TAGS.has(node.tag)) {
      return [];
    }
    const conditional = node.props.some(
      (prop) =>
        prop.type === NodeTypes.DIRECTIVE &&
        ['if', 'else-if', 'else', 'for'].includes(prop.name),
    );
    if (node.tag === 'template') {
      const language = node.props.find(
        (prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'lang',
      );
      if (
        language?.type === NodeTypes.ATTRIBUTE &&
        language.value?.content !== 'html'
      ) {
        incomplete = true;
        return [];
      }
      if (
        node.props.some(
          (prop) => prop.type === NodeTypes.ATTRIBUTE && prop.name === 'src',
        )
      ) {
        incomplete = true;
        return [];
      }
      return [
        {
          kind: conditional ? 'dynamic' : 'group',
          children: node.children.flatMap(convert),
        },
      ];
    }
    const start = node.loc.start.offset;
    const end = node.loc.end.offset;
    if (!verifiedElementRange({ source, start, end, tag: node.tag })) {
      incomplete = true;
      return [];
    }
    const attributes: Record<string, string | undefined> = {};
    for (const prop of node.props) {
      if (prop.type === NodeTypes.ATTRIBUTE) {
        attributes[prop.name] = prop.value?.content ?? '';
      }
    }
    let dynamicText = false;
    for (const prop of node.props) {
      if (prop.type !== NodeTypes.DIRECTIVE) {
        continue;
      }
      if (['html', 'text'].includes(prop.name)) {
        dynamicText = true;
      }
      if (prop.name !== 'bind') {
        continue;
      }
      if (
        !prop.arg ||
        prop.arg.type !== NodeTypes.SIMPLE_EXPRESSION ||
        !prop.arg.isStatic
      ) {
        // An unknown key or object binding may replace a static id.
        attributes.id = undefined;
        attributes.hidden = undefined;
        attributes.contenteditable = undefined;
        continue;
      }
      const value = prop.exp ? literalText(prop.exp.loc.source) : undefined;
      const key = prop.arg.content;
      attributes[key] =
        key === 'class'
          ? [attributes.class, value].filter(Boolean).join(' ')
          : value;
    }
    const children = node.children.flatMap(convert);
    const elements: readonly SourceNode[] = [
      {
        kind: 'element',
        tag: node.tag,
        rendered: node.tagType === ElementTypes.ELEMENT,
        attributes,
        start,
        end,
        children: dynamicText ? [{ kind: 'dynamic', children }] : children,
      },
    ];
    return conditional ? [{ kind: 'dynamic', children: elements }] : elements;
  }
  const templates = document.children.filter(
    (node) => node.type === NodeTypes.ELEMENT && node.tag === 'template',
  );
  const nodes = (templates.length > 0 ? templates : document.children).flatMap(
    convert,
  );
  return { nodes, incomplete };
}
