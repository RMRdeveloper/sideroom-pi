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
import { findMonorepoSkillPaths } from './scan.ts';

function withDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'sideroom-monorepo-skills-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function writeFile(path: string, content = 'body'): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

test('discovers child skill locations with Pi-compatible agents rules', () => {
  withDirectory((root) => {
    writeFile(join(root, '.pi/skills/root/SKILL.md'));
    writeFile(join(root, 'api/.pi/skills/pi-guide/SKILL.md'));
    writeFile(join(root, 'api/.agents/skills/README.md'));
    writeFile(join(root, 'api/.agents/skills/group/loose.md'));
    writeFile(join(root, 'api/.agents/skills/named/SKILL.md'));
    writeFile(join(root, 'api/.agents/skills/named/deeper/hidden.md'));
    writeFile(join(root, 'mobile-app/.agents/skills/SKILL.md'));
    writeFile(join(root, 'web/.pi/skills/web-guide/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.pi/skills'),
      join(root, 'api/.agents/skills/group/loose.md'),
      join(root, 'api/.agents/skills/named/SKILL.md'),
      join(root, 'mobile-app/.agents/skills/SKILL.md'),
      join(root, 'web/.pi/skills'),
    ]);
  });
});

test('limits depth and respects ignore files during traversal', () => {
  withDirectory((root) => {
    writeFile(join(root, '.gitignore'), 'git-ignored/\n');
    writeFile(join(root, '.ignore'), 'plain-ignored/\n');
    writeFile(join(root, '.fdignore'), 'fd-ignored/\n');
    writeFile(join(root, 'git-ignored/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'plain-ignored/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'fd-ignored/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'node_modules/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, '.hidden/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'allowed/.gitignore'), 'deep/\n');
    writeFile(join(root, 'allowed/deep/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'one/two/three/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'one/two/three/four/.pi/skills/x/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'one/two/three/.pi/skills'),
    ]);
  });
});

test('does not follow directory symlinks', {
  skip: process.platform === 'win32',
}, () => {
  withDirectory((root) => {
    const external = mkdtempSync(
      join(tmpdir(), 'sideroom-monorepo-skills-external-'),
    );
    try {
      writeFile(join(external, '.pi/skills/x/SKILL.md'));
      symlinkSync(external, join(root, 'linked'), 'dir');
      assert.deepEqual(findMonorepoSkillPaths(root), []);
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });
});
