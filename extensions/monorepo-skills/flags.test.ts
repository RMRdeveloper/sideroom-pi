import assert from 'node:assert/strict';
import test from 'node:test';
import { areSkillsDisabled } from './flags.ts';

test('detects the long and short no-skills flags', () => {
  assert.equal(areSkillsDisabled(['node', 'pi', '--no-skills']), true);
  assert.equal(areSkillsDisabled(['node', 'pi', '-ns']), true);
});

test('ignores flag-like message arguments after the option terminator', () => {
  assert.equal(
    areSkillsDisabled(['node', 'pi', '--', '--no-skills', '-ns']),
    false,
  );
});

test('does not match partial or unrelated arguments', () => {
  assert.equal(areSkillsDisabled(['node', 'pi', '--no-skills=false']), false);
  assert.equal(areSkillsDisabled(['node', 'pi', '--no-extensions']), false);
});
