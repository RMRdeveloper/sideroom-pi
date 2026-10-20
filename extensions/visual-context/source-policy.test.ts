import assert from 'node:assert/strict';
import fs, {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { allowedPath, createPathPolicy } from './files.ts';
import { matchSource } from './match.ts';
import {
  MAX_CANDIDATES,
  MAX_SELECTIONS,
  type VisualSelection,
} from './model.ts';
import {
  commitPending,
  createVisualStore,
  prepareContext,
  receiveSelection,
  restorePending,
} from './session.ts';
import {
  candidateIsCurrent,
  currentCandidates,
  resolveProjectSelection,
  resolveSelection,
} from './source.ts';

const selection: VisualSelection = {
  id: 'save-1',
  page: 'http://localhost/account',
  element: { tag: 'button', elementId: '', classes: ['account-save'] },
  text: 'Save profile',
  ancestors: [],
};
const markup = '<button class="account-save">Save profile</button>';

function fixture(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function observeReads(t: TestContext) {
  const read = t.mock.method(fs, 'readFileSync');
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  return read.mock;
}

function assertUniqueIgnoreReads(paths: readonly string[]): void {
  const ignores = paths.filter((path) =>
    /\.(?:gitignore|ignore|fdignore)$/u.test(path),
  );
  assert.ok(ignores.length > 0);
  assert.equal(new Set(ignores).size, ignores.length);
}

test('nested directory patterns and negation apply at every depth, while anchored patterns stay local', (t) => {
  const root = fixture(t);
  for (const path of ['app/cache', 'app/src/cache', 'app/shared/src/cache']) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, 'save.html'), markup);
  }
  writeFileSync(join(root, 'app/.gitignore'), 'cache/\n');
  for (const path of [
    'app/cache/save.html',
    'app/src/cache/save.html',
    'app/shared/src/cache/save.html',
  ]) {
    assert.equal(allowedPath(root, path), undefined);
  }
  assert.equal(resolveSelection(root, selection).candidates.length, 0);
  writeFileSync(join(root, 'app/.ignore'), '!cache/\n');
  assert.equal(resolveSelection(root, selection).candidates.length, 3);
  writeFileSync(join(root, 'app/.fdignore'), '/cache/\n');
  assert.equal(allowedPath(root, 'app/cache/save.html'), undefined);
  assert.ok(allowedPath(root, 'app/src/cache/save.html'));
  writeFileSync(join(root, 'app/.fdignore'), 'src/cache/\n');
  assert.equal(allowedPath(root, 'app/src/cache/save.html'), undefined);
  assert.ok(allowedPath(root, 'app/shared/src/cache/save.html'));
});

test('one path policy shares ignore reads but rechecks symlinks and exclusions', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, '.gitignore'), '/root.html\n');
  writeFileSync(join(root, 'src/.gitignore'), 'ignored.html\n');
  writeFileSync(join(root, 'src/.ignore'), '!ignored.html\n');
  writeFileSync(join(root, 'src/.fdignore'), 'blocked.html\n');
  for (const name of [
    'keep.html',
    'ignored.html',
    'blocked.html',
    '.hidden.html',
    'private-key.html',
  ]) {
    writeFileSync(join(root, 'src', name), markup);
  }
  writeFileSync(join(root, 'root.html'), markup);
  const reads = observeReads(t);
  const policy = createPathPolicy(root);
  assert.equal(
    policy.allowedPath('src/keep.html'),
    join(root, 'src/keep.html'),
  );
  assert.equal(
    policy.allowedPath('src/ignored.html'),
    join(root, 'src/ignored.html'),
  );
  for (const path of [
    'root.html',
    'src/blocked.html',
    'src/.hidden.html',
    'src/private-key.html',
    '../outside.html',
  ]) {
    assert.equal(policy.allowedPath(path), undefined);
  }
  assertUniqueIgnoreReads(reads.calls.map((call) => String(call.arguments[0])));
  rmSync(join(root, 'src/keep.html'));
  symlinkSync(join(root, 'src/ignored.html'), join(root, 'src/keep.html'));
  assert.equal(policy.allowedPath('src/keep.html'), undefined);
  assert.equal(allowedPath(root, 'src/keep.html'), undefined);
});

test('project search reads each ancestor ignore file once and refreshes on the next search', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'site/src'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'site/src/blocked.html\n');
  writeFileSync(join(root, 'site/src/.gitignore'), '/local.html\n');
  for (const name of ['keep.html', 'blocked.html', 'local.html']) {
    writeFileSync(join(root, 'site/src', name), markup);
  }
  const reads = observeReads(t);
  const first = resolveProjectSelection({
    cwd: root,
    project: 'site',
    selection,
  });
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.path),
    ['site/src/keep.html'],
  );
  assertUniqueIgnoreReads(reads.calls.map((call) => String(call.arguments[0])));
  writeFileSync(join(root, 'site/src/.gitignore'), '/keep.html\n');
  const second = resolveProjectSelection({
    cwd: root,
    project: 'site',
    selection,
  });
  assert.deepEqual(
    second.candidates.map((candidate) => candidate.path),
    ['site/src/local.html'],
  );
});

test('bounded ranking agrees with a full sort including ties and better late matches', (t) => {
  const root = fixture(t);
  const sources = [
    {
      path: 'a.html',
      source: Array.from({ length: 16 }, () => markup).join('\n'),
    },
    {
      path: 'z.html',
      source: '<button class="account-save extra">Save profile</button>',
    },
  ];
  const rankedSelection = {
    ...selection,
    element: { ...selection.element, classes: ['account-save', 'extra'] },
  };
  const expected = sources
    .flatMap(({ path, source }) => {
      writeFileSync(join(root, path), source);
      return matchSource({ path, source, selection: rankedSelection });
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.path.localeCompare(right.path) ||
        left.startLine - right.startLine,
    );
  const resolution = resolveSelection(root, rankedSelection);
  assert.deepEqual(resolution.candidates, expected.slice(0, MAX_CANDIDATES));
  assert.equal(resolution.candidates[0]?.path, 'z.html');
  assert.equal(resolution.capped, true);
  assert.equal(resolution.truncated, false);
  writeFileSync(
    join(root, 'a.html'),
    Array.from({ length: MAX_CANDIDATES - 1 }, () => markup).join('\n'),
  );
  assert.equal(resolveSelection(root, rankedSelection).capped, false);
});

test('batch validation reads each distinct file once and preserves identity, order and ranges', (t) => {
  const root = fixture(t);
  const source = `${markup}\n${markup}`;
  writeFileSync(join(root, 'a.html'), source);
  writeFileSync(join(root, 'b.html'), markup);
  const candidates = matchSource({ path: 'a.html', source, selection });
  const first = candidates[0];
  const second = candidates[1];
  const other = matchSource({ path: 'b.html', source: markup, selection })[0];
  assert.ok(first && second && other);
  const alias = { ...first, path: './a.html' };
  const reads = observeReads(t);
  const current = currentCandidates(root, [
    second,
    { ...first, fingerprint: 'obsolete' },
    { ...first, endLine: 3 },
    other,
    first,
    alias,
  ]);
  assert.deepEqual(current, [second, other, first, alias]);
  assert.equal(current[0], second);
  assert.equal(current[2], first);
  for (const path of ['a.html', 'b.html']) {
    assert.equal(
      reads.calls.filter((call) => call.arguments[0] === join(root, path))
        .length,
      1,
    );
  }
  assertUniqueIgnoreReads(reads.calls.map((call) => String(call.arguments[0])));
});

test('batch validation does not reuse versions or exclusions across operations', (t) => {
  const root = fixture(t);
  const file = join(root, 'a.html');
  writeFileSync(file, markup);
  const candidate = matchSource({
    path: 'a.html',
    source: markup,
    selection,
  })[0];
  assert.ok(candidate);
  assert.deepEqual(currentCandidates(root, [candidate]), [candidate]);
  writeFileSync(file, `${markup}\n<!-- changed -->`);
  assert.deepEqual(currentCandidates(root, [candidate]), []);
  writeFileSync(file, markup);
  writeFileSync(join(root, '.gitignore'), 'a.html\n');
  assert.deepEqual(currentCandidates(root, [candidate]), []);
  rmSync(join(root, '.gitignore'));
  rmSync(file);
  assert.deepEqual(currentCandidates(root, [candidate]), []);
  symlinkSync(join(root, 'missing.html'), file);
  assert.deepEqual(currentCandidates(root, [candidate]), []);
  rmSync(root, { recursive: true });
  assert.equal(candidateIsCurrent(root, candidate), false);
  assert.deepEqual(currentCandidates(root, []), []);
});

test('session restoration and attachment each read one file for forty candidate references', (t) => {
  const root = fixture(t);
  const file = join(root, 'a.html');
  writeFileSync(
    file,
    Array.from({ length: MAX_CANDIDATES }, () => markup).join('\n'),
  );
  const snapshots: { type: 'custom'; customType: string; data: unknown }[] = [];
  const pi = {
    appendEntry: (customType: string, data?: unknown) => {
      snapshots.push({ type: 'custom', customType, data });
    },
  };
  const store = createVisualStore();
  for (let index = 0; index < MAX_SELECTIONS; index += 1) {
    receiveSelection({
      store,
      pi,
      cwd: root,
      selection: { ...selection, id: `save-${String(index)}` },
    });
  }
  commitPending({
    store,
    pi,
    pending: store.pending.map((entry) => ({
      ...entry,
      chosen: entry.resolution.candidates[0],
    })),
  });
  const ctx = {
    cwd: root,
    sessionManager: { getBranch: () => snapshots },
  } as Pick<ExtensionContext, 'cwd' | 'sessionManager'>;
  const restored = createVisualStore();
  const reads = observeReads(t);
  restorePending({ store: restored, ctx });
  assert.equal(
    reads.calls.filter((call) => call.arguments[0] === file).length,
    1,
  );
  assert.equal(
    restored.pending.flatMap((entry) => entry.resolution.candidates).length,
    MAX_SELECTIONS * MAX_CANDIDATES,
  );
  for (const entry of restored.pending) {
    assert.equal(entry.chosen, entry.resolution.candidates[0]);
  }
  const context = prepareContext({ store: restored, cwd: root });
  assert.equal(
    reads.calls.filter((call) => call.arguments[0] === file).length,
    2,
  );
  assert.match(context?.text ?? '', /user-selected candidate/u);
  assert.equal(context?.selectionIds.length, MAX_SELECTIONS);
  writeFileSync(file, '<button>Changed</button>');
  assert.doesNotMatch(
    prepareContext({ store: restored, cwd: root })?.text ?? '',
    /a\.html:1-1/u,
  );
  restorePending({ store: restored, ctx });
  assert.ok(
    restored.pending.every((entry) => entry.resolution.candidates.length === 0),
  );
});

test('batch validation propagates unreadable ignore files with candidate context', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'a.html'), markup);
  const candidate = matchSource({
    path: 'a.html',
    source: markup,
    selection,
  })[0];
  assert.ok(candidate);
  mkdirSync(join(root, '.gitignore'));
  assert.throws(
    () => currentCandidates(root, [candidate]),
    /Cannot verify selected source a\.html/u,
  );
});
