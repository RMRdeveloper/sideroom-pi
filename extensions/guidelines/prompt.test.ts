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
  LANGUAGE_GUIDE_FILES,
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
  assert.match(GUIDELINES_REMINDER, /blocks write\/edit/);
  assert.match(GUIDELINES_REMINDER, /Do not bypass the gate/);
  assert.match(
    GUIDELINES_REMINDER,
    /formatter, linter, type checks, and tests/,
  );
  assert.match(GUIDELINES_REMINDER, /\.java/);
  assert.match(GUIDELINES_REMINDER, /\.php/);
  assert.match(GUIDELINES_REMINDER, /\.ts\/\.tsx/);
  assert.match(GUIDELINES_REMINDER, /\.py/);
  assert.match(GUIDELINES_REMINDER, /\.go/);
  assert.match(GUIDELINES_REMINDER, /\.rs/);
});

test('ships one complete guide per supported language', async () => {
  const skillDir = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../skills/sideroom-guidelines/references/languages',
  );
  const files = await readdir(skillDir);
  assert.deepEqual([...files].sort(), [...LANGUAGE_GUIDE_FILES]);
});

test('keeps every language guide in structural parity with the canonical seed', () => {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const template = readFileSync(
    join(rootDir, 'assets/artifacts/GUIDELINES_TEMPLATE.md'),
    'utf8',
  );
  const canonicalRules = extractRules(template);
  const canonicalIndex = extractIndex(template);

  assert.equal(canonicalRules.length, 19);
  assert.equal(canonicalIndex.length, 19);
  assert.match(template, /^# Coding Guidelines$/m);
  assert.match(template, /RULE: Every `if`\/`else` body uses braces/);

  for (const file of LANGUAGE_GUIDE_FILES) {
    const guide = readFileSync(
      join(rootDir, 'skills/sideroom-guidelines/references/languages', file),
      'utf8',
    );
    assert.deepEqual(extractIndex(guide), canonicalIndex, file);
    assert.deepEqual(extractRules(guide), canonicalRules, file);
    assert.equal((guide.match(/^RULE:/gm) ?? []).length, 19, file);
    assert.equal((guide.match(/^WHY:/gm) ?? []).length, 1, file);
    assert.equal((guide.match(/^```/gm) ?? []).length, 38, file);
    assert.match(
      guide,
      /\*\*When in doubt:\*\* fail fast, keep it flat, keep it small\./,
    );
    assert.match(guide, /\*\*Enforcement note:\*\*/);
    assert.equal(guide.split('\n').length < 2_000, true, file);
    assert.equal(Buffer.byteLength(guide) < 50 * 1_024, true, file);
  }
});

function extractIndex(text: string): string[] {
  return [...text.matchAll(/^\| (\d+ \| .+)$/gm)].map(
    (match) => match[1] ?? '',
  );
}

function extractRules(text: string): string[] {
  return [...text.matchAll(/^### (\d+\. .+)$/gm)].map(
    (match) => match[1] ?? '',
  );
}
