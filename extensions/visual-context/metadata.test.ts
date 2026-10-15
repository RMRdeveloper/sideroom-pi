import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  parseSelection,
  SOURCE_METHOD,
  type VisualSelection,
} from './model.ts';
import {
  bindProject,
  createVisualStore,
  prepareContext,
  receiveSelection,
  restorePending,
} from './session.ts';
import {
  candidateIsCurrent,
  resolveCompilerLocation,
  resolveProjectSelection,
  resolveSelection,
} from './source.ts';

const selection: VisualSelection = {
  id: 'dynamic',
  page: 'http://localhost:5173/account',
  element: { tag: 'button', elementId: '', classes: [] },
  text: 'Dynamic label',
  ancestors: [],
};

test('compiler coordinates distinguish repeated dynamic nodes across sibling projects and invalidate after edits', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-location-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const project of ['shop', 'admin']) {
    mkdirSync(join(root, project, 'src'), { recursive: true });
    writeFileSync(
      join(root, project, 'src/Button.tsx'),
      'export const Button = ({label}) => <><button>{label}</button><button>{label}</button></>;',
    );
  }
  const selected: VisualSelection = {
    ...selection,
    source: { path: join(root, 'shop/src/Button.tsx'), line: 1, column: 38 },
  };
  const resolution = resolveSelection(root, selected);
  assert.equal(resolution.candidates.length, 1);
  const candidate = resolution.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.path, 'shop/src/Button.tsx');
  assert.equal(candidate.method, SOURCE_METHOD.compiler);
  assert.equal(candidate.startColumn, 38);
  assert.equal(candidateIsCurrent(root, candidate), true);
  writeFileSync(
    join(root, 'shop/src/Button.tsx'),
    'export const Button = () => <span>Changed</span>;',
  );
  assert.equal(candidateIsCurrent(root, candidate), false);
  assert.equal(resolveSelection(root, selected).candidates.length, 0);
});

test('project-scoped lookup respects workspace ignores before parsing excluded source', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-parent-ignore-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'shop'));
  writeFileSync(join(root, '.gitignore'), 'shop/excluded.tsx\n');
  writeFileSync(join(root, 'shop/excluded.tsx'), 'invalid <button');
  writeFileSync(
    join(root, 'shop/button.html'),
    '<button>Dynamic label</button>',
  );
  const inferred = resolveProjectSelection({
    cwd: root,
    project: 'shop',
    selection,
  });
  assert.equal(inferred.truncated, false);
  assert.deepEqual(
    inferred.candidates.map((candidate) => candidate.path),
    ['shop/button.html'],
  );
  const excluded = resolveProjectSelection({
    cwd: root,
    project: 'shop',
    selection: {
      ...selection,
      source: { path: 'excluded.tsx', line: 1, column: 1 },
    },
  });
  assert.deepEqual(excluded.candidates, []);
  assert.ok(excluded.issue);
});

test('compiler validation supports the original coordinates of each existing markup dialect', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-dialects-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, source, line, column] of [
    [
      'Button.js',
      'export const Button = () => <button>{label}</button>;',
      1,
      29,
    ],
    [
      'Button.vue',
      '<template>\n  <button>{{ label }}</button>\n</template>',
      2,
      3,
    ],
    [
      'Button.svelte',
      '<script>let label;</script>\n  <button>{label}</button>',
      2,
      3,
    ],
    [
      'Button.astro',
      '---\nconst label = "dynamic";\n---\n  <button>{label}</button>',
      4,
      3,
    ],
    ['button.html', '\n  <button>Dynamic label</button>', 2, 3],
  ] as const) {
    writeFileSync(join(root, path), source);
    const resolution = resolveSelection(root, {
      ...selection,
      source: { path: join(root, path), line, column },
    });
    assert.equal(
      resolution.candidates.length,
      1,
      `${path}: ${resolution.issue}`,
    );
  }
});

test('metadata paths cannot bypass ignores, sensitive names, symlink parents or project boundaries', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-boundaries-'));
  const outside = mkdtempSync(join(tmpdir(), 'sideroom-visual-outside-'));
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, 'shop'));
  writeFileSync(join(root, '.gitignore'), 'ignored.html\n');
  for (const path of [
    'ignored.html',
    'private-key.html',
    '.hidden.html',
    'shop/button.html',
  ]) {
    writeFileSync(join(root, path), '<button>Dynamic label</button>');
  }
  writeFileSync(join(outside, 'button.html'), '<button>Dynamic label</button>');
  symlinkSync(outside, join(root, 'linked'));
  for (const path of [
    'ignored.html',
    'private-key.html',
    '.hidden.html',
    'linked/button.html',
    '../button.html',
    join(outside, 'button.html'),
  ]) {
    const resolution = resolveCompilerLocation({
      cwd: root,
      project: '.',
      selection: { ...selection, source: { path, line: 1, column: 1 } },
    });
    assert.deepEqual(resolution.candidates, [], path);
    assert.ok(resolution.issue);
  }
  const wrongTag = resolveSelection(root, {
    ...selection,
    element: { ...selection.element, tag: 'span' },
    source: { path: join(root, 'shop/button.html'), line: 1, column: 1 },
  });
  assert.deepEqual(wrongTag.candidates, []);
  assert.throws(() =>
    parseSelection({
      ...selection,
      source: { path: 'button.html', line: 0, column: 1 },
    }),
  );
});

test('relative locations require an explicit page association, persist on the branch, and never mix sibling origins', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-bindings-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const project of ['shop', 'admin']) {
    mkdirSync(join(root, project));
    writeFileSync(join(root, project, 'package.json'), '{}');
    writeFileSync(
      join(root, project, 'button.html'),
      '<button>Dynamic label</button>',
    );
  }
  const snapshots: { type: 'custom'; customType: string; data: unknown }[] = [];
  const pi = {
    appendEntry: (customType: string, payload: unknown) => {
      snapshots.push({ type: 'custom', customType, data: payload });
    },
  };
  const store = createVisualStore();
  const selected = {
    ...selection,
    source: { path: 'button.html', line: 1, column: 1 },
  };
  receiveSelection({ store, pi, cwd: root, selection: selected });
  assert.equal(store.pending[0]?.resolution.candidates.length, 0);
  bindProject({ store, pi, cwd: root, project: 'shop', page: selection.page });
  assert.equal(store.pending[0]?.chosen?.path, 'shop/button.html');
  const context = prepareContext({ store, cwd: root });
  assert.match(context?.text ?? '', /compiler-reported location/u);
  assert.match(context?.text ?? '', /shop\/button.html/u);
  const restored = createVisualStore();
  restorePending({
    store: restored,
    ctx: {
      cwd: root,
      sessionManager: { getBranch: () => snapshots },
    } as unknown as ExtensionContext,
  });
  assert.deepEqual(restored.bindings, [
    { origin: 'http://localhost:5173', project: 'shop' },
  ]);
  assert.equal(restored.pending[0]?.chosen?.method, SOURCE_METHOD.compiler);
  receiveSelection({
    store: restored,
    pi,
    cwd: root,
    selection: {
      ...selected,
      id: 'other-page',
      page: 'http://localhost:5174/',
    },
  });
  assert.equal(restored.pending[1]?.resolution.candidates.length, 0);
  bindProject({
    store: restored,
    pi,
    cwd: root,
    project: 'admin',
    page: 'http://localhost:5174/',
  });
  assert.equal(restored.pending[1]?.chosen?.path, 'admin/button.html');
  const otherBranch = createVisualStore();
  restorePending({
    store: otherBranch,
    ctx: {
      cwd: root,
      sessionManager: { getBranch: () => [] },
    } as unknown as ExtensionContext,
  });
  assert.deepEqual(otherBranch.bindings, []);
  assert.deepEqual(otherBranch.pending, []);
});
