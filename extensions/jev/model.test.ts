import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addedLinesForEdit,
  addedLinesForWrite,
  buildFileState,
  buildRequestBody,
  findingKey,
  formatFindings,
  isReviewablePath,
  JEV_MODEL,
  JEV_RULES,
  MAX_STATE_BYTES,
  parseEnvelope,
  readFindings,
  stateFitsBudget,
  VIOLATION_PROBABILITY,
} from './model.ts';

test('asks only rules supported by the supplied evidence in one request', () => {
  const state = buildFileState('src/example.ts', 'const a = 1;\n', 'edit', []);
  const body = buildRequestBody(state);

  assert.equal(body.model, JEV_MODEL);
  assert.equal(JEV_RULES.length, 9);
  assert.equal(body.questions['dependency-direction'], undefined);
  assert.equal(body.questions.comments, undefined);
  for (const question of Object.values(body.questions)) {
    assert.equal(question.type, 'noul');
    assert.ok(question.criteria.true.length > 0);
    assert.ok(question.criteria.false.length > 0);
  }
});

test('command-query question distinguishes local accumulation from visible side effects', () => {
  const question = buildRequestBody(buildFileState('src/a.ts', '', 'edit', []))
    .questions['command-query'];
  assert.match(question?.instructions ?? '', /local collections/);
  assert.match(question?.criteria.true ?? '', /caller-visible state/);
  assert.match(question?.criteria.false ?? '', /read-only file access/);
});

test('carries only the file and the change, never the conversation', () => {
  const state = buildFileState(
    'src/example.ts',
    'const a = 1;\n',
    'edit',
    addedLinesForWrite(undefined, 'const a = 1;\n'),
  );

  assert.deepEqual(Object.keys(state).sort(), ['change', 'context', 'file']);
  assert.deepEqual(state.context, { files: [], partial: false });
  assert.deepEqual(Object.keys(state.file).sort(), [
    'body',
    'language',
    'path',
  ]);
  assert.deepEqual(Object.keys(state.change).sort(), ['addedLines', 'kind']);
  assert.equal(state.file.language, 'typescript');
  assert.equal(state.file.path, 'src/example.ts');
});

test('computes added lines for a write and for an edit', () => {
  const written = addedLinesForWrite(
    'const a = 1;\n',
    'const a = 1;\nconst b = 2;\n',
  );
  assert.deepEqual(
    written.map((line) => line.text),
    ['const b = 2;'],
  );

  const edited = addedLinesForEdit([
    { oldText: 'const a = 1;', newText: 'const a = 2;' },
  ]);
  assert.deepEqual(
    edited.map((line) => line.text),
    ['const a = 2;'],
  );
});

test('flags only answers at or above the probability cutoff', () => {
  const atCutoff = readFindings({
    model: undefined,
    answers: { 'guard-clauses': { noul: VIOLATION_PROBABILITY } },
  });
  assert.deepEqual(atCutoff, [
    { ruleId: 'guard-clauses', probability: VIOLATION_PROBABILITY },
  ]);

  const below = readFindings({
    model: undefined,
    answers: { 'fail-fast': { noul: VIOLATION_PROBABILITY - 0.01 } },
  });
  assert.deepEqual(below, []);
});

test('treats a missing answer as no finding', () => {
  assert.deepEqual(readFindings({ model: undefined, answers: undefined }), []);
  assert.deepEqual(readFindings({ model: undefined, answers: {} }), []);
});

test('parses a well-formed envelope and refuses anything else', () => {
  const envelope = parseEnvelope(
    '{"model":"jev-1.13.0","answers":{"guard-clauses":{"type":"noul","noul":0.95}}}',
  );
  assert.equal(envelope?.model, 'jev-1.13.0');
  assert.equal(envelope?.answers?.['guard-clauses']?.noul, 0.95);

  assert.equal(parseEnvelope('not json'), undefined);
  assert.equal(parseEnvelope('[1,2]'), undefined);
  assert.equal(parseEnvelope('"text"'), undefined);
  assert.deepEqual(
    parseEnvelope('{"answers":{"a":{"noul":"x"}}}')?.answers,
    {},
  );
});

test('uses a conservative byte bound for state and questions', () => {
  const half = 'x'.repeat(MAX_STATE_BYTES / 2);
  const edited = buildFileState('src/a.ts', half, 'edit', []);
  assert.equal(stateFitsBudget(edited), true);

  const created = buildFileState(
    'src/a.ts',
    half,
    'write',
    addedLinesForWrite(undefined, half),
  );
  assert.equal(stateFitsBudget(created), false);
});

test('reviews only files in a supported language', () => {
  assert.equal(isReviewablePath('src/a.ts'), true);
  assert.equal(isReviewablePath('cmd/main.go'), true);
  assert.equal(isReviewablePath('README.md'), false);
  assert.equal(isReviewablePath('package-lock.json'), false);
  assert.equal(isReviewablePath('config.yaml'), false);
});

test('does not accept an answer to a question that was not asked', () => {
  assert.deepEqual(
    readFindings(
      { model: undefined, answers: { 'dependency-direction': { noul: 1 } } },
      new Set(['guard-clauses']),
    ),
    [],
  );
});

test('includes related rules only when there is evidence', () => {
  const state = buildFileState(
    'src/domain/order.ts',
    'import { save } from "../infra/store";\n',
    'edit',
    [{ line: 1, text: 'import { save } from "../infra/store";' }],
    [
      {
        path: 'src/infra/store.ts',
        body: 'export function save() {}',
        relation: 'imported',
      },
    ],
  );
  const questions = buildRequestBody(state).questions;
  assert.ok(questions['dependency-direction']);
  assert.equal(questions.comments, undefined);
  assert.ok(
    buildRequestBody(
      buildFileState('a.ts', '// explain intent', 'write', [
        { line: 1, text: '// explain intent' },
      ]),
    ).questions.comments,
  );
});

test('formats a note that names the rule and the probability', () => {
  const note = formatFindings('src/a.ts', [
    { ruleId: 'immutability', probability: 0.91 },
  ]);
  assert.match(note, /src\/a\.ts/);
  assert.match(note, /\[immutability\]/);
  assert.match(note, /0\.91/);
  assert.match(note, /loaded guide/);
});

test('builds one dedup key per file and rule', () => {
  assert.equal(findingKey('a.ts', 'x'), findingKey('a.ts', 'x'));
  assert.notEqual(findingKey('a.ts', 'x'), findingKey('a.ts', 'y'));
  assert.notEqual(findingKey('a.ts', 'x'), findingKey('b.ts', 'x'));
});
