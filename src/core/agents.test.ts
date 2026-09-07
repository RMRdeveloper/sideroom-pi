import assert from 'node:assert/strict';
import test from 'node:test';

import { createReviewer, createVerifier } from './agents.ts';
import type { ModelRequest } from './model.ts';

const QUALITY_INPUT = {
  implementation: {
    taskId: 'T1',
    filesChanged: ['src/orders.ts'],
    summary: 'Implemented the order flow.',
  },
  plan: 'Implement the order flow.',
};

test('reviewer and verifier emit ordinary unsourced candidate findings', async () => {
  const reviewer = createReviewer({
    generate: async <T>(_request: ModelRequest) =>
      'FINDING 1 | High | src/orders.ts:12 | Fail fast | Reject invalid order identifiers.' as T,
  });
  const verifier = createVerifier({
    generate: async <T>(_request: ModelRequest) =>
      ({
        findings:
          'FINDING 1 | High | src/orders.ts:12 | Fail fast | Reject invalid order identifiers.',
        summary: 'The missing guard is reproducible.',
      }) as T,
  });

  const [reviewFindings, verificationFindings] = await Promise.all([
    reviewer.run(QUALITY_INPUT),
    verifier.run(QUALITY_INPUT),
  ]);
  const expected = [
    {
      number: 1,
      severity: 'High',
      fileLine: 'src/orders.ts:12',
      rule: 'Fail fast',
      description: 'Reject invalid order identifiers.',
    },
  ];

  assert.deepEqual(reviewFindings, expected);
  assert.deepEqual(verificationFindings, expected);
});

test('verifier rejects a non-string findings field at its output boundary', async () => {
  const verifier = createVerifier({
    generate: async <T>(_request: ModelRequest) =>
      ({ findings: [], summary: 'No findings.' }) as T,
  });

  await assert.rejects(
    verifier.run(QUALITY_INPUT),
    /verifier output.findings must be non-empty text/,
  );
});
