import assert from 'node:assert/strict';
import test from 'node:test';
import { languageGuideFor } from './catalog.ts';
import { createGuidelineReadState, mutationBlockReason } from './guard.ts';

test('names the missing guide and the two ways to load it', () => {
  const reason =
    mutationBlockReason(createGuidelineReadState(), 'src/a.ts') ?? '';

  assert.match(
    reason,
    /^Blocked src\/a\.ts: the required guide is not loaded yet\./,
  );
  assert.match(reason, /sideroom_guidelines \(path "src\/a\.ts"\)/);
  assert.match(reason, /SKILL\.md and /);
  assert.match(reason, /typescript\.md/);
  assert.match(reason, /Then save again\./);
});

test('drops a loaded document from the reason and clears once everything is read', () => {
  const state = createGuidelineReadState();
  state.skillRead = true;
  const languageGuide = languageGuideFor('src/a.ts');
  assert.ok(languageGuide);

  const languageOnly = mutationBlockReason(state, 'src/a.ts') ?? '';
  assert.doesNotMatch(languageOnly, /SKILL\.md/);
  assert.equal(languageOnly.includes(languageGuide), true);

  state.languageGuidesRead.add(languageGuide);
  assert.equal(mutationBlockReason(state, 'src/a.ts'), undefined);
});

test('explains the disabled tools instead of asking for a call that cannot run', () => {
  const reason =
    mutationBlockReason(createGuidelineReadState(), 'src/a.ts', false) ?? '';

  assert.match(
    reason,
    /the read tool is inactive and sideroom_guidelines is inactive/,
  );
  assert.match(reason, /then load /);
  assert.match(reason, /and save again\./);
});
