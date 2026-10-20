import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GUIDELINE_SKILL_PATH, LANGUAGE_GUIDES } from './catalog.ts';
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
  assert.match(
    GUIDELINES_REMINDER,
    /call sideroom_guidelines with the target path/,
  );
  assert.match(GUIDELINES_REMINDER, /Reuse loaded guides/);
  assert.match(GUIDELINES_REMINDER, /read tool without offset or limit/);
  assert.match(GUIDELINES_REMINDER, /blocks those mutations/);
  assert.match(GUIDELINES_REMINDER, /without truncation/);
  assert.match(GUIDELINES_REMINDER, /do not mutate files through bash/);
  assert.equal(GUIDELINES_REMINDER.includes(GUIDELINE_SKILL_PATH), true);
  for (const guide of LANGUAGE_GUIDES) {
    assert.equal(GUIDELINES_REMINDER.includes(guide.path), true);
  }

  assert.doesNotMatch(GUIDELINES_REMINDER, /formatter, linter/);

  const packagedPathLength = [
    GUIDELINE_SKILL_PATH,
    ...LANGUAGE_GUIDES.map((guide) => guide.path),
  ].reduce((total, path) => total + path.length, 0);
  assert.equal(GUIDELINES_REMINDER.length - packagedPathLength <= 700, true);
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
  const skill = readFileSync(
    join(rootDir, 'skills/sideroom-guidelines/SKILL.md'),
    'utf8',
  );
  assertFitsSingleRead(skill, 'SKILL.md');

  const template = readFileSync(
    join(rootDir, 'assets/artifacts/GUIDELINES_TEMPLATE.md'),
    'utf8',
  );
  const canonicalRules = extractRules(template);
  const canonicalIndex = extractIndex(template);

  assert.equal(canonicalRules.length, 20);
  assert.equal(canonicalIndex.length, 20);
  assertDecompositionByIntent(template, 'canonical seed');
  assert.match(skill, /Decomposition by intent \(rule 20\)/);
  assert.match(skill, /even with one caller/);
  assert.match(template, /^# Coding Guidelines$/m);
  assert.match(template, /RULE: Every `if`\/`else` body uses braces/);

  for (const file of LANGUAGE_GUIDE_FILES) {
    const guide = readFileSync(
      join(rootDir, 'skills/sideroom-guidelines/references/languages', file),
      'utf8',
    );
    assert.deepEqual(extractIndex(guide), canonicalIndex, file);
    assert.deepEqual(extractRules(guide), canonicalRules, file);
    assert.equal((guide.match(/^RULE:/gm) ?? []).length, 20, file);
    assert.equal((guide.match(/^WHY:/gm) ?? []).length, 2, file);
    assertDecompositionByIntent(guide, file);
    const canonicalGuide =
      guide.split('\n## Language-specific conventions\n')[0] ?? guide;
    assert.equal((canonicalGuide.match(/^```/gm) ?? []).length, 40, file);
    assert.match(
      guide,
      /\*\*When in doubt:\*\* fail fast, keep it flat, keep it small\./,
    );
    assert.match(guide, /\*\*Enforcement note:\*\*/);
    assertFitsSingleRead(guide, file);
  }
});

function assertDecompositionByIntent(text: string, label: string): void {
  const section = text.split('### 20. Decomposition by intent\n')[1];
  assert.ok(section, label);
  assert.match(
    text,
    /^\| 20 \| \[Decomposition by intent\]\(#20-decomposition-by-intent\) \| structural \|$/m,
    label,
  );
  assert.equal(
    section.match(/^RULE: .+$/m)?.[0],
    'RULE: Extract a block into a named function when it represents a coherent operation and its name and contract let the caller understand the flow without reading its implementation. Keep orchestration separate from implementation details. Do not split solely to reduce line count; keep tightly coupled steps together when separating them would introduce shared mutable state, excessive parameters, or require reading both functions to understand either.',
    label,
  );
  assert.equal(
    section.match(/^WHY: .+$/m)?.[0],
    'WHY: Good decomposition reduces how much a reader must understand at once. Function length is a review signal; extraction must improve comprehension rather than merely move code elsewhere.',
    label,
  );
  const example = section.match(/```[^\n]*\n([\s\S]*?)\n```/u)?.[1];
  assert.ok(example, label);
  const goodExample = example.split(/(?:\/\/|#) good\n/u)[1];
  assert.ok(goodExample, label);
  const helperName =
    label === 'python.md' || label === 'rust.md'
      ? 'calculate_packing_totals'
      : 'calculatePackingTotals';
  assert.equal(goodExample.split(`${helperName}(`).length - 1, 2, label);
}

function assertFitsSingleRead(text: string, label: string): void {
  assert.equal(text.split('\n').length < 2_000, true, label);
  assert.equal(Buffer.byteLength(text) < 50 * 1_024, true, label);
}

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
