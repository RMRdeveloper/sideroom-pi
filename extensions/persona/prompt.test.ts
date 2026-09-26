import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PERSONA_SKILL_PATH,
  PERSONA_TOOL_NAME,
  PROHIBITIONS,
  VOICE_RULES,
} from './catalog.ts';
import {
  appendPersonaReminder,
  PERSONA_EXAMPLES,
  PERSONA_REMINDER,
  PERSONA_REMINDER_HEADING,
} from './prompt.ts';

test('appends the reminder once and keeps an existing prompt', () => {
  const once = appendPersonaReminder('base prompt');
  assert.equal(once, `base prompt\n\n${PERSONA_REMINDER}`);
  assert.equal(appendPersonaReminder(once), once);
  assert.equal(appendPersonaReminder(''), PERSONA_REMINDER);
  assert.equal(PERSONA_REMINDER.startsWith(PERSONA_REMINDER_HEADING), true);
});

test('restates the catalog instead of duplicating it', () => {
  for (const rule of VOICE_RULES) {
    assert.equal(PERSONA_REMINDER.includes(rule.instruction), true, rule.id);
  }
  for (const prohibition of PROHIBITIONS) {
    assert.equal(
      PERSONA_REMINDER.includes(prohibition.rule),
      true,
      prohibition.id,
    );
  }
  assert.equal(PERSONA_REMINDER.includes(PERSONA_TOOL_NAME), true);
  assert.equal(PERSONA_REMINDER.includes(PERSONA_SKILL_PATH), true);
  // Static examples plus the catalog restatement. The budget guards against
  // unbounded growth; prompt caching cares about byte-stability, not length.
  assert.equal(
    PERSONA_REMINDER.length - PERSONA_SKILL_PATH.length < 1500,
    true,
  );
});

test("ships both static Do/Don't example pairs with no per-turn data", () => {
  assert.equal(PERSONA_EXAMPLES.length, 2);
  assert.match(PERSONA_REMINDER, /Examples:\n/);
  for (const example of PERSONA_EXAMPLES) {
    assert.match(example, /^Do: /);
    assert.match(example, /Don't: /);
    assert.equal(PERSONA_REMINDER.includes(example), true, example);
  }
  assert.match(
    PERSONA_EXAMPLES[0],
    /Do: Your work list stays with this conversation, not in project files/,
  );
  assert.match(
    PERSONA_EXAMPLES[0],
    /Don't: Session-scoped board state persists outside the repository/,
  );
  assert.match(
    PERSONA_EXAMPLES[1],
    /Do: To get a fresh answer, turn off the cache \(stored results\)/,
  );
  assert.match(
    PERSONA_EXAMPLES[1],
    /Don't: Disable the cache invalidation pipeline/,
  );
  // Reminder must not pick up session-specific values.
  assert.doesNotMatch(PERSONA_REMINDER, /\d{4}-\d{2}-\d{2}/);
});

test('requires a reason to use technical terms, even when the user used one', () => {
  const plainRule = VOICE_RULES.find((rule) => rule.id === 'plain-language');
  assert.ok(plainRule);
  assert.match(plainRule.instruction, /even if the user uses technical terms/);
  assert.match(plainRule.instruction, /only when needed to understand or act/);
  assert.match(plainRule.instruction, /explain it at first use/);
  assert.doesNotMatch(plainRule.instruction, /unless the user used them/);
});

test('ships a skill that fits one read and stays in sync', () => {
  const skill = readFileSync(PERSONA_SKILL_PATH, 'utf8');
  assert.equal(skill.split('\n').length < 2_000, true);
  assert.equal(Buffer.byteLength(skill) < 50 * 1_024, true);
  assert.match(skill, /^---\nname: sideroom-persona\n/);
  assert.match(skill, /^description: ".+"$/m);
  assert.match(skill, /There is no other profile and nothing to/);
  for (const prohibition of PROHIBITIONS) {
    assert.equal(skill.includes(prohibition.id), true, prohibition.id);
  }
  assert.match(skill, /Plain means everyday words, not more words/);
  assert.match(skill, /fires three times degrades to a steer/);
  assert.match(skill, /three steers are sent per\s+agent run/);
  assert.match(skill, /triggerTurn: true/);
  assert.match(skill, /Where is the session-scoped work board\?/);
  assert.match(skill, /Your work list stays with this conversation/);
  assert.match(skill, /Replace a user's unnecessary technical term/);
  assert.match(skill, /cache \(stored results\)/);
});

test('keeps the packaged skill path inside the repository', () => {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
  assert.equal(PERSONA_SKILL_PATH.startsWith(rootDir), true);
});
