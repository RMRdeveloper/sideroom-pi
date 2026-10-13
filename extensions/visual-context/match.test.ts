import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { matchSource } from './match.ts';
import type { VisualSelection } from './model.ts';
import { resolveSelection } from './source.ts';

const selection: VisualSelection = {
  id: 'save',
  page: 'http://localhost/account',
  element: { tag: 'button', elementId: '', classes: ['account-save'] },
  text: 'Save profile',
  ancestors: [],
};

const dialects = [
  {
    path: 'Page.tsx',
    source: [
      'const example = \'<button class="account-save">Save profile</button>\';',
      '// <button class="account-save">Save profile</button>',
      'export const Page = () => (',
      '  <button className={"account-save"}>Save<span> profile</span></button>',
      ');',
    ].join('\n'),
    line: 4,
  },
  {
    path: 'Page.vue',
    source: [
      '<script setup>const example = \'<button class="account-save">Save profile</button>\';</script>',
      '<template>',
      '  <button :class="\'account-save\'">Save<span> profile</span></button>',
      '</template>',
      '<style>.account-save { color: red }</style>',
    ].join('\n'),
    line: 3,
  },
  {
    path: 'Page.svelte',
    source: [
      '<script>const example = \'<button class="account-save">Save profile</button>\';</script>',
      '{#if ready}',
      '  <button class={"account-save"}>Save<span> profile</span></button>',
      '{/if}',
    ].join('\n'),
    line: 3,
  },
  {
    path: 'Page.astro',
    source: [
      '---',
      'const example = \'<button class="account-save">Save profile</button>\';',
      '---',
      '<p>á漢字</p>',
      '<button class={"account-save"}>Save<span> profile</span></button>',
    ].join('\n'),
    line: 5,
  },
];

for (const fixture of dialects) {
  test(`${fixture.path}: finds only real markup, literal expressions and original lines`, () => {
    const candidates = matchSource({ ...fixture, selection });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.startLine, fixture.line);
    assert.equal(candidates[0]?.endLine, fixture.line);
    assert.deepEqual(candidates[0]?.reasons, [
      'class account-save',
      'static text',
    ]);
  });
}

for (const fixture of [
  { path: 'Page.html', source: '<button>Save &amp; profile</button>' },
  {
    path: 'Page.tsx',
    source: 'export const Page = () => <button>Save &amp; profile</button>;',
  },
  {
    path: 'Page.vue',
    source: '<template><button>Save &amp; profile</button></template>',
  },
  { path: 'Page.svelte', source: '<button>Save &amp; profile</button>' },
  { path: 'Page.astro', source: '<button>Save &amp; profile</button>' },
]) {
  test(`${fixture.path}: decodes HTML entities like the rendered DOM`, () => {
    const candidates = matchSource({
      ...fixture,
      selection: {
        ...selection,
        text: 'Save & profile',
        element: { ...selection.element, classes: [] },
      },
    });
    assert.equal(candidates.length, 1);
    assert.deepEqual(candidates[0]?.reasons, ['static text']);
  });
}

for (const fixture of [
  {
    path: 'Page.tsx',
    source:
      'export const Page = () => <Button className="account-save">Save profile</Button>;',
  },
  {
    path: 'Page.vue',
    source:
      '<template><Button class="account-save">Save profile</Button></template>',
  },
  {
    path: 'Page.svelte',
    source: '<Button class="account-save">Save profile</Button>',
  },
  {
    path: 'Page.astro',
    source: '<Button class="account-save">Save profile</Button>',
  },
]) {
  test(`${fixture.path}: does not claim a component wrapper is a DOM button`, () => {
    assert.deepEqual(matchSource({ ...fixture, selection }), []);
  });
}

for (const fixture of [
  {
    path: 'Page.tsx',
    source:
      'export const Page = () => <button className={readSecret()}>Other</button>;',
  },
  {
    path: 'Page.vue',
    source: '<template><button :class="readSecret()">Other</button></template>',
  },
  {
    path: 'Page.svelte',
    source: '<button class={readSecret()}>Other</button>',
  },
  { path: 'Page.astro', source: '<button class={readSecret()}>Other</button>' },
]) {
  test(`${fixture.path}: does not evaluate expressions to obtain evidence`, () => {
    assert.deepEqual(matchSource({ ...fixture, selection }), []);
  });
}

test('Astro locates multiline self-closing tags after Unicode and quoted greater-than signs', () => {
  const candidates = matchSource({
    path: 'Page.astro',
    source: '<p>á漢字</p>\n<button\n title="1 > 0"\n class="account-save"\n/>',
    selection,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.startLine, 2);
  assert.equal(candidates[0]?.endLine, 5);
});

test('Astro preserves a verified full multiline closing range', () => {
  const candidates = matchSource({
    path: 'Page.astro',
    source:
      '<p>á漢字</p>\n<button class="account-save">\n Save profile\n</button>',
    selection,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.startLine, 2);
  assert.equal(candidates[0]?.endLine, 4);
});

for (const [attribute, capturedText] of [
  ['hidden={true}', 'Save profile'],
  ['hidden={false}', 'SaveSecret profile'],
  ['contentEditable={false}', 'Save profile'],
]) {
  test(`JSX captures text consistently for ${attribute}`, () => {
    const candidates = matchSource({
      path: 'Page.tsx',
      source: `export const Page = () => <button>Save<span ${attribute}>Secret</span> profile</button>;`,
      selection: {
        ...selection,
        text: capturedText ?? '',
        element: { ...selection.element, classes: [] },
      },
    });
    assert.equal(candidates.length, 1);
  });
}

test('unknown visibility cannot contribute supposedly static text', () => {
  assert.deepEqual(
    matchSource({
      path: 'Page.tsx',
      source:
        'export const Page = () => <button>Save<span hidden={privateMode}>Secret</span> profile</button>;',
      selection: {
        ...selection,
        text: 'SaveSecret profile',
        element: { ...selection.element, classes: [] },
      },
    }),
    [],
  );
});

test('JSX spread attributes cannot prove a previous static id or class', () => {
  assert.deepEqual(
    matchSource({
      path: 'Page.tsx',
      source:
        'export const Page = () => <button className="account-save" {...props}>Other</button>;',
      selection,
    }),
    [],
  );
});

for (const fixture of [
  {
    path: 'Page.tsx',
    source:
      'export const Page = () => <button {...props}>Save profile</button>;',
  },
  {
    path: 'Page.vue',
    source: '<template><button v-bind="props">Save profile</button></template>',
  },
  { path: 'Page.svelte', source: '<button {...props}>Save profile</button>' },
  { path: 'Page.astro', source: '<button {...props}>Save profile</button>' },
]) {
  test(`${fixture.path}: spreads make text visibility unknown`, () => {
    assert.deepEqual(
      matchSource({
        ...fixture,
        selection: {
          ...selection,
          element: { ...selection.element, classes: [] },
        },
      }),
      [],
    );
  });
}

test('Vue ignores custom SFC blocks instead of confusing documentation with its template', () => {
  const candidates = matchSource({
    path: 'Page.vue',
    source:
      '<docs><button class="account-save">Save profile</button></docs>\n<template><button class="account-save">Save profile</button></template>',
    selection,
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.startLine, 2);
});

test('Vue conditional children do not prove the full parent text', () => {
  assert.deepEqual(
    matchSource({
      path: 'Page.vue',
      source:
        '<template><div><span v-if="ready">Save</span> profile</div></template>',
      selection: {
        ...selection,
        element: { tag: 'div', elementId: '', classes: [] },
      },
    }),
    [],
  );
});

test('Vue reports unsupported or external templates as incomplete', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-vue-template-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const source of [
    '<template lang="pug">button.account-save Save profile</template>',
    '<template src="./other.html" />',
  ]) {
    writeFileSync(join(root, 'Page.vue'), source);
    const resolution = resolveSelection(root, selection);
    assert.deepEqual(resolution.candidates, []);
    assert.equal(resolution.truncated, true);
  }
});

test('class overlap is bounded so many common classes cannot outweigh a matching id', () => {
  const classes = Array.from(
    { length: 20 },
    (_, index) => `utility-${String(index)}`,
  );
  const candidates = matchSource({
    path: 'Page.html',
    source: `<button class="${classes.join(' ')}">Other</button>\n<button id="save">Other</button>`,
    selection: {
      ...selection,
      element: { ...selection.element, elementId: 'save', classes },
    },
  });
  assert.equal(candidates.length, 2);
  assert.ok((candidates[1]?.score ?? 0) > (candidates[0]?.score ?? 0));
});

test('JSX keeps sibling ranges, fragments and conditional element candidates', () => {
  const source = [
    'export const Page = () => <>',
    '  <input />',
    '  {ready && <button className="account-save">Save profile</button>}',
    '  <button className="account-save">',
    '    Save profile',
    '  </button>',
    '</>;',
  ].join('\n');
  const candidates = matchSource({ path: 'Page.jsx', source, selection });
  assert.deepEqual(
    candidates.map(({ startLine, endLine }) => [startLine, endLine]),
    [
      [3, 3],
      [4, 6],
    ],
  );
});

test('text concatenation matches the companion without inventing spaces or erasing expressions', () => {
  const textSelection = {
    ...selection,
    element: { ...selection.element, classes: [] },
    text: 'Saveprofile',
  };
  assert.equal(
    matchSource({
      path: 'Page.html',
      source: '<button>Save<span>profile</span></button>',
      selection: textSelection,
    }).length,
    1,
  );
  assert.deepEqual(
    matchSource({
      path: 'Page.vue',
      source: '<template><button>Save{{user}}profile</button></template>',
      selection: textSelection,
    }),
    [],
  );
  assert.deepEqual(
    matchSource({
      path: 'Page.tsx',
      source: 'export const Page = () => <button>Save{user}profile</button>;',
      selection: textSelection,
    }),
    [],
  );
});

test('excludes form and hidden text just as the browser capture does', () => {
  const source =
    '<button>Save<input value="private" /><span hidden>Secret</span><span contenteditable>Private</span> profile</button>';
  assert.equal(
    matchSource({
      path: 'Page.html',
      source,
      selection: {
        ...selection,
        element: { ...selection.element, classes: [] },
      },
    }).length,
    1,
  );
});

test('deduplicates class evidence and rejects conflicting static ids', () => {
  const source =
    '<button id="other" class="account-save">Save profile</button>';
  const single = matchSource({ path: 'Page.html', source, selection });
  const duplicated = matchSource({
    path: 'Page.html',
    source,
    selection: {
      ...selection,
      element: {
        ...selection.element,
        classes: ['account-save', 'account-save'],
      },
    },
  });
  assert.deepEqual(duplicated, single);
  assert.deepEqual(
    matchSource({
      path: 'Page.html',
      source,
      selection: {
        ...selection,
        element: { ...selection.element, elementId: 'save' },
      },
    }),
    [],
  );
});

test('ordered ancestor evidence separates identical buttons and explains its score', () => {
  const source = [
    '<main id="account"><section class="actions"><button class="account-save">Save profile</button></section></main>',
    '<section class="actions"><main id="account"><button class="account-save">Save profile</button></main></section>',
  ].join('\n');
  const candidates = matchSource({
    path: 'Page.html',
    source,
    selection: {
      ...selection,
      ancestors: [
        { tag: 'section', elementId: '', classes: ['actions'] },
        { tag: 'main', elementId: 'account', classes: [] },
      ],
    },
  });
  assert.equal(candidates.length, 2);
  assert.ok((candidates[0]?.score ?? 0) > (candidates[1]?.score ?? 0));
  assert.ok(
    candidates[0]?.reasons.some((reason) => reason.includes('ancestor')),
  );
});

test('does not award exact text evidence to the 160-character capture prefix', () => {
  const text = 'a'.repeat(160);
  const candidates = matchSource({
    path: 'Page.html',
    source: `<button class="account-save">${text} extra</button>`,
    selection: { ...selection, text },
  });
  assert.equal(candidates.length, 1);
  assert.ok(candidates[0]?.reasons.includes('text prefix (capture limit)'));
  assert.ok(!candidates[0]?.reasons.includes('static text'));
});

test('unparseable files leave other results available and mark the search incomplete', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-visual-parsers-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, 'Valid.html'),
    '<button class="account-save">Save profile</button>',
  );
  for (const [path, source] of [
    ['Broken.tsx', 'export const Page = () => <button'],
    ['Broken.vue', '<template><button></template>'],
    ['Broken.svelte', '{#if ready}<button>'],
    ['Broken.astro', '<button class="account-save">Unclosed'],
  ]) {
    assert.ok(path && source);
    writeFileSync(join(root, path), source);
  }
  const resolution = resolveSelection(root, selection);
  assert.equal(resolution.truncated, true);
  assert.deepEqual(
    resolution.candidates.map(({ path }) => path),
    ['Valid.html'],
  );
});
