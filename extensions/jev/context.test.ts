import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { buildContextualState } from './context.ts';
import { buildRequestBody, stateFitsBudget } from './model.ts';

function withProject(run: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), 'sideroom-jev-context-'));
  try {
    run(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function add(root: string, path: string, body: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

test('sends imported files first, then direct consumers, capped at four', () => {
  withProject((root) => {
    const body = [
      "import './a';",
      "import './b';",
      "import './c';",
      'export const main = true;',
    ].join('\n');
    add(root, 'src/main.ts', body);
    for (const name of ['a', 'b', 'c']) {
      add(root, `src/${name}.ts`, `export const ${name} = true;`);
    }
    add(root, 'src/consumer.ts', "import './main';");
    add(root, 'src/consumer2.ts', "import './main';");
    const state = buildContextualState(root, 'src/main.ts', body, 'write', [
      { line: 4, text: 'export const main = true;' },
    ]);
    assert.deepEqual(
      state?.context.files.map((file) => [file.path, file.relation]),
      [
        ['src/a.ts', 'imported'],
        ['src/b.ts', 'imported'],
        ['src/c.ts', 'imported'],
        ['src/consumer.ts', 'consumer'],
      ],
    );
    assert.equal(state?.context.partial, true);
    assert.ok(
      state && buildRequestBody(state).questions['dependency-direction'],
    );
  });
});

test('never sends ignored, sensitive, hidden or symlinked neighbouring files', () => {
  withProject((root) => {
    const body = [
      "import './visible';",
      "import './blocked';",
      "import './secret-key';",
      "import './apiKey';",
      "import './secrets';",
      "import './linked';",
    ].join('\n');
    add(root, 'src/main.ts', body);
    add(root, '.gitignore', 'src/blocked.ts\n');
    add(root, 'src/visible.ts', 'export const visible = true;');
    add(root, 'src/blocked.ts', 'export const blocked = true;');
    add(root, 'src/secret-key.ts', 'export const secret = true;');
    add(root, 'src/apiKey.ts', 'export const apiKey = true;');
    add(root, 'src/secrets.ts', 'export const secrets = true;');
    add(root, '.hidden/more.ts', "import '../src/main';");
    const outside = mkdtempSync(join(tmpdir(), 'sideroom-jev-outside-'));
    try {
      add(outside, 'outside.ts', 'export const outside = true;');
      symlinkSync(join(outside, 'outside.ts'), join(root, 'src/linked.ts'));
      const state = buildContextualState(root, 'src/main.ts', body, 'edit', [
        { line: 1, text: "import './visible';" },
      ]);
      assert.deepEqual(
        state?.context.files.map((file) => file.path),
        ['src/visible.ts'],
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test('does not treat comments or other quoted strings as imports', () => {
  withProject((root) => {
    add(root, 'src/hidden.ts', 'export const hidden = true;');
    add(root, 'src/hidden.go', 'package hidden');
    const examples = [
      {
        path: 'src/main.ts',
        body: "// import './hidden';\nconst text = \"import './hidden';\";",
      },
      {
        path: 'src/main.go',
        body: 'package main\nconst label = "project/src/hidden"',
      },
    ];
    for (const example of examples) {
      const state = buildContextualState(
        root,
        example.path,
        example.body,
        'edit',
        [{ line: 1, text: 'const changed = true;' }],
      );
      assert.deepEqual(state?.context.files, []);
    }
  });
});

test('omits whole neighbours that exceed the byte budget, keeping the changed file', () => {
  withProject((root) => {
    const body = `import './huge';\nexport const changed = '${'y'.repeat(3_000)}';`;
    add(root, 'src/huge.ts', `export const text = '${'x'.repeat(30_000)}';`);
    const state = buildContextualState(root, 'src/main.ts', body, 'edit', [
      { line: 1, text: "import './huge';" },
      { line: 2, text: 'export const changed = true;' },
    ]);
    assert.equal(state?.file.body, body);
    assert.deepEqual(state?.context.files, []);
    assert.equal(state?.context.partial, true);
    assert.ok(state && stateFitsBudget(state));
    assert.equal(
      state && buildRequestBody(state).questions['dependency-direction'],
      undefined,
    );
  });
});

test('resolves direct source imports without guessing unrelated files', () => {
  withProject((root) => {
    const cases = [
      {
        source: 'src/controller.py',
        body: 'from .service import save',
        related: 'src/service.py',
      },
      {
        source: 'src/main.rs',
        body: 'use crate::domain::order;',
        related: 'src/domain/order.rs',
      },
      {
        source: 'src/main/java/com/app/Controller.java',
        body: 'import com.app.Service;',
        related: 'src/main/java/com/app/Service.java',
      },
      {
        source: 'src/main.go',
        body: 'import "example.com/project/internal/service"',
        related: 'src/internal/service/service.go',
      },
    ];
    for (const example of cases) {
      add(root, example.related, 'source code');
      const state = buildContextualState(
        root,
        example.source,
        example.body,
        'edit',
        [{ line: 1, text: example.body }],
      );
      assert.deepEqual(
        state?.context.files.map((file) => file.path),
        [example.related],
      );
    }
  });
});

test('skips review if the complete changed file cannot fit', () => {
  withProject((root) => {
    const body = 'x'.repeat(33_000);
    assert.equal(
      buildContextualState(root, 'src/main.ts', body, 'write', []),
      undefined,
    );
  });
});
