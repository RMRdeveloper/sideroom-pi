import { parse } from '@babel/parser';
import { isBabelSyntaxError, literalText } from './literal.ts';
import {
  InvalidMarkup,
  NON_MARKUP_TAGS,
  type ParsedMarkup,
  type SourceNode,
  verifiedElementRange,
} from './markup.ts';

const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
  className: 'class',
  contentEditable: 'contenteditable',
};
type JsxElement = Extract<
  ReturnType<typeof import('@babel/parser').parseExpression>,
  { type: 'JSXElement' }
>;

export function parseJsx(source: string, typescript: boolean): ParsedMarkup {
  let document: ReturnType<typeof parse>;
  try {
    document = parse(source, {
      sourceType: 'unambiguous',
      plugins: typescript ? ['jsx', 'typescript'] : ['jsx'],
      attachComment: false,
    });
  } catch (cause) {
    if (isBabelSyntaxError(cause)) {
      throw new InvalidMarkup('Invalid JSX source', { cause });
    }
    throw new Error('Cannot parse JSX source', { cause });
  }
  let incomplete = false;
  function element(node: JsxElement): readonly SourceNode[] {
    const name = node.openingElement.name;
    const tag =
      name.type === 'JSXIdentifier'
        ? name.name
        : source.slice(name.start ?? 0, name.end ?? 0);
    if (NON_MARKUP_TAGS.has(tag)) {
      return [];
    }
    const start = node.start ?? -1;
    const end = node.end ?? -1;
    if (!verifiedElementRange({ source, start, end, tag })) {
      incomplete = true;
      return [];
    }
    let attributes: Record<string, string | undefined> = {};
    for (const attribute of node.openingElement.attributes) {
      if (attribute.type === 'JSXSpreadAttribute') {

        attributes = { hidden: undefined, contenteditable: undefined };
        continue;
      }
      if (attribute.name.type !== 'JSXIdentifier') {
        continue;
      }
      const key = ATTRIBUTE_NAMES[attribute.name.name] ?? attribute.name.name;
      const value = attribute.value;
      if (!value) {
        attributes[key] = '';
        continue;
      }
      if (value.type === 'StringLiteral') {
        attributes[key] = value.value;
        continue;
      }
      if (value.type !== 'JSXExpressionContainer') {
        attributes[key] = undefined;
        continue;
      }
      if (value.expression.type === 'BooleanLiteral' && key === 'hidden') {
        if (value.expression.value) {
          attributes.hidden = '';
        } else {
          delete attributes.hidden;
        }
        continue;
      }
      if (
        value.expression.type === 'BooleanLiteral' &&
        key === 'contenteditable'
      ) {
        attributes.contenteditable = String(value.expression.value);
        continue;
      }
      attributes[key] = literalText(
        source.slice(value.expression.start ?? 0, value.expression.end ?? 0),
      );
    }
    const children = node.children.flatMap((child): readonly SourceNode[] => {
      if (child.type === 'JSXText') {

        const lines = child.value.replace(/\t/gu, ' ').split(/\r\n|\n|\r/u);
        const text = lines
          .map((line, index) => {
            const left = index === 0 ? line : line.trimStart();
            return index === lines.length - 1 ? left : left.trimEnd();
          })
          .filter(Boolean)
          .join(' ');
        return [{ kind: 'text', value: text }];
      }
      if (child.type === 'JSXExpressionContainer') {
        if (child.expression.type === 'JSXEmptyExpression') {
          return [];
        }
        const text = literalText(
          source.slice(child.expression.start ?? 0, child.expression.end ?? 0),
        );
        return text === undefined
          ? [{ kind: 'dynamic', children: collect(child.expression) }]
          : [{ kind: 'text', value: text }];
      }
      if (child.type === 'JSXSpreadChild') {
        return [{ kind: 'dynamic', children: collect(child.expression) }];
      }
      return collect(child);
    });
    return [
      {
        kind: 'element',
        tag,
        rendered: /^[a-z]/u.test(tag) && !tag.includes('.'),
        attributes,
        start,
        end,
        children,
      },
    ];
  }
  function collect(value: unknown): readonly SourceNode[] {
    if (!value || typeof value !== 'object') {
      return [];
    }
    if (Array.isArray(value)) {
      return value.flatMap(collect);
    }
    if ('type' in value && value.type === 'JSXElement') {
      return element(value as JsxElement);
    }
    if (
      'type' in value &&
      value.type === 'JSXFragment' &&
      'children' in value
    ) {
      return [{ kind: 'group', children: collect(value.children) }];
    }
    return Object.entries(value)
      .filter(([key]) => !['loc', 'comments', 'tokens', 'extra'].includes(key))
      .flatMap(([, child]) => collect(child));
  }
  const nodes = document.program.body.flatMap(collect);
  return { nodes, incomplete };
}
