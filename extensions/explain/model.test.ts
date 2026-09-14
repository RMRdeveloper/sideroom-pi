import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createExplainState,
  EXPLAIN_OFFER,
  resetExplainRun,
  shouldOfferExplanation,
} from './model.ts';

test('offers only after a mutation, in the TUI, once per run', () => {
  const state = createExplainState();
  assert.equal(shouldOfferExplanation(state, 'tui'), false);

  state.mutatedSincePrompt = true;
  assert.equal(shouldOfferExplanation(state, 'tui'), true);

  state.offeredThisRun = true;
  assert.equal(shouldOfferExplanation(state, 'tui'), false);
});

test('stays silent outside the TUI, where sideroom_ask cannot run', () => {
  const state = createExplainState();
  state.mutatedSincePrompt = true;
  for (const mode of ['rpc', 'json', 'print']) {
    assert.equal(shouldOfferExplanation(state, mode), false, mode);
  }
});

test('re-arms on the next user prompt', () => {
  const state = createExplainState();
  state.mutatedSincePrompt = true;
  state.offeredThisRun = true;

  resetExplainRun(state);
  assert.equal(state.mutatedSincePrompt, false);
  assert.equal(state.offeredThisRun, false);
  assert.equal(shouldOfferExplanation(state, 'tui'), false);
});

test('keeps the complete offer inside a compact steer', () => {
  assert.match(EXPLAIN_OFFER, /sideroom_ask/);
  assert.match(EXPLAIN_OFFER, /one question/);
  assert.match(EXPLAIN_OFFER, /three options/);
  assert.match(EXPLAIN_OFFER, /changes and test steps/);
  assert.match(EXPLAIN_OFFER, /test steps only/);
  assert.match(EXPLAIN_OFFER, /no explanation/);
  assert.match(EXPLAIN_OFFER, /Recommend one/);
  assert.match(EXPLAIN_OFFER, /in the user's language/);
  assert.equal(EXPLAIN_OFFER.length <= 160, true);
});
