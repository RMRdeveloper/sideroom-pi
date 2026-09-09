import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  appendGuidelinesReminder,
  GUIDELINES_REMINDER,
  GUIDELINES_REMINDER_HEADING,
  LANGUAGE_DELTA_FILES,
} from './prompt.ts';

test('appends the reminder once and keeps an existing prompt', () => {
  const once = appendGuidelinesReminder('base prompt');
  assert.equal(once, `base prompt\n\n${GUIDELINES_REMINDER}`);
  assert.equal(appendGuidelinesReminder(once), once);
  assert.equal(appendGuidelinesReminder(''), GUIDELINES_REMINDER);
  assert.equal(
    GUIDELINES_REMINDER.startsWith(GUIDELINES_REMINDER_HEADING),
    true,
  );
  assert.match(GUIDELINES_REMINDER, /sideroom-guidelines/);
  assert.match(GUIDELINES_REMINDER, /\.java/);
  assert.match(GUIDELINES_REMINDER, /\.php/);
  assert.match(GUIDELINES_REMINDER, /\.ts\/\.tsx/);
  assert.match(GUIDELINES_REMINDER, /\.py/);
  assert.match(GUIDELINES_REMINDER, /\.go/);
  assert.match(GUIDELINES_REMINDER, /\.rs/);
});

test('ships one delta file per supported language', async () => {
  const skillDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../skills/sideroom-guidelines/references/languages',
  );
  const files = await readdir(skillDir);
  assert.deepEqual([...files].sort(), [...LANGUAGE_DELTA_FILES]);
});

test('keeps the guidelines template as a canonical seed', () => {
  const file = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../assets/artifacts/GUIDELINES_TEMPLATE.md',
  );
  const text = readFileSync(file, 'utf8');
  assert.match(text, /# Guidelines Template/);
  assert.match(text, /Use braces around every `if` body/);
});
