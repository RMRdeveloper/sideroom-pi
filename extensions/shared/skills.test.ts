import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  formatSkillsForPrompt,
  loadSkillsFromDir,
} from '@earendil-works/pi-coding-agent';

test('Pi discovers all packaged skills with automatic invocation enabled', () => {
  const dir = fileURLToPath(new URL('../../skills', import.meta.url));
  const { skills, diagnostics } = loadSkillsFromDir({ dir, source: 'package' });
  assert.deepEqual(diagnostics, []);
  assert.deepEqual(skills.map((skill) => skill.name).sort(), [
    'sideroom-architecture',
    'sideroom-codebase-design',
    'sideroom-domain-modeling',
    'sideroom-domain-scaffold',
    'sideroom-grill',
    'sideroom-guidelines',
    'sideroom-persona',
    'sideroom-user-stories',
    'sideroom-visual-setup',
  ]);
  const prompt = formatSkillsForPrompt(skills);
  for (const skill of skills) {
    assert.equal(skill.disableModelInvocation, false, skill.name);
    assert.ok(prompt.includes(`<name>${skill.name}</name>`), skill.name);
    assert.ok(prompt.includes(`<location>${skill.filePath}</location>`));
    assert.ok(readFileSync(skill.filePath, 'utf8').length > 0);
  }
});
