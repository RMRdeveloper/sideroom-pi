import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { commandMatches, detectCheckCommand } from './detect.ts';

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
      JSON.stringify({ scripts: { check: 'biome check' } }),
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

test('matches the exact command, arguments, and shell joins', () => {
  const check = {
    executable: 'npm',
    args: ['run', 'check'],
    display: 'npm run check',
  };
  assert.equal(commandMatches('npm run check', check), true);
  assert.equal(commandMatches('  npm   run check  ', check), true);
  assert.equal(commandMatches('npm run check --silent', check), true);
  assert.equal(commandMatches('npm run check && npm test', check), true);
  assert.equal(commandMatches('npm run check:ci', check), false);
  assert.equal(commandMatches('npm run checklint', check), false);
});
