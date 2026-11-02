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

const PLACEHOLDER_FOLDER_NAME = 'Stryker was here';

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

function withWorkingDirectory(directory: string, run: () => void): void {
  const previousWorkingDirectory = process.cwd();
  process.chdir(directory);
  try {
    run();
  } finally {
    process.chdir(previousWorkingDirectory);
  }
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

test('collects only markdown files inside agents skill folders', () => {
  withDirectory((root) => {
    writeFile(join(root, 'api/.agents/skills/group/guide.md'));
    writeFile(join(root, 'api/.agents/skills/group/notes.txt'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.agents/skills/group/guide.md'),
    ]);
  });
});

test('orders child skill locations by relative path', () => {
  withDirectory((root) => {
    writeFile(join(root, 'a-b/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'a/inner/.pi/skills/y/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a-b/.pi/skills'),
      join(root, 'a/inner/.pi/skills'),
    ]);
  });
});

test('finds each child skill folder once', () => {
  withDirectory((root) => {
    writeFile(join(root, PLACEHOLDER_FOLDER_NAME, '.pi/skills/x/SKILL.md'));
    mkdirSync(join(root, 'one/two/three'), { recursive: true });
    withWorkingDirectory(root, () => {
      assert.deepEqual(findMonorepoSkillPaths(root), [
        join(root, PLACEHOLDER_FOLDER_NAME, '.pi/skills'),
      ]);
    });
  });
});

test('scans a child folder named Stryker was here', () => {
  withDirectory((root) => {
    writeFile(join(root, PLACEHOLDER_FOLDER_NAME, '.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'other/.pi/skills/y/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, PLACEHOLDER_FOLDER_NAME, '.pi/skills'),
      join(root, 'other/.pi/skills'),
    ]);
  });
});

test('scans agents skill folders under a folder named Stryker was here', () => {
  withDirectory((root) => {
    writeFile(
      join(root, 'api/.agents/skills', PLACEHOLDER_FOLDER_NAME, 'SKILL.md'),
    );
    writeFile(join(root, 'api/.agents/skills/other/loose.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.agents/skills', PLACEHOLDER_FOLDER_NAME, 'SKILL.md'),
      join(root, 'api/.agents/skills/other/loose.md'),
    ]);
  });
});

test('skips hidden and node_modules folders inside agents skills', () => {
  withDirectory((root) => {
    writeFile(join(root, 'api/.agents/skills/node_modules/pkg/loose.md'));
    writeFile(join(root, 'api/.agents/skills/.hidden/loose.md'));
    writeFile(join(root, 'api/.agents/skills/plain/loose.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.agents/skills/plain/loose.md'),
    ]);
  });
});

test('applies ignore files inside agents skill folders', () => {
  withDirectory((root) => {
    writeFile(join(root, 'api/.agents/skills/.gitignore'), 'private/\n');
    writeFile(join(root, 'api/.agents/skills/private/notes.md'));
    writeFile(join(root, 'api/.agents/skills/public/notes.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.agents/skills/public/notes.md'),
    ]);
  });
});

test('applies a nested ignore file only to its own folder', () => {
  withDirectory((root) => {
    writeFile(join(root, 'a/.gitignore'), 'skip/\n');
    writeFile(join(root, 'a/skip/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'a/kept/app/.pi/skills/y/SKILL.md'));
    writeFile(join(root, 'b/skip/app/.pi/skills/z/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a/kept/app/.pi/skills'),
      join(root, 'b/skip/app/.pi/skills'),
    ]);
  });
});

test('reads one ignore pattern per line', () => {
  withDirectory((root) => {
    writeFile(join(root, '.gitignore'), 'first/\nskip/\n');
    writeFile(join(root, 'first/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'skip/app/.pi/skills/y/SKILL.md'));
    writeFile(join(root, 'kept/app/.pi/skills/z/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'kept/app/.pi/skills'),
    ]);
  });
});

test('skips blank ignore lines', () => {
  withDirectory((root) => {
    writeFile(join(root, 'a/.gitignore'), '  \n');
    writeFile(join(root, 'a/plain/app/.pi/skills/x/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a/plain/app/.pi/skills'),
    ]);
  });
});

test('skips comment lines in ignore files', () => {
  withDirectory((root) => {
    writeFile(join(root, 'a/.gitignore'), '#kept-folder/\n');
    writeFile(join(root, 'a/#kept-folder/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'a/plain/app/.pi/skills/y/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a/#kept-folder/app/.pi/skills'),
      join(root, 'a/plain/app/.pi/skills'),
    ]);
  });
});

test('applies ignore lines that end with a hash', () => {
  withDirectory((root) => {
    writeFile(join(root, '.gitignore'), 'hashed#\n');
    writeFile(join(root, 'hashed#/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'a/.gitignore'), '#hashed\\#\n');
    writeFile(join(root, 'a/#hashed#/app/.pi/skills/y/SKILL.md'));
    writeFile(join(root, 'kept/app/.pi/skills/z/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a/#hashed#/app/.pi/skills'),
      join(root, 'kept/app/.pi/skills'),
    ]);
  });
});

test('keeps a skill file that an ignore file un-ignores', () => {
  withDirectory((root) => {
    writeFile(
      join(root, 'api/.agents/skills/guides/.gitignore'),
      '*.md\n!keep.md\n',
    );
    writeFile(join(root, 'api/.agents/skills/guides/keep.md'));
    writeFile(join(root, 'api/.agents/skills/guides/drop.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'api/.agents/skills/guides/keep.md'),
    ]);
  });
});

test('keeps a folder when a root ignore line escapes an exclamation mark', () => {
  withDirectory((root) => {
    writeFile(join(root, '.gitignore'), '\\!bang/\n');
    writeFile(join(root, '!bang/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'plain/app/.pi/skills/y/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, '!bang/app/.pi/skills'),
      join(root, 'plain/app/.pi/skills'),
    ]);
  });
});

test('anchors an ignore line with a leading slash to its own folder', () => {
  withDirectory((root) => {
    writeFile(join(root, 'a/.gitignore'), '/anchored/\n');
    writeFile(join(root, 'a/anchored/app/.pi/skills/x/SKILL.md'));
    writeFile(join(root, 'a/nested/anchored/.pi/skills/y/SKILL.md'));

    assert.deepEqual(findMonorepoSkillPaths(root), [
      join(root, 'a/nested/anchored/.pi/skills'),
    ]);
  });
});

test('does not follow symlinks inside agents skill folders', {
  skip: process.platform === 'win32',
}, () => {
  withDirectory((root) => {
    writeFile(join(root, 'shared/loose.md'));
    mkdirSync(join(root, 'api/.agents/skills'), { recursive: true });
    symlinkSync(
      join(root, 'shared'),
      join(root, 'api/.agents/skills/linked'),
      'dir',
    );
    assert.deepEqual(findMonorepoSkillPaths(root), []);
  });
});
