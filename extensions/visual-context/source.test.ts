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
import { matchSource } from './match.ts';
import {
  parseSelection,
  selectionContext,
  type VisualSelection,
} from './model.ts';
import { candidateIsCurrent, resolveSelection } from './source.ts';

const selection: VisualSelection = {
  id: 'save-1',
  page: 'http://localhost:7501/account',
  element: { tag: 'button', elementId: '', classes: ['account-save'] },
  text: 'Save profile',
  ancestors: [],
};

test('parses bounded DOM data, strips private URL parts and rejects source claims', () => {
  const parsed = parseSelection({
    ...selection,
    page: 'https://user:password@localhost/account?token=secret#private',
  });
  assert.equal(parsed.page, 'https://localhost/account');
  assert.throws(() =>
    parseSelection({ ...selection, filePath: '/etc/passwd', startLine: 1 }),
  );
  assert.throws(() =>
    parseSelection({
      ...selection,
      element: { ...selection.element, classes: ['bad\u001b[31m'] },
    }),
  );
  assert.throws(() =>
    parseSelection({
      ...selection,
      ancestors: Array(5).fill(selection.element),
    }),
  );
  assert.throws(() =>
    parseSelection({ ...selection, page: 'file:///etc/passwd' }),
  );
});

test('finds original multiline template ranges without scanning script or style text', () => {
  const source = [
    '<script>const example = "<button class=account-save>Save profile</button>";</script>',
    '<template>',
    '  <button',
    '    class="account-save"',
    '  >Save profile</button>',
    '</template>',
    '<style>.account-save { color: red }</style>',
  ].join('\n');
  const candidates = matchSource({ path: 'Account.vue', source, selection });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.startLine, 3);
  assert.equal(candidates[0]?.endLine, 5);
  assert.deepEqual(candidates[0]?.reasons, [
    'class account-save',
    'static text',
  ]);
});

test('does not infer a source from the tag alone and preserves ambiguous candidates', () => {
  assert.deepEqual(
    matchSource({
      path: 'page.html',
      source: '<button>Other</button>',
      selection,
    }),
    [],
  );
  const candidates = matchSource({
    path: 'page.html',
    source:
      '<button class="account-save">Save profile</button>\n<button class="account-save">Save profile</button>',
    selection,
  });
  assert.equal(candidates.length, 2);
  const context = selectionContext([
    { selection, resolution: { candidates, truncated: false, capped: false } },
  ]);
  assert.match(context, /"origin": "unresolved"/u);
  assert.match(context, /not proven DOM-to-source mappings/u);
  assert.doesNotMatch(context, /"source":/u);
});

test('search respects nested ignores, secrets and symlinks and invalidates changed source', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-source-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src'));
  const markup = '<button class="account-save">Save profile</button>';
  writeFileSync(join(root, 'src/Account.vue'), markup);
  writeFileSync(join(root, 'src/.gitignore'), 'ignored.vue\n');
  writeFileSync(join(root, 'src/ignored.vue'), markup);
  writeFileSync(join(root, 'src/private-key.html'), markup);
  writeFileSync(join(root, 'src/.hidden.html'), markup);
  symlinkSync(join(root, 'src/Account.vue'), join(root, 'src/link.html'));
  const resolution = resolveSelection(root, selection);
  assert.equal(resolution.candidates.length, 1);
  const candidate = resolution.candidates[0];
  assert.ok(candidate);
  assert.equal(candidate.path, 'src/Account.vue');
  assert.equal(candidateIsCurrent(root, candidate), true);
  assert.equal(
    candidateIsCurrent(root, { ...candidate, path: '../outside.html' }),
    false,
  );
  writeFileSync(join(root, 'src/Account.vue'), `${markup}\n<!-- changed -->`);
  assert.equal(candidateIsCurrent(root, candidate), false);
});

test('nested directory patterns and anchored root ignores exclude source candidates', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-ignore-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'src/generated'), { recursive: true });
  mkdirSync(join(root, 'src/deep'), { recursive: true });
  const markup = '<button class="account-save">Save profile</button>';
  writeFileSync(join(root, '.gitignore'), '/root.html\n');
  writeFileSync(join(root, 'root.html'), markup);
  writeFileSync(join(root, 'src/.gitignore'), 'generated/\nignored.html\n');
  writeFileSync(join(root, 'src/generated/button.html'), markup);
  writeFileSync(join(root, 'src/deep/ignored.html'), markup);
  writeFileSync(join(root, 'src/deep/keep.html'), markup);
  assert.deepEqual(
    resolveSelection(root, selection).candidates.map(
      (candidate) => candidate.path,
    ),
    ['src/deep/keep.html'],
  );
});

test('separates a capped candidate list from a search cut short by a limit', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-flags-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const markup = '<button class="account-save">Save profile</button>';
  const repeated = Array.from(
    { length: 10 },
    (_unused, index) => `${markup}\n<!-- ${String(index)} -->`,
  ).join('\n');
  writeFileSync(join(root, 'many.html'), repeated);
  const capped = resolveSelection(root, selection);
  assert.equal(capped.candidates.length, 8);
  assert.equal(capped.capped, true);
  assert.equal(capped.truncated, false);

  rmSync(join(root, 'many.html'));
  let deep = root;
  for (let level = 0; level < 18; level += 1) {
    deep = join(deep, `level-${String(level)}`);
    mkdirSync(deep);
  }
  writeFileSync(join(deep, 'deep.html'), markup);
  assert.equal(resolveSelection(root, selection).truncated, true);
});
