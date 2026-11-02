import assert from 'node:assert/strict';
import test from 'node:test';
import { ASK_PROMPT_GUIDELINES } from '../ask/index.ts';
import { TODO_PROMPT_GUIDELINES } from '../todo/index.ts';
import { TOOL_TEXT_VOICE_NOTE, VOICE_SCOPE } from '../persona/catalog.ts';

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

test('states the tool-text scope once, in the voice the tools reuse', () => {
  assert.match(VOICE_SCOPE, /inside Sideroom tools/);
  assert.match(TOOL_TEXT_VOICE_NOTE, /everyday words/);
  assert.match(TOOL_TEXT_VOICE_NOTE, /enough detail for the user to decide/);
});

test('both tools carry the shared note verbatim, exactly once', () => {
  const ask = ASK_PROMPT_GUIDELINES.join('\n');
  const todo = TODO_PROMPT_GUIDELINES.join('\n');

  assert.equal(occurrences(ask, TOOL_TEXT_VOICE_NOTE), 1);
  assert.equal(occurrences(todo, TOOL_TEXT_VOICE_NOTE), 1);
});
