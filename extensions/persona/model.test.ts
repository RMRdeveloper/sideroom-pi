import assert from 'node:assert/strict';
import test from 'node:test';
import { PROHIBITIONS, TEXT_SCOPE, VOICE_RULES } from './catalog.ts';
import { artifactViolations, findViolations } from './checks.ts';
import {
  assistantMessageText,
  formatArtifactSteer,
  formatBlockReason,
  formatPersonaDetail,
  formatSteer,
  personaStatusLabel,
  personaToolDetails,
} from './model.ts';

test('details every voice rule and prohibition with its enforcement', () => {
  const detail = formatPersonaDetail();
  for (const rule of VOICE_RULES) {
    assert.equal(detail.includes(rule.instruction), true, rule.id);
  }
  for (const prohibition of PROHIBITIONS) {
    assert.equal(detail.includes(prohibition.rule), true, prohibition.id);
  }
  assert.match(detail, /blocked on write and edit/);
  assert.match(detail, /corrected with a steer/);
  assert.match(detail, /no profiles or switching/);
});

test('reports the tool details as catalog ids', () => {
  const details = personaToolDetails();
  assert.deepEqual(
    details.voiceRules,
    VOICE_RULES.map((rule) => rule.id),
  );
  assert.deepEqual(
    details.prohibitions,
    PROHIBITIONS.map((prohibition) => prohibition.id),
  );
});

test('labels the footer with the current run counts', () => {
  assert.equal(personaStatusLabel(0, 0), 'persona: direct');
  assert.equal(personaStatusLabel(1, 0), 'persona: direct · 1 block');
  assert.equal(
    personaStatusLabel(2, 1),
    'persona: direct · 2 blocks · 1 steer',
  );
  assert.equal(personaStatusLabel(0, 3), 'persona: direct · 3 steers');
});

test('formats the artifact block and its degraded steer', () => {
  const violations = artifactViolations(['const icon = "\u{1F525}";']);
  const reason = formatBlockReason('src/icon.ts', violations);
  assert.match(reason, /^Blocked src\/icon\.ts/);
  assert.match(reason, /No emojis or decorative symbols/);
  assert.match(reason, /\u{1F525}/u);
  assert.match(reason, /retry the mutation/);

  const steer = formatArtifactSteer('src/icon.ts', violations);
  assert.match(steer, /stopped blocking src\/icon\.ts/);
  assert.match(steer, /still forbidden/);
  assert.match(steer, /next edit/);
});

test('formats a steer that asks for a rewrite', () => {
  const steer = formatSteer(
    findViolations('Great question!', TEXT_SCOPE.prose),
  );
  assert.match(steer, /sideroom_persona/);
  assert.match(steer, /Great question!/);
  assert.match(steer, /Rewrite in plain words/);
  assert.match(steer, /everyday terms/);
  assert.match(steer, /no concept jargon/);
});

test('reads only text blocks out of a message', () => {
  assert.equal(
    assistantMessageText([
      { type: 'text', text: 'first' },
      { type: 'toolCall' },
      { type: 'thinking', text: 'hidden' },
      { type: 'text', text: 'second' },
    ]),
    'first\nsecond',
  );
  assert.equal(assistantMessageText([]), '');
  assert.equal(assistantMessageText([{ type: 'toolCall' }]), '');
});
