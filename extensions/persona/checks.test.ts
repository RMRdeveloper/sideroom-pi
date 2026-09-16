import assert from 'node:assert/strict';
import test from 'node:test';
import { TEXT_SCOPE } from './catalog.ts';
import {
  addedLinesMissingFrom,
  artifactViolations,
  findViolations,
} from './checks.ts';

function idsOf(text: string, scope: 'prose' | 'artifact'): string[] {
  return findViolations(text, scope).map(
    (violation) => violation.prohibition.id,
  );
}

test('detects each prohibition in prose', () => {
  assert.deepEqual(idsOf('Ship it 🚀', TEXT_SCOPE.prose), [
    'decorative-symbols',
  ]);
  assert.deepEqual(idsOf('✓ all green', TEXT_SCOPE.prose), [
    'decorative-symbols',
  ]);
  assert.deepEqual(idsOf('Great question! Here is how.', TEXT_SCOPE.prose), [
    'flattery-and-filler',
  ]);
  assert.deepEqual(idsOf('Sorry for the confusion.', TEXT_SCOPE.prose), [
    'hedging-and-apology',
  ]);
  assert.deepEqual(idsOf('Maybe we could rename it.', TEXT_SCOPE.prose), [
    'hedging-and-apology',
  ]);
  assert.deepEqual(
    idsOf('Como modelo de lenguaje no puedo.', TEXT_SCOPE.prose),
    ['ai-meta-commentary'],
  );
});

test('stays silent on plain prose and semantic text symbols', () => {
  assert.deepEqual(
    idsOf(
      'The guard blocks the write until the emoji is gone.',
      TEXT_SCOPE.prose,
    ),
    [],
  );
  assert.deepEqual(
    idsOf(
      'Copyright \u00A9 2026, ACME\u2122, registered \u00AE.',
      TEXT_SCOPE.prose,
    ),
    [],
  );
  assert.deepEqual(idsOf('', TEXT_SCOPE.prose), []);
});

test('applies a prohibition only where its scope is listed', () => {
  assert.deepEqual(idsOf('Great question!', TEXT_SCOPE.artifact), []);
  assert.deepEqual(idsOf('Sorry for the confusion.', TEXT_SCOPE.artifact), []);
  assert.deepEqual(idsOf('const emoji = "🚀";', TEXT_SCOPE.artifact), [
    'decorative-symbols',
  ]);
  assert.deepEqual(idsOf('Copyright \u00A9 2026', TEXT_SCOPE.artifact), []);
  assert.deepEqual(idsOf('Copyright \u00A9\uFE0F 2026', TEXT_SCOPE.artifact), [
    'decorative-symbols',
  ]);
});

test('reads only the lines a mutation adds', () => {
  assert.deepEqual(addedLinesMissingFrom(undefined, 'a\n\nb\n'), ['a', 'b']);
  assert.deepEqual(addedLinesMissingFrom('keep me\n', 'keep me\nadd 🚀\n'), [
    'add 🚀',
  ]);
  assert.deepEqual(addedLinesMissingFrom('same\n', 'same\n'), []);
  assert.deepEqual(addedLinesMissingFrom('one\n', 'one\ntwo\n'), ['two']);
});

test('flags an artifact violation through the added lines', () => {
  const violations = artifactViolations(['const icon = "🔥";']);
  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.prohibition.id, 'decorative-symbols');
  assert.match(violations[0]?.excerpt ?? '', /🔥/u);
});

test('collapses the bullet and spacing a match carries', () => {
  const excerpt =
    findViolations('  *  Great question!  it is', TEXT_SCOPE.prose)[0]
      ?.excerpt ?? '';
  assert.equal(excerpt, 'Great question!');
});
