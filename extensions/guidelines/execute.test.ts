import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GUIDELINE_SKILL_PATH, LANGUAGE_GUIDES } from './catalog.ts';
import { executeGuidelines } from './execute.ts';

test('returns the complete packaged documents for every supported extension', () => {
  for (const guide of LANGUAGE_GUIDES) {
    for (const extension of guide.extensions) {
      const loaded = executeGuidelines(
        `@C:\\src\\NEW${extension.toUpperCase()}`,
      );
      assert.deepEqual(loaded.details.paths, [
        GUIDELINE_SKILL_PATH,
        guide.path,
      ]);
      assert.deepEqual(
        loaded.content,
        [GUIDELINE_SKILL_PATH, guide.path].map((path) => ({
          type: 'text',
          text: readFileSync(path, 'utf8'),
        })),
      );
    }
  }
});

test('unsupported files load only the complete general skill without reading the target', () => {
  for (const path of [
    'README.md',
    'file.json',
    'Makefile',
    'unknown.vue',
    'file.ts.bak',
  ]) {
    const loaded = executeGuidelines(`/does-not-exist/${path}`);
    assert.deepEqual(loaded.details.paths, [GUIDELINE_SKILL_PATH]);
    assert.deepEqual(loaded.content, [
      { type: 'text', text: readFileSync(GUIDELINE_SKILL_PATH, 'utf8') },
    ]);
  }
});

test('a failure loading either document throws instead of returning a partial load', () => {
  for (const failedPath of [
    GUIDELINE_SKILL_PATH,
    LANGUAGE_GUIDES.find((guide) => guide.fileName === 'typescript.md')?.path,
  ]) {
    assert.throws(
      () =>
        executeGuidelines('example.ts', (path) => {
          if (path === failedPath) {
            throw new Error(`Cannot load ${path}`);
          }
          return readFileSync(path, 'utf8');
        }),
      /Cannot load/,
    );
  }
});

test('empty packaged documents fail explicitly', () => {
  assert.throws(
    () => executeGuidelines('README.md', () => '  \n'),
    /Empty guidelines document/,
  );
});
