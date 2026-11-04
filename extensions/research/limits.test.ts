import assert from 'node:assert/strict';
import test from 'node:test';
import { researchLimits } from './limits.ts';

test('uses bounded defaults without limiting context by depth', () => {
  assert.deepEqual(researchLimits({}), { timeoutMs: 1_800_000, outputBytes: 256_000 });
});

test('configuration can lower but not exceed the built-in limits', () => {
  const limits = researchLimits({ SIDEROOM_RESEARCH_TIMEOUT_MS: '10000', SIDEROOM_RESEARCH_OUTPUT_BYTES: '2000' });
  assert.deepEqual(limits, { timeoutMs: 10_000, outputBytes: 2_000 });
  assert.throws(() => researchLimits({ SIDEROOM_RESEARCH_TIMEOUT_MS: '1800001' }), /SIDEROOM_RESEARCH_TIMEOUT_MS/u);
  assert.equal(researchLimits({ SIDEROOM_RESEARCH_OUTPUT_BYTES: '256000' }).outputBytes, 256_000);
  assert.throws(() => researchLimits({ SIDEROOM_RESEARCH_OUTPUT_BYTES: '256001' }), /SIDEROOM_RESEARCH_OUTPUT_BYTES/u);
  assert.throws(() => researchLimits({ SIDEROOM_RESEARCH_OUTPUT_BYTES: '0' }), /SIDEROOM_RESEARCH_OUTPUT_BYTES/u);
});
