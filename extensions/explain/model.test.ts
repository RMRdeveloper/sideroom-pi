import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  createExplainState,
  EXPLAIN_FILE_THRESHOLD,
  EXPLAIN_OFFER,
  type ExplainState,
  mutationPathKey,
  resetExplainTurn,
  shouldOfferExplanation,
} from './model.ts';

function mutatedPaths(cwd: string, count: number): readonly string[] {
  return Array.from({ length: count }, (_unused, index) =>
    mutationPathKey(cwd, `src/file-${index}.ts`),
  ).filter((pathKey) => pathKey !== undefined);
}

function mutate(state: ExplainState, cwd: string, count: number): void {
  for (const pathKey of mutatedPaths(cwd, count)) {
    state.mutatedFilesThisTurn.add(pathKey);
  }
}

test('offers in the TUI once the turn reaches the file threshold', () => {
  const state = createExplainState();
  assert.equal(shouldOfferExplanation(state, 'tui'), false);

  mutate(state, '/work', EXPLAIN_FILE_THRESHOLD - 1);
  assert.equal(shouldOfferExplanation(state, 'tui'), false);

  const thresholdPath = mutationPathKey('/work', 'src/last.ts');
  assert.ok(thresholdPath);
  state.mutatedFilesThisTurn.add(thresholdPath);
  assert.equal(shouldOfferExplanation(state, 'tui'), true);

  state.offeredThisTurn = true;
  assert.equal(shouldOfferExplanation(state, 'tui'), false);
});

test('stays silent outside the TUI, where sideroom_ask cannot run', () => {
  const state = createExplainState();
  mutate(state, '/work', EXPLAIN_FILE_THRESHOLD);
  for (const mode of ['rpc', 'json', 'print']) {
    assert.equal(shouldOfferExplanation(state, mode), false, mode);
  }
});

test('re-arms on the next user prompt', () => {
  const state = createExplainState();
  mutate(state, '/work', EXPLAIN_FILE_THRESHOLD);
  state.offeredThisTurn = true;

  resetExplainTurn(state);
  assert.equal(state.mutatedFilesThisTurn.size, 0);
  assert.equal(state.offeredThisTurn, false);
  assert.equal(shouldOfferExplanation(state, 'tui'), false);
});

test('keys one file once however the model spelled its path', () => {
  const state = createExplainState();
  const spellings = [
    'src/app.ts',
    './src/app.ts',
    '@src/app.ts',
    '/work/src/app.ts',
  ];
  for (const spelling of spellings) {
    const pathKey = mutationPathKey('/work', spelling);
    assert.equal(pathKey, resolve('/work/src/app.ts'));
    if (pathKey !== undefined) {
      state.mutatedFilesThisTurn.add(pathKey);
    }
  }
  assert.equal(state.mutatedFilesThisTurn.size, 1);
});

test('uses Pi path semantics without collapsing meaningful whitespace', () => {
  assert.equal(
    mutationPathKey('/work', '~/same.ts'),
    resolve(homedir(), 'same.ts'),
  );
  assert.equal(
    mutationPathKey('/work', ' src/app.ts '),
    resolve('/work', ' src/app.ts '),
  );
  assert.equal(mutationPathKey('/work', ''), undefined);
  assert.equal(mutationPathKey('/work', '@'), undefined);
});

test('keeps the complete offer inside a compact steer', () => {
  assert.match(EXPLAIN_OFFER, /sideroom_ask/);
  assert.match(EXPLAIN_OFFER, /one question/);
  assert.match(EXPLAIN_OFFER, /four parallel options/);
  assert.match(EXPLAIN_OFFER, /changes only/);
  assert.match(EXPLAIN_OFFER, /test steps only/);
  assert.match(EXPLAIN_OFFER, /both/);
  assert.match(EXPLAIN_OFFER, /no explanation/);
  assert.match(EXPLAIN_OFFER, /Recommend changes only/);
  assert.match(EXPLAIN_OFFER, /in the user's language/);
  assert.equal(EXPLAIN_OFFER.length <= 180, true);
});
