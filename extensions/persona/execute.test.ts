import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PERSONA_SKILL_PATH, PROHIBITIONS, VOICE_RULES } from './catalog.ts';
import { executePersona } from './execute.ts';

test('returns the complete packaged guide rather than a catalog summary', () => {
  const result = executePersona();
  assert.deepEqual(result.content, [
    { type: 'text', text: readFileSync(PERSONA_SKILL_PATH, 'utf8') },
  ]);
  assert.deepEqual(result.details, {
    voiceRules: VOICE_RULES.map((rule) => rule.id),
    prohibitions: PROHIBITIONS.map((prohibition) => prohibition.id),
  });
});
