import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGE, type LanguageId, type RuleId } from './catalog.ts';
import { evaluateAddedLines } from './checks.ts';
import type { AddedLine } from './model.ts';

test('flags any in every type position', () => {
  const positions = [
    'const id: any = 1;',
    'const id = value as any;',
    'const ids: Array<any> = [];',
    'const map: Record<string, any> = {};',
    'const ids: any[] = [];',
    'type Id = any;',
    'type Id = any | string;',
    'type Id = string | any;',
    'type Fn = () => any;',
    'type Key = keyof any;',
    'const payload = value satisfies any;',
    'const handler: () => any = callback;',
    'function consume(value: any): void {}',
    'interface Payload { value: any; }',
  ];

  for (const source of positions) {
    assert.deepEqual(ruleIdsFor(source), ['explicit-any'], source);
  }
});

test('flags any in multiline type aliases', () => {
  const aliases = [
    ['type Fn =', '  () => any;'],
    ['type Value =', '  | string', '  | any;'],
  ];

  for (const source of aliases) {
    assert.deepEqual(
      ruleIdsForLines(source),
      ['explicit-any'],
      source.join('\n'),
    );
  }
});

test('leaves any inside strings, comments, and identifiers alone', () => {
  const safe = [
    "const label = 'any';",
    '// any',
    'const anyValue = 1;',
    'const id = record.any;',
    'consume(any);',
    'const value = any;',
    'consume(value, any);',
    'const selected = ready ? fallback : any;',
    'const config = { any: 1 };',
    'const payload = { value: any };',
    'const any = 1; type Alias = typeof any;',
    'const compared = left<any>right;',
    "import { value as any } from './module.js';",
  ];

  for (const source of safe) {
    assert.deepEqual(ruleIdsFor(source), [], source);
  }
});

test('checks any and type suppression only in TypeScript', () => {
  const lines = ['const id = value as any;', '// @ts-nocheck'];

  for (const source of lines) {
    assert.deepEqual(ruleIdsFor(source, LANGUAGE.javascript), [], source);
  }
});

test('notes a suppressed type error but not the sanctioned form', () => {
  const suppressed = ['// @ts-ignore', '// @ts-nocheck'];

  for (const source of suppressed) {
    assert.deepEqual(ruleIdsFor(source), ['suppressed-type-errors'], source);
  }

  assert.deepEqual(
    ruleIdsFor('// @ts-expect-error: the stub has no types'),
    [],
  );
});

test('leaves quoted directives alone, including multiline templates', () => {
  const quoted = [
    "const note = '// @ts-ignore';",
    'const note = "see @ts-nocheck";',
  ];

  for (const source of quoted) {
    assert.deepEqual(ruleIdsFor(source), [], source);
  }

  assert.deepEqual(
    ruleIdsForLines(['const note = `', '// @ts-ignore', '`;']),
    [],
  );
  assert.deepEqual(ruleIdsFor('const id = 1; // @ts-ignore'), [
    'suppressed-type-errors',
  ]);
  assert.deepEqual(ruleIdsFor('// explains why @ts-ignore is not used'), []);
});

function ruleIdsFor(
  text: string,
  language: LanguageId = LANGUAGE.typescript,
): readonly RuleId[] {
  return ruleIdsForLines([text], language);
}

function ruleIdsForLines(
  lines: readonly string[],
  language: LanguageId = LANGUAGE.typescript,
): readonly RuleId[] {
  const addedLines: AddedLine[] = lines.map((text, index) => ({
    line: index + 1,
    text,
  }));
  return evaluateAddedLines(language, addedLines).map(
    (violation) => violation.ruleId,
  );
}
