import assert from 'node:assert/strict';
import test from 'node:test';
import { languageForPath } from './catalog.ts';
import { evaluateAddedLines } from './checks.ts';
import { addedLines, formatBlockReason, type RuleViolation } from './model.ts';

function evaluate(path: string, previous: string | undefined, next: string) {
  return evaluateAddedLines(languageForPath(path), addedLines(previous, next));
}

function ruleIds(violations: readonly RuleViolation[]): string[] {
  return violations.map((violation) => violation.ruleId);
}

test('addedLines treats every non-blank line as new without a previous file', () => {
  assert.deepEqual(addedLines(undefined, 'a\n\nb\n'), [
    { line: 1, text: 'a' },
    { line: 3, text: 'b' },
  ]);
});

test('addedLines reports only lines that are new against the previous file', () => {
  const lines = addedLines('same\nold\n', 'same\nnew\n');
  assert.deepEqual(lines, [{ line: 2, text: 'new' }]);
});

test('addedLines consumes duplicate previous lines once', () => {
  const lines = addedLines('const a = 1;\n', 'const a = 1;\nconst a = 1;\n');
  assert.deepEqual(lines, [{ line: 2, text: 'const a = 1;' }]);
});

test('flags a braceless conditional as blocking', () => {
  const violations = evaluate(
    'src/user.ts',
    undefined,
    'if (!user) return 0;\n',
  );
  assert.deepEqual(ruleIds(violations), ['braced-conditionals']);
  assert.equal(violations[0]?.severity, 'block');
});

test('accepts a braced conditional', () => {
  const violations = evaluate(
    'src/user.ts',
    undefined,
    'if (!user) {\n  return 0;\n}\n',
  );
  assert.deepEqual(violations, []);
});

test('flags a one-line suite in Python', () => {
  const violations = evaluate('app/service.py', undefined, 'if x: return 0\n');
  assert.deepEqual(ruleIds(violations), ['braced-conditionals']);
});

test('does not flag a Python signature with annotations', () => {
  const violations = evaluate(
    'app/service.py',
    undefined,
    'def run(user: User) -> int:\n',
  );
  assert.deepEqual(violations, []);
});

test('flags an empty catch block as swallowing an error', () => {
  const violations = evaluate(
    'src/load.ts',
    undefined,
    'try {\n  run();\n} catch (error) {}\n',
  );
  assert.equal(
    violations.some((item) => item.ruleId === 'explicit-error-handling'),
    true,
  );
});

test('flags catch blocks split across lines', () => {
  const violations = evaluate(
    'src/load.ts',
    undefined,
    'try {\n  run();\n} catch (error) {\n}\n',
  );
  assert.equal(
    violations.some((item) => item.ruleId === 'explicit-error-handling'),
    true,
  );
});

test('accepts a catch that rethrows with context', () => {
  const violations = evaluate(
    'src/load.ts',
    undefined,
    'try {\n  run();\n} catch (error) {\n  throw new Error("failed", { cause: error });\n}\n',
  );
  assert.deepEqual(violations, []);
});

test('flags except pass in Python', () => {
  const violations = evaluate(
    'app/service.py',
    undefined,
    'try:\n    run()\nexcept Exception: pass\n',
  );
  assert.equal(
    violations.some((item) => item.ruleId === 'explicit-error-handling'),
    true,
  );
});

test('warns about banned identifier names', () => {
  const violations = evaluate('src/user.ts', undefined, 'const data = 1;\n');
  assert.deepEqual(ruleIds(violations), ['clear-names']);
  assert.equal(violations[0]?.severity, 'warn');
});

test('warns about a banned function parameter', () => {
  const violations = evaluate(
    'src/user.ts',
    undefined,
    'function process(data) {\n  return data;\n}\n',
  );
  assert.equal(
    violations.some((item) => item.ruleId === 'clear-names'),
    true,
  );
});

test('warns about TODO comments and commented-out code', () => {
  assert.equal(
    ruleIds(evaluate('src/a.ts', undefined, '// TODO: fix\n')).includes(
      'comments',
    ),
    true,
  );
  assert.equal(
    ruleIds(evaluate('src/a.ts', undefined, '// if (ready) {\n')).includes(
      'comments',
    ),
    true,
  );
});

test('warns about debug artifacts', () => {
  assert.equal(
    ruleIds(evaluate('src/a.ts', undefined, "console.log('x');\n")).includes(
      'debug-artifacts',
    ),
    true,
  );
});

test('formatBlockReason lists each violation', () => {
  const reason = formatBlockReason('src/a.ts', [
    {
      ruleId: 'braced-conditionals',
      severity: 'block',
      message: '[braced-conditionals] Wrap the conditional body in braces.',
      line: 1,
    },
  ]);
  assert.match(reason, /Blocked src\/a\.ts/);
  assert.match(reason, /braced-conditionals/);
});
