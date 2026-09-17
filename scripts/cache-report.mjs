// Prints how many tokens each session re-sent and how much of that followed a
// work-board update. Run it with `npm run cache:report`; pass session files or
// directories to read something other than this project's sessions.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseSessionLines } from './cache-report/parse.mjs';
import { formatReport } from './cache-report/report.mjs';

const SESSIONS_ROOT = join(homedir(), '.pi', 'agent', 'sessions');
const SESSION_FILE_SUFFIX = '.jsonl';

const arguments_ = process.argv.slice(2).map((argument) => resolve(argument));
const targets = arguments_.length > 0 ? arguments_ : [defaultSessionDir()];
const sessions = collectSessionFiles(targets).map((path) => ({
  path,
  ...parseSessionLines(readFileSync(path, 'utf8').split('\n')),
}));

process.stdout.write(`${formatReport(sessions)}\n`);

function collectSessionFiles(targets) {
  const files = [];
  for (const target of targets) {
    if (!existsSync(target)) {
      throw new Error(`No session file or directory at ${target}`);
    }
    if (statSync(target).isDirectory()) {
      files.push(...listSessionFiles(target));
      continue;
    }
    files.push(target);
  }
  return files;
}

function listSessionFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith(SESSION_FILE_SUFFIX))
    .sort()
    .map((name) => join(directory, name));
}

// Pi names each project's session directory after its working directory.
function defaultSessionDir() {
  const encoded = `--${process.cwd().slice(1).replaceAll('/', '-')}--`;
  const directory = join(SESSIONS_ROOT, encoded);
  if (!existsSync(directory)) {
    throw new Error(
      `No session directory at ${directory}. Pass session files or directories as arguments.`,
    );
  }
  return directory;
}
