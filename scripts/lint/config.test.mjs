import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();

test('rejects code comments and braceless conditions without treating strings as comments', async () => {
  const [comment] = await eslint.lintText('// explanation\nexport const value = 1;\n', { filePath: 'extensions/example.ts' });
  assert.ok(comment.messages.some((message) => message.ruleId === 'no-comments/disallowComments' && message.severity === 2));
  const [condition] = await eslint.lintText('if (true) console.log(1);\n', { filePath: 'extensions/example.ts' });
  assert.ok(condition.messages.some((message) => message.ruleId === 'curly' && message.severity === 2));
  const [literal] = await eslint.lintText("export const marker = '// text';\n", { filePath: 'extensions/example.ts' });
  assert.equal(literal.errorCount, 0);
});
