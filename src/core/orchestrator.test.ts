import assert from 'node:assert/strict';
import test from 'node:test';

import type { FixerInput } from './agents.ts';
import type { GrillingQuestion } from './grilling.ts';
import { SideroomOrchestrator } from './orchestrator.ts';

test('repairs blocking findings without creating project-local state', async () => {
  let reviewCalls = 0;
  let fixes = 0;
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({
        taskId: 'T1',
        filesChanged: ['src/a.ts'],
        summary: 'implemented',
      }),
    },
    reviewer: {
      id: 'sideroom-code-reviewer',
      run: async () => {
        reviewCalls += 1;
        return reviewCalls === 1
          ? [
              {
                number: 1,
                severity: 'High' as const,
                fileLine: 'src/a.ts:1',
                rule: 'Fail fast',
                description: 'missing guard',
              },
            ]
          : [];
      },
    },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: {
      id: 'sideroom-fixer',
      run: async () => {
        fixes += 1;
        return 'fixed';
      },
    },
  });

  const result = await pipeline.run('make a change');
  assert.equal(result.status, 'completed');
  assert.equal(fixes, 1);
  assert.equal(result.implementations[0]?.filesChanged[0], 'src/a.ts');
});

test('merges quality findings into a sourced fixer handoff', async () => {
  let fixerFindings: FixerInput['findings'] | undefined;
  const pipeline = new SideroomOrchestrator({
    maxFixPasses: 1,
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: {
      id: 'sideroom-code-reviewer',
      run: async () => [
        {
          number: 1,
          severity: 'Medium' as const,
          fileLine: 'src/a.ts:1',
          rule: 'Fail fast',
          description: 'missing guard',
        },
        {
          number: 2,
          severity: 'High' as const,
          fileLine: 'src/a.ts:1',
          rule: 'Fail fast',
          description: 'missing guard',
        },
        {
          number: 3,
          severity: 'Medium' as const,
          fileLine: 'src/b.ts:2',
          rule: 'Validate input',
          description: 'missing validation',
        },
      ],
    },
    verifier: {
      id: 'sideroom-verifier',
      run: async () => [
        {
          number: 1,
          severity: 'Critical' as const,
          fileLine: 'src/a.ts:1',
          rule: 'Fail fast',
          description: 'missing guard',
        },
        {
          number: 2,
          severity: 'Low' as const,
          fileLine: 'src/a.ts:1',
          rule: 'Fail fast',
          description: 'missing guard',
        },
        {
          number: 3,
          severity: 'Low' as const,
          fileLine: 'src/c.ts:3',
          rule: 'Naming',
          description: 'unclear name',
        },
      ],
    },
    fixer: {
      id: 'sideroom-fixer',
      run: async ({ findings }) => {
        fixerFindings = findings;
        return 'fixed';
      },
    },
  });

  const result = await pipeline.run('make a change');
  const expected = [
    {
      number: 1,
      severity: 'Critical',
      fileLine: 'src/a.ts:1',
      rule: 'Fail fast',
      description: 'missing guard',
      sources: ['reviewer', 'verifier'],
    },
    {
      number: 2,
      severity: 'Medium',
      fileLine: 'src/b.ts:2',
      rule: 'Validate input',
      description: 'missing validation',
      sources: ['reviewer'],
    },
    {
      number: 3,
      severity: 'Low',
      fileLine: 'src/c.ts:3',
      rule: 'Naming',
      description: 'unclear name',
      sources: ['verifier'],
    },
  ];

  assert.equal(result.status, 'failed');
  assert.deepEqual(fixerFindings, expected);
  assert.deepEqual(result.findings, expected);
});

test('hands the settled grilling context to the planner in memory', async () => {
  let plannedRequest = '';
  let grillingCalls = 0;
  const grillingEvents: string[] = [];
  const pipeline = new SideroomOrchestrator({
    griller: {
      run: async () => {
        grillingCalls += 1;
        return grillingCalls <= 9
          ? {
              status: 'questions' as const,
              questions: [
                {
                  id: `Q${grillingCalls}`,
                  title: 'Scope',
                  question: 'Include existing clients?',
                  recommendation: 'Keep existing clients compatible.',
                  options: [
                    'Keep existing clients compatible.',
                    'Scope to new clients only.',
                  ],
                  recommendationIndex: 0,
                },
              ],
            }
          : {
              status: 'settled' as const,
              summary: 'Existing clients stay compatible.',
            };
      },
    },
    planner: {
      id: 'sideroom-planner',
      run: async ({ request }) => {
        plannedRequest = request;
        return {
          summary: 'plan',
          tasks: [{ id: 'T1', title: 'change' }],
          verification: [],
        };
      },
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: { id: 'sideroom-code-reviewer', run: async () => [] },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: { id: 'sideroom-fixer', run: async () => 'not needed' },
    onStage: (event) => {
      if (event.phase === 'grilling') {
        grillingEvents.push(`${event.status}:${String(event.round)}`);
      }
    },
  });

  const result = await pipeline.run('Add an endpoint', async (questions) =>
    questions.map((question) => ({
      id: question.id,
      answer: question.recommendation,
    })),
  );

  assert.equal(result.status, 'completed');
  assert.equal(grillingCalls, 10);
  assert.match(plannedRequest, /Settled understanding/);
  assert.match(plannedRequest, /Existing clients stay compatible/);
  assert.equal(
    grillingEvents.filter((event) => event.startsWith('awaiting-input')).length,
    9,
  );
  assert.equal(
    grillingEvents.filter((event) => event.startsWith('started')).length,
    10,
  );
  assert.equal(grillingEvents.at(-1), 'completed:10');
});

test('emits host-owned role transitions for Pi provenance', async () => {
  const phases: string[] = [];
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: { id: 'sideroom-code-reviewer', run: async () => [] },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: { id: 'sideroom-fixer', run: async () => 'not needed' },
    onStage: (event) => phases.push(`${event.phase}:${event.status}`),
  });

  const result = await pipeline.run('make a change');

  assert.equal(result.status, 'completed');
  assert.deepEqual(phases, [
    'planner:started',
    'planner:completed',
    'implementer:started',
    'implementer:completed',
    'reviewer:started',
    'verifier:started',
    'reviewer:completed',
    'verifier:completed',
  ]);
});

test('rejects invalid findings before they reach the fixer', async () => {
  let fixerCalls = 0;
  const pipeline = new SideroomOrchestrator({
    planner: {
      id: 'sideroom-planner',
      run: async () => ({
        summary: 'plan',
        tasks: [{ id: 'T1', title: 'change' }],
        verification: [],
      }),
    },
    implementer: {
      id: 'sideroom-implementer',
      run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
    },
    reviewer: {
      id: 'sideroom-code-reviewer',
      run: async () =>
        [
          {
            number: 1,
            severity: 'High',
            fileLine: '',
            rule: 'Fail fast',
            description: 'Missing guard.',
          },
        ] as unknown as [],
    },
    verifier: { id: 'sideroom-verifier', run: async () => [] },
    fixer: {
      id: 'sideroom-fixer',
      run: async () => {
        fixerCalls += 1;
        return 'not reached';
      },
    },
  });

  const result = await pipeline.run('make a change');

  assert.equal(result.status, 'failed');
  assert.equal(fixerCalls, 0);
  assert.match(
    result.summary,
    /reviewer stage finding 1 field "fileLine" must be non-empty text/,
  );
});

test('auto-settles grilling when the answerer is cancelled or missing', async () => {
  const questions = [
    {
      id: 'scope',
      title: 'Scope',
      question: 'Include existing clients?',
      recommendation: 'Keep existing clients compatible.',
      options: [
        'Keep existing clients compatible.',
        'Scope to new clients only.',
      ],
      recommendationIndex: 0,
    },
  ];
  async function runWithAnswerer(
    answerer:
      | ((questions: readonly GrillingQuestion[]) => Promise<undefined>)
      | undefined,
  ): Promise<string> {
    let plannedRequest = '';
    let rounds = 0;
    const pipeline = new SideroomOrchestrator({
      griller: {
        run: async ({ answers }) => {
          if (answers.length > 0) {
            return {
              status: 'settled' as const,
              summary: 'Existing clients stay compatible.',
            };
          }
          rounds += 1;
          return { status: 'questions' as const, questions };
        },
      },
      planner: {
        id: 'sideroom-planner',
        run: async ({ request }) => {
          plannedRequest = request;
          return {
            summary: 'plan',
            tasks: [{ id: 'T1', title: 'change' }],
            verification: [],
          };
        },
      },
      implementer: {
        id: 'sideroom-implementer',
        run: async () => ({ taskId: 'T1', filesChanged: [], summary: 'done' }),
      },
      reviewer: { id: 'sideroom-code-reviewer', run: async () => [] },
      verifier: { id: 'sideroom-verifier', run: async () => [] },
      fixer: { id: 'sideroom-fixer', run: async () => 'not needed' },
    });
    const result =
      answerer === undefined
        ? await pipeline.run('Add an endpoint')
        : await pipeline.run('Add an endpoint', answerer);
    assert.equal(result.status, 'completed');
    assert.equal(rounds, 1);
    return plannedRequest;
  }

  const cancelledRequest = await runWithAnswerer(async () => undefined);
  assert.match(cancelledRequest, /Settled understanding/);
  assert.match(cancelledRequest, /Existing clients stay compatible/);

  const missingRequest = await runWithAnswerer(undefined);
  assert.match(missingRequest, /Settled understanding/);
  assert.match(missingRequest, /Existing clients stay compatible/);
});
