import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSystemPrompt,
  getAgentDefinition,
  getLanguageGuidelines,
  getSharedGuidelines,
} from './catalog.ts';
import { INFERRED_SCOPE } from './language-policy.ts';
import { LANGUAGES } from './types.ts';

test('loads each shipped language guideline', () => {
  for (const language of LANGUAGES) {
    const guidelines = getLanguageGuidelines(language);
    assert.match(guidelines, /GUIDELINES_TEMPLATE\.md/);
    assert.match(guidelines, /### Guard clauses/);
    assert.match(guidelines, /### YAGNI/);
    assert.match(guidelines, /### Comments/);
    assert.match(guidelines, /### Validate once/);
  }
});

test('groups confirmed file policies in the complete role prompt', () => {
  const role = getAgentDefinition('sideroom-implementer');
  const prompt = buildSystemPrompt('sideroom-implementer', [
    { file: 'README.md', policy: 'shared' },
    { file: 'src/api.ts', policy: 'typescript' },
    { file: 'worker.py', policy: 'python' },
    { file: 'cmd/server.go', policy: 'go' },
    { file: 'src/lib.rs', policy: 'rust' },
  ]);

  assert.equal(role.readonly, false);
  assert.match(role.instructions, /Read-first/);
  assert.match(prompt, /TypeScript Coding Guidelines/);
  assert.match(prompt, /Python Coding Guidelines/);
  assert.match(prompt, /Go Coding Guidelines/);
  assert.match(prompt, /Rust Coding Guidelines/);
  assert.match(prompt, /Shared-only entries: README\.md/);
  assert.match(prompt, /src\/api\.ts/);
  assert.match(prompt, /worker\.py/);
  assert.match(prompt, /cmd\/server\.go/);
  assert.match(prompt, /src\/lib\.rs/);
  assert.match(
    prompt,
    /Do not write plan-discovered files absent from this confirmed map/,
  );
  assert.match(getSharedGuidelines(), /# Guidelines Template/);
});

test('uses the inferred instruction for repository-evidence scopes', () => {
  const prompt = buildSystemPrompt('sideroom-implementer', [
    { file: INFERRED_SCOPE, policy: 'typescript' },
  ]);

  assert.match(prompt, /Targets were inferred from repository evidence/);
  assert.match(prompt, /do not write outside the current project/i);
  assert.doesNotMatch(
    prompt,
    /Do not write plan-discovered files absent from this confirmed map/,
  );
});
