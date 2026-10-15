import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseProject,
  chooseSourceAction,
  chooseVisualAction,
} from './dialogs.ts';
import type { PendingSelection, SourceCandidate } from './model.ts';
import type { VisualProject } from './projects.ts';

const candidate: SourceCandidate = {
  path: 'src/Save.vue',
  startLine: 2,
  endLine: 3,
  fingerprint: 'a'.repeat(64),
  score: 10,
  reasons: ['matching class'],
};
const entry: PendingSelection = {
  selection: {
    id: 'save-1',
    page: 'http://localhost/account',
    element: { tag: 'button', elementId: 'save', classes: [] },
    text: 'Save',
    ancestors: [],
  },
  resolution: { candidates: [candidate], truncated: false, capped: false },
};
function dialog(answer: number | undefined) {
  const calls: { title: string; options: readonly string[] }[] = [];
  const notices: string[] = [];
  const ui = {
    select: async (title: string, options: string[]) => {
      calls.push({ title, options });
      return answer === undefined ? undefined : options[answer];
    },
    notify: (notice: string) => {
      notices.push(notice);
    },
  };
  return { ui, calls, notices };
}

test('F7 offers the same controls and returns the original pending entry without changing it', async () => {
  const prompt = dialog(1);
  const selected = await chooseVisualAction({
    ui: prompt.ui,
    pending: [entry],
    connected: true,
  });
  assert.equal(selected?.action, 'review');
  assert.ok(selected?.action === 'review');
  assert.equal(selected.entry, entry);
  assert.deepEqual(prompt.calls[0]?.options, [
    'Pair browser',
    'Review button#save [save-1]',
    'Remove all pending elements',
    'Disconnect browser',
  ]);
  const disconnected = dialog(undefined);
  assert.equal(
    await chooseVisualAction({
      ui: disconnected.ui,
      pending: [],
      connected: false,
    }),
    undefined,
  );
  assert.deepEqual(disconnected.calls[0]?.options, [
    'Pair browser',
    'Remove all pending elements',
  ]);
});

test('source dialogs distinguish candidates, association, removal and cancellation without applying a choice', async () => {
  for (const [answer, action] of [
    [0, 'choose'],
    [1, 'associate'],
    [2, 'remove'],
  ] as const) {
    const prompt = dialog(answer);
    const selected = await chooseSourceAction(prompt.ui, entry);
    assert.equal(selected?.action, action);
    if (selected?.action === 'choose') {
      assert.equal(selected.candidate, candidate);
    }
    assert.equal(entry.chosen, undefined);
    assert.equal(
      prompt.calls[0]?.title,
      'Choose a source candidate — origin is inferred',
    );
  }
  const cancelled = dialog(undefined);
  assert.equal(await chooseSourceAction(cancelled.ui, entry), undefined);
  const compiler = dialog(undefined);
  await chooseSourceAction(compiler.ui, {
    ...entry,
    selection: {
      ...entry.selection,
      source: { path: candidate.path, line: 2, column: 1 },
    },
  });
  assert.equal(compiler.calls[0]?.title, 'Review compiler location');
});

test('project dialogs keep limits and discovery failures visible and return the selected original project', async () => {
  const project: VisualProject = {
    path: 'site',
    name: 'Site',
    manager: 'npm',
    installed: false,
  };
  const prompt = dialog(0);
  assert.equal(
    await chooseProject(prompt.ui, {
      projects: [project],
      truncated: true,
      issues: [],
    }),
    project,
  );
  assert.equal(
    prompt.calls[0]?.title,
    'Choose project — discovery reached a limit',
  );
  assert.deepEqual(prompt.calls[0]?.options, ['site — Site']);
  const empty = dialog(0);
  assert.equal(
    await chooseProject(empty.ui, {
      projects: [],
      truncated: false,
      issues: ['Invalid manifest'],
    }),
    undefined,
  );
  assert.equal(empty.calls.length, 0);
  assert.match(empty.notices[0] ?? '', /Invalid manifest/u);
  const cancelled = dialog(undefined);
  assert.equal(
    await chooseProject(cancelled.ui, {
      projects: [project],
      truncated: false,
      issues: [],
    }),
    undefined,
  );
});
