import assert from 'node:assert/strict';
import test from 'node:test';

import { detectLanguagePolicies, INFERRED_SCOPE } from './language-policy.ts';

test('detects deterministic per-file policies from project-relative request paths', () => {
  assert.deepEqual(
    detectLanguagePolicies(
      'Update src/app.tsx, src/client.jsx, api/worker.py, README.md, and vite.config.js.',
      {
        cwd: '/work/project',
        exists: (file: string) => file === '/work/project/package.json',
      },
    ),
    {
      kind: 'detected',
      policies: [
        { file: 'README.md', policy: 'shared' },
        { file: 'api/worker.py', policy: 'python' },
        { file: 'src/app.tsx', policy: 'typescript' },
        { file: 'src/client.jsx', policy: 'javascript' },
        { file: 'vite.config.js', policy: 'shared' },
      ],
    },
  );
});

test('accepts Markdown-formatted project paths and ignores URLs', () => {
  assert.deepEqual(
    detectLanguagePolicies(
      'Update `src/pi-command.ts` and [guide](docs/guide.md). See https://example.com/guide.ts:',
      {
        cwd: '/work/project',
        exists: () => false,
      },
    ),
    {
      kind: 'detected',
      policies: [
        { file: 'docs/guide.md', policy: 'shared' },
        { file: 'src/pi-command.ts', policy: 'typescript' },
      ],
    },
  );
});

test('requires clarification for ambiguous PHP and external paths', () => {
  assert.match(
    clarificationReason(
      detectLanguagePolicies(
        'Update app/Http/Controllers/HomeController.php.',
        {
          cwd: '/work/project',
          exists: () => false,
        },
      ),
    ),
    /Laravel or Composer evidence/,
  );
  assert.match(
    clarificationReason(
      detectLanguagePolicies('Update /outside/project/app.ts.', {
        cwd: '/work/project',
        exists: () => false,
      }),
    ),
    /inside the current project/,
  );
});

function clarificationReason(
  result: ReturnType<typeof detectLanguagePolicies>,
): string {
  assert.equal(result.kind, 'clarification');
  return result.reason;
}

test('detects Go and Rust sources with their language policies', () => {
  assert.deepEqual(
    detectLanguagePolicies('Update cmd/server.go and src/lib.rs.', {
      cwd: '/work/project',
      exists: () => false,
    }),
    {
      kind: 'detected',
      policies: [
        { file: 'cmd/server.go', policy: 'go' },
        { file: 'src/lib.rs', policy: 'rust' },
      ],
    },
  );
});

test('detects documentation and configuration-only requests as shared policy targets', () => {
  assert.deepEqual(
    detectLanguagePolicies('Update README.md and eslint.config.js.', {
      cwd: '/work/project',
      exists: () => false,
    }),
    {
      kind: 'detected',
      policies: [
        { file: 'README.md', policy: 'shared' },
        { file: 'eslint.config.js', policy: 'shared' },
      ],
    },
  );
});

test('maps PHP to Laravel only when bounded Composer evidence exists', () => {
  assert.deepEqual(
    detectLanguagePolicies('Update app/Http/Controllers/HomeController.php.', {
      cwd: '/work/project',
      exists: (file: string) => file === '/work/project/composer.json',
    }),
    {
      kind: 'detected',
      policies: [
        {
          file: 'app/Http/Controllers/HomeController.php',
          policy: 'php-laravel',
        },
      ],
    },
  );
});

test('infers one policy per repository evidence marker in fixed order', () => {
  const cases: Array<{ readonly marker: string; readonly policy: string }> = [
    { marker: 'composer.json', policy: 'php-laravel' },
    { marker: 'go.mod', policy: 'go' },
    { marker: 'Cargo.toml', policy: 'rust' },
    { marker: 'pyproject.toml', policy: 'python' },
    { marker: 'setup.py', policy: 'python' },
    { marker: 'setup.cfg', policy: 'python' },
    { marker: 'requirements.txt', policy: 'python' },
    { marker: 'pom.xml', policy: 'java' },
    { marker: 'build.gradle', policy: 'java' },
    { marker: 'build.gradle.kts', policy: 'java' },
  ];
  for (const { marker, policy } of cases) {
    const detection = detectLanguagePolicies('Add a health endpoint.', {
      cwd: '/work/project',
      exists: (file: string) => file === `/work/project/${marker}`,
    });
    assert.equal(detection.kind, 'inferred');
    if (detection.kind === 'inferred') {
      assert.deepEqual(detection.policies, [{ file: INFERRED_SCOPE, policy }]);
      assert.match(detection.note, /repository evidence/);
    }
  }
});

test('infers typescript only when package.json has a tsconfig sibling', () => {
  const withTsconfig = detectLanguagePolicies('Add a health endpoint.', {
    cwd: '/work/project',
    exists: (file: string) =>
      file === '/work/project/package.json' ||
      file === '/work/project/tsconfig.json',
  });
  assert.equal(withTsconfig.kind, 'inferred');
  if (withTsconfig.kind === 'inferred') {
    assert.deepEqual(withTsconfig.policies, [
      { file: INFERRED_SCOPE, policy: 'typescript' },
    ]);
  }

  const withoutTsconfig = detectLanguagePolicies('Add a health endpoint.', {
    cwd: '/work/project',
    exists: (file: string) => file === '/work/project/package.json',
  });
  assert.equal(withoutTsconfig.kind, 'inferred');
  if (withoutTsconfig.kind === 'inferred') {
    assert.deepEqual(withoutTsconfig.policies, [
      { file: INFERRED_SCOPE, policy: 'javascript' },
    ]);
  }
});

test('accumulates every language with evidence in fixed order', () => {
  const detection = detectLanguagePolicies('Add a health endpoint.', {
    cwd: '/work/project',
    exists: () => true,
  });
  assert.equal(detection.kind, 'inferred');
  if (detection.kind === 'inferred') {
    assert.deepEqual(detection.policies, [
      { file: INFERRED_SCOPE, policy: 'php-laravel' },
      { file: INFERRED_SCOPE, policy: 'go' },
      { file: INFERRED_SCOPE, policy: 'rust' },
      { file: INFERRED_SCOPE, policy: 'typescript' },
      { file: INFERRED_SCOPE, policy: 'python' },
      { file: INFERRED_SCOPE, policy: 'java' },
    ]);
  }
});

test('falls back to the shared policy when a pathless request has no repository evidence', () => {
  const detection = detectLanguagePolicies('Add a health endpoint.', {
    cwd: '/work/project',
    exists: () => false,
  });
  assert.equal(detection.kind, 'inferred');
  if (detection.kind === 'inferred') {
    assert.deepEqual(detection.policies, [
      { file: INFERRED_SCOPE, policy: 'shared' },
    ]);
    assert.match(detection.note, /shared engineering policy/);
  }
});

test('finds repository evidence from a subdirectory', () => {
  const detection = detectLanguagePolicies('Add a health endpoint.', {
    cwd: '/work/project/packages/app',
    exists: (file: string) =>
      file === '/work/project/package.json' ||
      file === '/work/project/tsconfig.json',
  });
  assert.equal(detection.kind, 'inferred');
  if (detection.kind === 'inferred') {
    assert.deepEqual(detection.policies, [
      { file: INFERRED_SCOPE, policy: 'typescript' },
    ]);
  }
});

test('keeps explicit path detection when repository evidence exists', () => {
  assert.deepEqual(
    detectLanguagePolicies('Update src/api.ts.', {
      cwd: '/work/project',
      exists: () => true,
    }),
    {
      kind: 'detected',
      policies: [{ file: 'src/api.ts', policy: 'typescript' }],
    },
  );
});

test('keeps clarification for external paths and PHP without composer', () => {
  assert.match(
    clarificationReason(
      detectLanguagePolicies('Update /outside/project/app.ts.', {
        cwd: '/work/project',
        exists: () => true,
      }),
    ),
    /inside the current project/,
  );
  assert.match(
    clarificationReason(
      detectLanguagePolicies(
        'Update app/Http/Controllers/HomeController.php.',
        {
          cwd: '/work/project',
          exists: (file: string) => file === '/work/project/go.mod',
        },
      ),
    ),
    /Laravel or Composer evidence/,
  );
});
