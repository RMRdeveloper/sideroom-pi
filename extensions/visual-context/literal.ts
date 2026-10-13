import { parseExpression } from '@babel/parser';

const SYNTAX_ERROR_CODES = new Set([
  'BABEL_PARSER_SYNTAX_ERROR',
  'BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED',
]);

export function isBabelSyntaxError(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    SYNTAX_ERROR_CODES.has(String(cause.code))
  );
}

// Only syntax literals are read. No inspected source is imported or executed.
export function literalText(expression: string): string | undefined {
  let node: ReturnType<typeof parseExpression>;
  try {
    node = parseExpression(expression, { plugins: ['typescript'] });
  } catch (cause) {
    if (isBabelSyntaxError(cause)) {
      return undefined;
    }
    throw new Error('Cannot parse a source expression', { cause });
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}
