import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendMonorepoSkillsNote,
  MONOREPO_SKILLS_NOTE,
  MONOREPO_SKILLS_NOTE_HEADING,
} from './prompt.ts';

test('appends the monorepo skill note once', () => {
  const once = appendMonorepoSkillsNote('base prompt');
  assert.equal(once, `base prompt\n\n${MONOREPO_SKILLS_NOTE}`);
  assert.equal(appendMonorepoSkillsNote(once), once);
  assert.equal(appendMonorepoSkillsNote(''), MONOREPO_SKILLS_NOTE);
  assert.equal(
    MONOREPO_SKILLS_NOTE.startsWith(MONOREPO_SKILLS_NOTE_HEADING),
    true,
  );
  assert.match(MONOREPO_SKILLS_NOTE, /child folders/);
  assert.match(MONOREPO_SKILLS_NOTE, /folder you are editing/);
});
