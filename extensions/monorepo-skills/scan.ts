import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import ignore from 'ignore';

const MAX_CHILD_DEPTH = 3;
const IGNORE_FILE_NAMES = ['.gitignore', '.ignore', '.fdignore'] as const;
const NODE_MODULES_DIRECTORY = 'node_modules';
const PI_DIRECTORY = '.pi';
const AGENTS_DIRECTORY = '.agents';
const SKILLS_DIRECTORY = 'skills';
const SKILL_FILE_NAME = 'SKILL.md';
const MARKDOWN_EXTENSION = '.md';

export function findMonorepoSkillPaths(cwd: string): string[] {
  const rootDirectory = resolve(cwd);
  const childDirectories = collectChildDirectories(
    rootDirectory,
    rootDirectory,
    0,
    [],
  );
  childDirectories.sort((left, right) =>
    compareText(relative(rootDirectory, left), relative(rootDirectory, right)),
  );

  const skillPaths: string[] = [];
  for (const childDirectory of childDirectories) {
    const piSkillsDirectory = join(
      childDirectory,
      PI_DIRECTORY,
      SKILLS_DIRECTORY,
    );
    if (isDirectory(piSkillsDirectory)) {
      skillPaths.push(piSkillsDirectory);
    }

    const agentsSkillsDirectory = join(
      childDirectory,
      AGENTS_DIRECTORY,
      SKILLS_DIRECTORY,
    );
    if (isDirectory(agentsSkillsDirectory)) {
      skillPaths.push(...collectAgentsSkillPaths(agentsSkillsDirectory));
    }
  }
  return skillPaths;
}

function collectChildDirectories(
  directory: string,
  rootDirectory: string,
  depth: number,
  inheritedIgnorePatterns: readonly string[],
): string[] {
  if (depth >= MAX_CHILD_DEPTH) {
    return [];
  }

  const ignorePatterns = [
    ...inheritedIgnorePatterns,
    ...readIgnoreRules(directory, rootDirectory),
  ];
  const ignoreMatcher = ignore().add(ignorePatterns);
  const childDirectories: string[] = [];
  for (const entry of readDirectoryEntries(directory)) {
    if (!entry.isDirectory() || isTraversalDirectory(entry.name)) {
      continue;
    }

    const childDirectory = join(directory, entry.name);
    const relativeChild = toPosixPath(relative(rootDirectory, childDirectory));
    if (ignoreMatcher.ignores(`${relativeChild}/`)) {
      continue;
    }

    childDirectories.push(
      childDirectory,
      ...collectChildDirectories(
        childDirectory,
        rootDirectory,
        depth + 1,
        ignorePatterns,
      ),
    );
  }
  return childDirectories;
}

function collectAgentsSkillPaths(skillsDirectory: string): string[] {
  return collectAgentsSkillPathsFromDirectory(
    skillsDirectory,
    skillsDirectory,
    [],
  );
}

function collectAgentsSkillPathsFromDirectory(
  directory: string,
  rootDirectory: string,
  inheritedIgnorePatterns: readonly string[],
): string[] {
  const ignorePatterns = [
    ...inheritedIgnorePatterns,
    ...readIgnoreRules(directory, rootDirectory),
  ];
  const ignoreMatcher = ignore().add(ignorePatterns);
  const entries = readDirectoryEntries(directory);
  const declaredSkill = entries.find((entry) => {
    if (entry.name !== SKILL_FILE_NAME || !entry.isFile()) {
      return false;
    }
    const relativeSkill = toPosixPath(
      relative(rootDirectory, join(directory, entry.name)),
    );
    return !ignoreMatcher.ignores(relativeSkill);
  });
  if (declaredSkill) {
    return [join(directory, declaredSkill.name)];
  }

  const skillPaths: string[] = [];
  for (const entry of entries) {
    if (isTraversalDirectory(entry.name)) {
      continue;
    }

    const entryPath = join(directory, entry.name);
    const relativeEntry = toPosixPath(relative(rootDirectory, entryPath));
    if (entry.isFile()) {
      if (
        directory !== rootDirectory &&
        entry.name.endsWith(MARKDOWN_EXTENSION) &&
        !ignoreMatcher.ignores(relativeEntry)
      ) {
        skillPaths.push(entryPath);
      }
      continue;
    }
    if (!entry.isDirectory() || ignoreMatcher.ignores(`${relativeEntry}/`)) {
      continue;
    }
    skillPaths.push(
      ...collectAgentsSkillPathsFromDirectory(
        entryPath,
        rootDirectory,
        ignorePatterns,
      ),
    );
  }
  return skillPaths;
}

function readIgnoreRules(directory: string, rootDirectory: string): string[] {
  const relativeDirectory = relative(rootDirectory, directory);
  const prefix = relativeDirectory ? `${toPosixPath(relativeDirectory)}/` : '';
  const ignorePatterns: string[] = [];

  for (const fileName of IGNORE_FILE_NAMES) {
    const ignorePath = join(directory, fileName);
    if (!existsSync(ignorePath)) {
      continue;
    }

    ignorePatterns.push(
      ...readFileSync(ignorePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => prefixIgnorePattern(line, prefix))
        .filter((pattern): pattern is string => pattern !== undefined),
    );
  }
  return ignorePatterns;
}

function prefixIgnorePattern(line: string, prefix: string): string | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed.startsWith('#') && !trimmed.startsWith('\\#')) {
    return undefined;
  }

  let pattern = line;
  let negated = false;
  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1);
  } else if (pattern.startsWith('\\!')) {
    pattern = pattern.slice(1);
  }
  if (pattern.startsWith('/')) {
    pattern = pattern.slice(1);
  }

  const prefixed = prefix ? `${prefix}${pattern}` : pattern;
  return negated ? `!${prefixed}` : prefixed;
}

function readDirectoryEntries(directory: string) {
  return readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    compareText(left.name, right.name),
  );
}

function isDirectory(path: string): boolean {
  return existsSync(path) && lstatSync(path).isDirectory();
}

function isTraversalDirectory(name: string): boolean {
  return name.startsWith('.') || name === NODE_MODULES_DIRECTORY;
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
