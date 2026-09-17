import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDoneState,
  isSourcePath,
  isTestPath,
  MAX_DONE_STEERS,
  shouldNoticeMissingTest,
} from './model.ts';

test('recognises test paths by convention', () => {
  const testPaths = [
    'tests/user.ts',
    'src/__tests__/user.ts',
    'spec/user.rb',
    'src/user.test.ts',
    'src/user.spec.ts',
    'src/user_test.go',
    'scripts/test_users.py',
    'src/UserTest.java',
    'src\\user.test.ts',
  ];

  for (const path of testPaths) {
    assert.equal(isTestPath(path), true, path);
  }
});

test('leaves source paths alone', () => {
  const sourcePaths = [
    'src/user.ts',
    'src/latest.ts',
    'src/contest.ts',
    'src/contest.java',
    'src/spec.ts',
    'src/user.ts.bak',
  ];

  for (const path of sourcePaths) {
    assert.equal(isTestPath(path), false, path);
  }
});

test('distinguishes source files from documentation and configuration', () => {
  const sourcePaths = [
    'src/user.ts',
    'src/user.js',
    'src/User.java',
    'src/user.py',
    'src/user.go',
    'src/user.rs',
    'src/User.php',
  ];
  const otherPaths = ['README.md', 'package.json', '.changeset/change.md'];

  for (const path of sourcePaths) {
    assert.equal(isSourcePath(path), true, path);
  }
  for (const path of otherPaths) {
    assert.equal(isSourcePath(path), false, path);
  }
});

test('notices a code-only run once and never without a test setup', () => {
  const state = createDoneState();
  assert.equal(shouldNoticeMissingTest(state, true), false);

  state.mutatedSource = true;
  assert.equal(shouldNoticeMissingTest(state, false), false);
  assert.equal(shouldNoticeMissingTest(state, true), true);

  state.mutatedTest = true;
  assert.equal(shouldNoticeMissingTest(state, true), false);

  state.mutatedTest = false;
  state.noticedMissingTest = true;
  assert.equal(shouldNoticeMissingTest(state, true), false);

  state.noticedMissingTest = false;
  state.steerCount = MAX_DONE_STEERS;
  assert.equal(shouldNoticeMissingTest(state, true), false);
});
