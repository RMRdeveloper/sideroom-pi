import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFileState, requestFitsBudget } from './model.ts';
import {
  buildAskReview,
  buildBoardReview,
  completedItems,
  createWorkflowEvidence,
  recordFileEvidence,
  resetWorkflowEvidence,
} from './workflow.ts';

const questionnaire = {
  questions: [
    {
      id: 'storage',
      prompt: 'Choose storage',
      options: [
        { value: 'local', label: 'Local' },
        { value: 'remote', label: 'Remote' },
      ],
      recommendationIndex: 0,
    },
  ],
};
const completed = [
  { id: 'build', content: 'Implement storage', status: 'completed' as const },
];

test('reviews only parsed question wording, with no answers or conversation', () => {
  const request = buildAskReview({
    ...questionnaire,
    conversation: 'private chat',
    answers: ['private answer'],
  });
  assert.ok(request && requestFitsBudget(request));
  assert.deepEqual(Object.keys(request.state as object), ['kind', 'questions']);
  assert.ok(request.questions['question-options']);
  assert.ok(request.questions['question-recommendation']);
  assert.doesNotMatch(JSON.stringify(request), /private chat|private answer/);
  assert.equal(buildAskReview({ questions: [] }), undefined);
  assert.equal(
    buildAskReview({
      questions: [
        { ...questionnaire.questions[0], prompt: 'x'.repeat(33_000) },
      ],
    }),
    undefined,
  );
});

test('validates board results and excludes pending work', () => {
  assert.equal(
    completedItems({ error: 'invalid', items: completed }),
    undefined,
  );
  assert.equal(completedItems({ items: [{ id: 'broken' }] }), undefined);
  assert.deepEqual(
    completedItems({
      items: [
        ...completed,
        { id: 'next', content: 'Continue', status: 'in_progress' },
      ],
    }),
    completed,
  );
});

test('asks about new completions only with evidence, once per unchanged completion', () => {
  const evidence = createWorkflowEvidence();
  assert.equal(buildBoardReview({ items: completed, evidence }), undefined);
  resetWorkflowEvidence(evidence);
  recordFileEvidence(
    evidence,
    buildFileState(
      'src/storage.ts',
      'export const save = () => true;',
      'edit',
      [],
    ),
  );
  evidence.checks = 'failed';
  const request = buildBoardReview({ items: completed, evidence });
  assert.ok(request && requestFitsBudget(request));
  assert.match(JSON.stringify(request.state), /failed/);
  assert.equal(buildBoardReview({ items: completed, evidence }), undefined);
  buildBoardReview({ items: [], evidence });
  assert.ok(buildBoardReview({ items: completed, evidence }));
});

test('bounds evidence, invalidates green checks, and omits whole oversized snapshots', () => {
  const evidence = createWorkflowEvidence();
  for (let index = 0; index < 6; index += 1) {
    evidence.checks = 'passed';
    recordFileEvidence(
      evidence,
      buildFileState(`src/file${index}.ts`, 'x'.repeat(14_000), 'edit', []),
    );
  }
  assert.equal(evidence.checks, 'stale');
  assert.equal(evidence.files.size, 4);
  assert.equal(evidence.partial, true);
  const request = buildBoardReview({ items: completed, evidence });
  assert.ok(request && requestFitsBudget(request));
  const state = request.state as {
    evidence: { files: unknown[]; partial: boolean };
  };
  assert.equal(state.evidence.files.length, 2);
  assert.equal(state.evidence.partial, true);
  resetWorkflowEvidence(evidence);
  assert.equal(evidence.files.size, 0);
  assert.equal(evidence.completed.size, 0);
  assert.equal(evidence.checks, 'unknown');
});

test('uses an observed check result even without source and does not reconsider untouched completed tasks', () => {
  const evidence = createWorkflowEvidence();
  evidence.checks = 'failed';
  const request = buildBoardReview({
    items: completed,
    evidence,
    changedIds: new Set(['build']),
  });
  assert.ok(request);
  resetWorkflowEvidence(evidence);
  evidence.checks = 'failed';
  assert.equal(
    buildBoardReview({
      items: completed,
      evidence,
      changedIds: new Set(['other']),
    }),
    undefined,
  );
});
