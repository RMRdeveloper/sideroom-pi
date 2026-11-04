import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  type CheckCommand,
  commandMatches,
  detectCheckCommand,
  hasTestSetup,
} from './detect.ts';

const NPM_CHECK: CheckCommand = {
  executable: 'npm',
  args: ['run', 'check'],
  display: 'npm run check',
};

function withDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'sideroom-done-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('detects npm check script from package.json', () => {
  withDir((dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { check: 'eslint .' } }),
    );
    assert.equal(detectCheckCommand(dir)?.display, 'npm run check');
  });
});

test('detects the package manager from lockfiles', () => {
  withDir((dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'node --test' } }),
    );
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    assert.equal(detectCheckCommand(dir)?.display, 'pnpm run test');
  });
});

test('prefers check over test in the script priority', () => {
  withDir((dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'a', check: 'b' } }),
    );
    assert.equal(detectCheckCommand(dir)?.display, 'npm run check');
  });
});

test('detects pytest, go, cargo, and make check', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    assert.equal(detectCheckCommand(dir)?.display, 'pytest -q');
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'go.mod'), 'module x');
    assert.equal(detectCheckCommand(dir)?.display, 'go test ./...');
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'Cargo.toml'), '');
    assert.equal(detectCheckCommand(dir)?.display, 'cargo test');
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'Makefile'), 'check:\n\tnpm test\n');
    assert.equal(detectCheckCommand(dir)?.display, 'make check');
  });
});

test('returns undefined when nothing is detectable', () => {
  withDir((dir) => {
    assert.equal(detectCheckCommand(dir), undefined);
  });
});

test('detects a test setup separately from the check command', () => {
  withDir((dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { check: 'x' } }),
    );
    assert.equal(hasTestSetup(dir), false);
  });
  withDir((dir) => {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { test: 'x' } }),
    );
    assert.equal(hasTestSetup(dir), true);
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'pyproject.toml'), '');
    assert.equal(hasTestSetup(dir), true);
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'Cargo.toml'), '');
    assert.equal(hasTestSetup(dir), true);
  });
  withDir((dir) => {
    writeFileSync(join(dir, 'Makefile'), 'check:\n\tnpm test\n');
    assert.equal(hasTestSetup(dir), false);
  });
});

test('confirms only the exact detected command', () => {
  assert.equal(commandMatches('npm run check', NPM_CHECK), true);
  assert.equal(commandMatches('  npm   run check  ', NPM_CHECK), true);
  assert.equal(commandMatches('npm\trun\tcheck', NPM_CHECK), true);
  assert.equal(commandMatches('npm run check\n', NPM_CHECK), true);
  assert.equal(commandMatches('npm run check --silent', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check && npm test', NPM_CHECK), false);
  assert.equal(
    commandMatches('cd packages/api && npm run check', NPM_CHECK),
    false,
  );
  assert.equal(commandMatches('npm run check:ci', NPM_CHECK), false);
  assert.equal(commandMatches('npm run checklint', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check; echo done', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check | tee check.log', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check || true', NPM_CHECK), false);
  assert.equal(commandMatches('echo "npm run check"', NPM_CHECK), false);
  assert.equal(commandMatches('CI=1 npm run check', NPM_CHECK), false);
});

test('does not confirm a quoted copy or a chain that only contains the command', () => {
  assert.equal(
    commandMatches('echo "a || b" && npm run check', NPM_CHECK),
    false,
  );
  assert.equal(
    commandMatches("echo 'a || b' && npm run check", NPM_CHECK),
    false,
  );
  assert.equal(
    commandMatches('echo `a || b` && npm run check', NPM_CHECK),
    false,
  );
});

test('does not confirm a check hidden by a later command or another directory', () => {
  assert.equal(commandMatches('cd site && npm run check', NPM_CHECK), false);
  assert.equal(
    commandMatches('cd packages/api && npm run check && echo done', NPM_CHECK),
    false,
  );
  assert.equal(commandMatches('npm run check\ntrue', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check -- --help', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check -- src/app.test.ts', NPM_CHECK), false);
  assert.equal(commandMatches('go test ./pkg', {
    executable: 'go',
    args: ['test', './...'],
    display: 'go test ./...',
  }), false);
});

test('does not confirm a check joined by a sequence or background operator', () => {
  assert.equal(commandMatches('npm run check ; echo done', NPM_CHECK), false);
  assert.equal(commandMatches('npm run check & echo done', NPM_CHECK), false);
});

test('detects go from go.mod as a test setup', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'go.mod'), 'module x');
    assert.equal(hasTestSetup(dir), true);
  });
});

test('detects yarn and bun lockfiles as the package manager', () => {
  const lockfiles: ReadonlyArray<{
    readonly lockfile: string;
    readonly display: string;
  }> = [
    { lockfile: 'yarn.lock', display: 'yarn test' },
    { lockfile: 'bun.lockb', display: 'bun run test' },
    { lockfile: 'bun.lock', display: 'bun run test' },
  ];

  for (const { lockfile, display } of lockfiles) {
    withDir((dir) => {
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ scripts: { test: 'node --test' } }),
      );
      writeFileSync(join(dir, lockfile), '');
      assert.equal(detectCheckCommand(dir)?.display, display, lockfile);
    });
  }
});

test('ignores a Makefile target that only ends with check', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'Makefile'), 'precheck:\n\ttrue\n');
    assert.equal(detectCheckCommand(dir), undefined);
  });
});

test('names the file when package.json cannot be parsed', () => {
  withDir((dir) => {
    const packagePath = join(dir, 'package.json');
    writeFileSync(packagePath, '{');
    assert.throws(
      () => detectCheckCommand(dir),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Failed to read scripts from ${packagePath}`);
        assert.equal((error.cause as Error).name, 'SyntaxError');
        return true;
      },
    );
  });
});

test('names the file when the Makefile cannot be read', () => {
  withDir((dir) => {
    const makefilePath = join(dir, 'Makefile');
    mkdirSync(makefilePath);
    assert.throws(
      () => detectCheckCommand(dir),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message, `Failed to read ${makefilePath}`);
        assert.equal((error.cause as { code?: string }).code, 'EISDIR');
        return true;
      },
    );
  });
});
