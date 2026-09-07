import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { GrillingQuestion } from './core/grilling.ts';
import { createGriller } from './core/grilling.ts';
import { createGrillingState } from './core/grilling-ui.ts';
import {
  answerQuestions,
  formatQuestionDetail,
  formatQuestionPrompt,
  type GrillingOverlayResult,
  PipelineProgress,
  preflightLanguagePolicies,
} from './pi-extension.ts';

interface CapturedProgressUi {
  readonly statuses: string[];
  readonly widgets: Array<readonly string[]>;
}

function createProgressHarness(): {
  readonly progress: PipelineProgress;
  readonly captured: CapturedProgressUi & {
    readonly statuses: string[];
    readonly widgets: Array<readonly string[]>;
  };
} {
  const statuses: string[] = [];
  const widgets: Array<readonly string[]> = [];
  const context = {
    ui: {
      setStatus: (_key: string, text: string | undefined) => {
        if (text !== undefined) {
          statuses.push(text);
        }
      },
      setWidget: (_key: string, content: string[] | undefined) => {
        if (content !== undefined) {
          widgets.push(content);
        }
      },
    },
  };
  const progress = new PipelineProgress(
    context as unknown as ConstructorParameters<typeof PipelineProgress>[0],
  );
  return { progress, captured: { statuses, widgets } };
}

test('shows the detected map and requires confirmation before pipeline preflight completes', async () => {
  const confirmations: Array<{
    readonly title: string;
    readonly message: string;
  }> = [];
  const policies = await preflightLanguagePolicies(
    'Update src/pi-command.ts and README.md.',
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        confirm: async (title: string, message: string) => {
          confirmations.push({ title, message });
          return true;
        },
        notify: () => undefined,
      },
    },
  );

  assert.deepEqual(policies?.policies, [
    { file: 'README.md', policy: 'shared' },
    { file: 'src/pi-command.ts', policy: 'typescript' },
  ]);
  assert.match(confirmations[0]?.message ?? '', /README\.md → shared/);
  assert.match(
    confirmations[0]?.message ?? '',
    /src\/pi-command\.ts → typescript/,
  );
});

test('stops before pipeline setup when clarification is needed or confirmation is cancelled', async () => {
  const notices: string[] = [];
  const unavailable = await preflightLanguagePolicies(
    'Update /outside/project/app.ts.',
    {
      cwd: process.cwd(),
      hasUI: false,
      ui: {
        confirm: async () => true,
        notify: (message: string) => notices.push(message),
      },
    },
  );
  const noninteractive = await preflightLanguagePolicies(
    'Update src/pi-command.ts.',
    {
      cwd: process.cwd(),
      hasUI: false,
      ui: {
        confirm: async () => true,
        notify: (message: string) => notices.push(message),
      },
    },
  );
  const cancelled = await preflightLanguagePolicies(
    'Update src/pi-command.ts.',
    {
      cwd: process.cwd(),
      hasUI: true,
      ui: {
        confirm: async () => false,
        notify: () => undefined,
      },
    },
  );

  assert.equal(unavailable, undefined);
  assert.match(notices[0] ?? '', /needs clarification/);
  assert.match(notices[0] ?? '', /inside the current project/);
  assert.equal(noninteractive, undefined);
  assert.match(notices[1] ?? '', /interactive confirmation/);
  assert.equal(cancelled, undefined);
});

test('continues with the shared policy when a pathless request has no repository evidence', async () => {
  const notices: string[] = [];
  let confirmations = 0;
  const emptyCwd = mkdtempSync(path.join(os.tmpdir(), 'sideroom-no-evidence-'));
  const preflight = await preflightLanguagePolicies('Add a health endpoint.', {
    cwd: emptyCwd,
    hasUI: true,
    ui: {
      confirm: async () => {
        confirmations += 1;
        return true;
      },
      notify: (message: string) => {
        notices.push(message);
      },
    },
  });

  assert.ok(preflight);
  assert.deepEqual(preflight.policies, [
    { file: '<inferred-repo-scope>', policy: 'shared' },
  ]);
  assert.match(notices[0] ?? '', /shared engineering policy/);
  assert.equal(confirmations, 0);
});

test('infers repository policies for pathless requests without confirmation', async () => {
  const notices: Array<{ readonly message: string; readonly level?: string }> =
    [];
  let confirmations = 0;
  const preflight = await preflightLanguagePolicies('Add a health endpoint.', {
    cwd: process.cwd(),
    hasUI: true,
    ui: {
      confirm: async () => {
        confirmations += 1;
        return true;
      },
      notify: (message: string, level?: string) => {
        notices.push({ message, level });
      },
    },
  });

  assert.ok(preflight);
  assert.ok(preflight.policies.length > 0);
  assert.ok(preflight.policies.some(({ policy }) => policy === 'typescript'));
  assert.equal(confirmations, 0);
  assert.equal(notices.length, 1);
  assert.equal(notices[0]?.level, 'info');
  assert.match(notices[0]?.message ?? '', /inferred/i);
  assert.match(notices[0]?.message ?? '', /without confirmation/);
});

function sampleQuestions(): GrillingQuestion[] {
  return [
    {
      id: 'scope',
      title: 'Decide the rollout scope',
      question:
        'Ship to one team first; a full rollout risks a breaking change.',
      recommendation: 'Pilot with one team to limit blast radius.',
      options: [
        'Pilot with one team to limit blast radius.',
        'Roll out to every team now.',
      ],
      recommendationIndex: 0,
    },
    {
      id: 'store',
      title: 'Choose the session store',
      question:
        'Memory is simple but loses sessions on restart; Redis adds ops work.',
      recommendation: 'Use Redis to survive restarts.',
      options: [
        'Keep in-memory sessions.',
        'Add a database table.',
        'Use Redis to survive restarts.',
      ],
      recommendationIndex: 2,
    },
  ];
}

interface CapturedUiCall {
  readonly kind:
    | 'select'
    | 'input'
    | 'confirm'
    | 'widget'
    | 'custom'
    | 'editor';
  readonly title?: string;
  readonly message?: string;
  readonly options?: readonly string[];
  readonly key?: string;
  readonly lines?: readonly string[];
  readonly overlay?: boolean;
  readonly prefill?: string;
}

/** Factory captured from `ui.custom`: drives the real overlay component. */
type OverlayFactory = (
  tui: unknown,
  theme: unknown,
  keybindings: unknown,
  done: (result: GrillingOverlayResult) => void,
) => {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
};

function createAnswerHarness(queues: {
  readonly selects: Array<string | undefined>;
  readonly inputs: Array<string | undefined>;
  readonly customs?: Array<
    (factory: OverlayFactory) => GrillingOverlayResult | undefined
  >;
  readonly editors?: Array<string | undefined>;
  readonly mode?: 'tui' | 'rpc';
  readonly hasUI?: boolean;
}): {
  readonly context: ConstructorParameters<typeof PipelineProgress>[0];
  readonly progress: PipelineProgress;
  readonly calls: CapturedUiCall[];
} {
  const calls: CapturedUiCall[] = [];
  const selects = [...queues.selects];
  const inputs = [...queues.inputs];
  const customs =
    queues.customs === undefined ? undefined : [...queues.customs];
  const editors = [...(queues.editors ?? [])];
  const context = {
    cwd: process.cwd(),
    mode: queues.mode ?? 'tui',
    hasUI: queues.hasUI ?? true,
    ui: {
      select: async (title: string, options: string[]) => {
        calls.push({ kind: 'select', title, options });
        return selects.shift();
      },
      input: async (title: string, placeholder?: string) => {
        calls.push({ kind: 'input', title, message: placeholder });
        return inputs.shift();
      },
      confirm: async (title: string, message: string) => {
        calls.push({ kind: 'confirm', title, message });
        return false;
      },
      ...(customs === undefined
        ? {}
        : {
            custom: async (
              factory: OverlayFactory,
              options?: { readonly overlay?: boolean },
            ) => {
              calls.push({ kind: 'custom', overlay: options?.overlay });
              const next = customs.shift();
              if (next === undefined) {
                return undefined;
              }
              return next(factory);
            },
          }),
      editor: async (title: string, prefill?: string) => {
        calls.push({ kind: 'editor', title, prefill });
        return editors.shift();
      },
      notify: () => undefined,
      setStatus: () => undefined,
      setWidget: (key: string, content: string[] | undefined) => {
        calls.push({ kind: 'widget', key, lines: content });
      },
    },
  };
  type ProgressContext = ConstructorParameters<typeof PipelineProgress>[0];
  const typed = context as unknown as ProgressContext;
  return { context: typed, progress: new PipelineProgress(typed), calls };
}

test('keeps sequential select detail concise while the widget holds the question context', () => {
  const [first] = sampleQuestions();
  assert.ok(first);
  const prompt = formatQuestionPrompt(first, 1, 2);
  assert.equal(prompt, 'Sideroom Grilling question 1/2');

  const detail = formatQuestionDetail(first, 1, 2).join('\n');
  assert.match(detail, /^Question 1\/2\nDecide the rollout scope/);
  assert.match(detail, /Consequence and context[\s\S]*breaking change/);
  assert.match(detail, /Recommendation \(with trade-off\)[\s\S]*blast radius/);
  assert.match(detail, /✓ 1\. Pilot with one team/);
  assert.match(detail, /2\. Roll out to every team now\./);
  assert.equal(detail.match(/Decide the rollout scope/g)?.length, 1);
});

test('surfaces the active task and round with a focused status line', () => {
  const { progress, captured } = createProgressHarness();

  progress.start();
  progress.report({ phase: 'implementer', status: 'started', taskId: 'T2' });
  progress.report({
    phase: 'grilling',
    status: 'started',
    round: 3,
  });

  const status = captured.statuses.at(-1) ?? '';
  const widget = captured.widgets.at(-1) ?? [];
  assert.match(status, /Grilling \(round 3\): running/);
  assert.ok(
    widget.some((line) => line.startsWith('Focus: Grilling (round 3)')),
  );
  assert.ok(
    widget.some((line) => line.includes('● Grilling (round 3) — running')),
  );
});

test('marks awaiting grilling input without losing the round focus', () => {
  const { progress, captured } = createProgressHarness();

  progress.report({ phase: 'grilling', status: 'started', round: 2 });
  progress.report({ phase: 'grilling', status: 'awaiting-input', round: 2 });
  progress.awaitDecision(4, 6);

  const status = captured.statuses.at(-1) ?? '';
  const widget = captured.widgets.at(-1) ?? [];
  assert.match(status, /awaiting your decision \(question 4\/6\)/);
  assert.match(status, /round 2/);
  assert.ok(widget.some((line) => line.includes('awaiting your decision')));
  assert.ok(widget.some((line) => line.startsWith('Focus: ')));
});

test('keeps long runs focused across repeated tasks and parallel quality gates', () => {
  const { progress, captured } = createProgressHarness();

  progress.report({ phase: 'implementer', status: 'started', taskId: 'T1' });
  progress.report({ phase: 'implementer', status: 'completed', taskId: 'T1' });
  progress.report({ phase: 'implementer', status: 'started', taskId: 'T2' });

  const rerunWidget = captured.widgets.at(-1) ?? [];
  assert.ok(
    rerunWidget.some((line) => line.includes('● Implementer T2 — running')),
  );

  progress.report({ phase: 'reviewer', status: 'started' });
  progress.report({ phase: 'verifier', status: 'started' });

  const parallelWidget = captured.widgets.at(-1) ?? [];
  assert.ok(
    parallelWidget.some((line) => line.includes('● Reviewer — running')),
  );
  assert.ok(
    parallelWidget.some((line) => line.includes('● Verifier — running')),
  );
  assert.ok(parallelWidget.some((line) => line.startsWith('Focus: Verifier')));
});

test('starts with initial status and clears the progress widget when done', () => {
  let cleared = false;
  const statuses: string[] = [];
  const context = {
    ui: {
      setStatus: (_key: string, text: string | undefined) => {
        if (text !== undefined) {
          statuses.push(text);
        }
      },
      setWidget: (_key: string, content: string[] | undefined) => {
        if (content === undefined) {
          cleared = true;
        }
      },
    },
  };
  const progress = new PipelineProgress(
    context as unknown as ConstructorParameters<typeof PipelineProgress>[0],
  );

  progress.start();
  progress.awaitDecision(1, 2);
  progress.clear();

  assert.match(statuses[0] ?? '', /starting isolated Pi SDK role sessions/);
  assert.match(statuses.at(-1) ?? '', /round \?/);
  assert.equal(cleared, true);
});

test('marks failed phases and pipeline failures durably', () => {
  const { progress, captured } = createProgressHarness();

  progress.report({ phase: 'verifier', status: 'started' });
  progress.report({ phase: 'verifier', status: 'failed' });
  progress.report({ phase: 'pipeline', status: 'failed' });

  const widget = captured.widgets.at(-1) ?? [];
  assert.ok(widget.some((line) => line.includes('✗ Verifier — failed')));
  assert.ok(widget.some((line) => line.includes('✗ Pipeline')));
});

test('answers the whole batch through a single overlay call', async () => {
  const { context, progress, calls } = createAnswerHarness({
    selects: [],
    inputs: [],
    customs: [
      (factory) => {
        let renderRequests = 0;
        let doneResult: GrillingOverlayResult | undefined;
        const component = factory(
          { requestRender: () => (renderRequests += 1) },
          undefined,
          undefined,
          (result) => {
            doneResult = result;
          },
        );
        component.handleInput('\u001b[C');
        component.handleInput('\u001b[B');
        component.handleInput('o');
        const screen = component.render(80).join('\n');
        assert.match(screen, /\[out of scope\]/);
        assert.ok(component.render(24).every((line) => line.length <= 24));
        assert.equal(renderRequests, 3);
        component.handleInput('\r');
        assert.ok(doneResult, 'expected the overlay to confirm');
        assert.equal(doneResult.kind, 'confirmed');
        assert.equal(doneResult.state.selections[0]?.selected, 1);
        assert.equal(doneResult.state.selections[1]?.outOfScope, true);
        return doneResult;
      },
    ],
    editors: [],
  });

  const answers = await answerQuestions(sampleQuestions(), context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Roll out to every team now.' },
    { id: 'store', answer: 'Out of scope' },
  ]);
  assert.equal(calls.filter((call) => call.kind === 'custom').length, 1);
  assert.equal(
    calls.find((call) => call.kind === 'custom')?.overlay,
    undefined,
  );
  assert.equal(calls.filter((call) => call.kind === 'select').length, 0);
  assert.equal(calls.filter((call) => call.kind === 'confirm').length, 0);
});

test('reopens the multiline editor from the selected custom action with its existing text', async () => {
  let openings = 0;
  const overlay = (
    factory: OverlayFactory,
  ): GrillingOverlayResult | undefined => {
    openings += 1;
    let doneResult: GrillingOverlayResult | undefined;
    const component = factory(undefined, undefined, undefined, (result) => {
      doneResult = result;
    });
    if (openings === 1) {
      component.handleInput('\u001b[B');
      component.handleInput('\u001b[C');
      component.handleInput('\u001b[C');
      component.handleInput('\r');
      assert.ok(doneResult, 'expected the custom action to open the editor');
      return doneResult;
    }
    const screen = component.render(80).join('\n');
    assert.match(screen, /signed cookies/);
    if (openings === 3) {
      component.handleInput('\u001b[A');
    }
    component.handleInput('\r');
    if (openings === 2) {
      assert.ok(
        doneResult,
        'expected the selected custom action to reopen the editor',
      );
    }
    return doneResult;
  };
  const { context, progress, calls } = createAnswerHarness({
    selects: [],
    inputs: [],
    customs: [overlay, overlay, overlay],
    editors: [
      'Store sessions in signed cookies.',
      'Store sessions in encrypted signed cookies.',
    ],
  });

  const answers = await answerQuestions(sampleQuestions(), context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
    { id: 'store', answer: 'Store sessions in encrypted signed cookies.' },
  ]);
  assert.equal(openings, 3);
  const editorCalls = calls.filter((call) => call.kind === 'editor');
  assert.equal(editorCalls.length, 2);
  assert.match(editorCalls[0]?.title ?? '', /Q2/);
  assert.equal(editorCalls[0]?.prefill, '');
  assert.equal(editorCalls[1]?.prefill, 'Store sessions in signed cookies.');
});

test('reopens the overlay unchanged when the custom editor is cancelled', async () => {
  let openings = 0;
  const overlay = (
    factory: OverlayFactory,
  ): GrillingOverlayResult | undefined => {
    openings += 1;
    let doneResult: GrillingOverlayResult | undefined;
    const component = factory(undefined, undefined, undefined, (result) => {
      doneResult = result;
    });
    if (openings === 1) {
      component.handleInput('\u001b[C');
      component.handleInput('\u001b[C');
      component.handleInput('\u001b[C');
      component.handleInput('\r');
      return doneResult;
    }
    const screen = component.render(80).join('\n');
    assert.doesNotMatch(screen, /signed cookies/);
    component.handleInput('\r');
    return doneResult;
  };
  const { context, progress } = createAnswerHarness({
    selects: [],
    inputs: [],
    customs: [overlay, overlay],
    editors: [undefined],
  });

  const answers = await answerQuestions(sampleQuestions(), context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
    { id: 'store', answer: 'Use Redis to survive restarts.' },
  ]);
  assert.equal(openings, 2);
});

test('falls back to sequential selects when the overlay is cancelled', async () => {
  const questions = sampleQuestions();
  const overlay = (): GrillingOverlayResult | undefined => ({
    kind: 'cancelled',
    state: createGrillingState(questions),
  });
  const { context, progress, calls } = createAnswerHarness({
    selects: [undefined, undefined],
    inputs: [],
    customs: [overlay],
    editors: [],
  });

  const answers = await answerQuestions(questions, context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
    { id: 'store', answer: 'Use Redis to survive restarts.' },
  ]);
  assert.equal(calls.filter((call) => call.kind === 'select').length, 2);
});

test('falls back to sequential selects when custom resolves without a result', async () => {
  const { context, progress } = createAnswerHarness({
    selects: ['Out of scope', '✓ Recommended: Use Redis to survive restarts.'],
    inputs: [],
    customs: [() => undefined],
    editors: [],
  });

  const answers = await answerQuestions(sampleQuestions(), context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Out of scope' },
    { id: 'store', answer: 'Use Redis to survive restarts.' },
  ]);
});

test('answers sequentially with out-of-scope inline when custom UI is unavailable', async () => {
  const { context, progress, calls } = createAnswerHarness({
    selects: ['Out of scope', 'Write a custom answer'],
    inputs: ['Store sessions in signed cookies.'],
  });

  const answers = await answerQuestions(sampleQuestions(), context, progress);

  assert.deepEqual(answers, [
    { id: 'scope', answer: 'Out of scope' },
    { id: 'store', answer: 'Store sessions in signed cookies.' },
  ]);
  const firstSelect = calls.find((call) => call.kind === 'select');
  assert.equal(firstSelect?.title, 'Sideroom Grilling');
  assert.deepEqual(firstSelect?.options, [
    '✓ Recommended: Pilot with one team to limit blast radius.',
    'Roll out to every team now.',
    'Out of scope',
    'Write a custom answer',
  ]);
  assert.equal(calls.filter((call) => call.kind === 'confirm').length, 0);
});

test('auto-accepts recommendations without dialogs outside the TUI', async () => {
  const rpc = createAnswerHarness({
    selects: ['Out of scope'],
    inputs: [],
    customs: [() => undefined],
    editors: [],
    mode: 'rpc',
  });
  assert.equal(
    await answerQuestions(sampleQuestions(), rpc.context, rpc.progress),
    undefined,
  );
  assert.deepEqual(
    rpc.calls.filter((call) => call.kind !== 'widget'),
    [],
  );

  const headless = createAnswerHarness({
    selects: [],
    inputs: [],
    mode: 'tui',
    hasUI: false,
  });
  assert.equal(
    await answerQuestions(
      sampleQuestions(),
      headless.context,
      headless.progress,
    ),
    undefined,
  );
  assert.deepEqual(
    headless.calls.filter((call) => call.kind !== 'widget'),
    [],
  );
});

test('publishes the question widget before each select', async () => {
  const { context, progress, calls } = createAnswerHarness({
    selects: ['✓ Recommended: Pilot with one team to limit blast radius.'],
    inputs: [],
  });

  await answerQuestions(sampleQuestions().slice(0, 1), context, progress);

  const widgetIndex = calls.findIndex(
    (call) =>
      call.kind === 'widget' &&
      call.key === 'sideroom-grilling' &&
      call.lines !== undefined,
  );
  const selectIndex = calls.findIndex((call) => call.kind === 'select');
  assert.ok(widgetIndex !== -1, 'expected a grilling detail widget');
  assert.ok(selectIndex !== -1, 'expected a select call');
  assert.ok(
    widgetIndex < selectIndex,
    'widget must be published before the select',
  );
  const widget = calls[widgetIndex];
  assert.ok(widget?.lines?.some((line) => line.includes('breaking change')));
  assert.ok(widget?.lines?.some((line) => line.includes('blast radius')));
  assert.ok(
    widget?.lines?.some((line) => line.includes('Roll out to every team now.')),
  );
});

test('auto-accepts recommendations when sequential dialogs are cancelled', async () => {
  const escaped = createAnswerHarness({
    selects: [undefined, undefined],
    inputs: [],
  });
  assert.deepEqual(
    await answerQuestions(sampleQuestions(), escaped.context, escaped.progress),
    [
      { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
      { id: 'store', answer: 'Use Redis to survive restarts.' },
    ],
  );

  const customCancelled = createAnswerHarness({
    selects: [
      '✓ Recommended: Pilot with one team to limit blast radius.',
      'Write a custom answer',
    ],
    inputs: [undefined],
  });
  assert.deepEqual(
    await answerQuestions(
      sampleQuestions(),
      customCancelled.context,
      customCancelled.progress,
    ),
    [
      { id: 'scope', answer: 'Pilot with one team to limit blast radius.' },
      { id: 'store', answer: 'Use Redis to survive restarts.' },
    ],
  );
});

test('parses structured grilling options with a validated recommendation index', async () => {
  const griller = createGriller({
    generate: async <T>() =>
      ({
        status: 'questions',
        questions: [
          {
            id: 'scope',
            title: 'Decide the rollout scope',
            question: 'Ship to one team first.',
            recommendation: 'Pilot with one team.',
            options: ['Pilot with one team.', 'Roll out to every team now.'],
            recommendationIndex: 0,
          },
        ],
      }) as T,
  });

  const result = await griller.run({ request: 'Add endpoint', answers: [] });
  if (result.status !== 'questions') {
    assert.fail('expected a questions round');
  }
  assert.deepEqual(result.questions, [
    {
      id: 'scope',
      title: 'Decide the rollout scope',
      question: 'Ship to one team first.',
      recommendation: 'Pilot with one team.',
      options: ['Pilot with one team.', 'Roll out to every team now.'],
      recommendationIndex: 0,
    },
  ]);
});

test('derives options from a lone recommendation for backwards compatibility', async () => {
  const griller = createGriller({
    generate: async <T>() =>
      ({
        status: 'questions',
        questions: [
          {
            id: 'scope',
            title: 'Decide the rollout scope',
            question: 'Ship to one team first.',
            recommendation: 'Pilot with one team.',
          },
        ],
      }) as T,
  });

  const result = await griller.run({ request: 'Add endpoint', answers: [] });
  if (result.status !== 'questions') {
    assert.fail('expected a questions round');
  }
  assert.deepEqual(result.questions[0]?.options, ['Pilot with one team.']);
  assert.equal(result.questions[0]?.recommendationIndex, 0);
});

test('rejects structured options with a wrong shape or mismatched recommendation', async () => {
  const base = {
    id: 'scope',
    title: 'Decide the rollout scope',
    question: 'Ship to one team first.',
    recommendation: 'Pilot with one team.',
  };
  const cases: Array<{ readonly question: unknown; readonly message: RegExp }> =
    [
      {
        question: {
          ...base,
          options: ['Pilot with one team.'],
          recommendationIndex: 0,
        },
        message: /two or three options/,
      },
      {
        question: {
          ...base,
          options: ['A.', 'B.', 'C.', 'D.'],
          recommendationIndex: 0,
        },
        message: /two or three options/,
      },
      {
        question: {
          ...base,
          options: ['Pilot with one team.', '   '],
          recommendationIndex: 0,
        },
        message: /non-empty options/,
      },
      {
        question: {
          ...base,
          options: ['Pilot with one team.', 'Roll out to every team now.'],
        },
        message: /invalid recommendationIndex/,
      },
      {
        question: {
          ...base,
          options: ['Pilot with one team.', 'Roll out to every team now.'],
          recommendationIndex: 2,
        },
        message: /invalid recommendationIndex/,
      },
      {
        question: {
          ...base,
          options: ['Pilot with one team.', 'Roll out to every team now.'],
          recommendationIndex: 1,
        },
        message: /must match options\[recommendationIndex\]/,
      },
    ];
  for (const { question, message } of cases) {
    const griller = createGriller({
      generate: async <T>() =>
        ({ status: 'questions', questions: [question] }) as T,
    });
    await assert.rejects(
      () => griller.run({ request: 'Add endpoint', answers: [] }),
      message,
    );
  }
});
