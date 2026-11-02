import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const runFile = promisify(execFile);
const GIT_TIMEOUT_MS = 2_000;
const GIT_OUTPUT_BYTES = 32_000;

interface GitRequest {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly workTree?: string;
  readonly signal?: AbortSignal;
}

export async function runResearchGit({ cwd, args, workTree, signal }: GitRequest): Promise<string> {
  signal?.throwIfAborted();
  const { stdout } = await runFile('git', ['--no-optional-locks', '--no-pager', '-c', 'core.fsmonitor=false', ...args], {
    cwd,
    signal,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_OUTPUT_BYTES,
    env: {
      PATH: process.env.PATH,
      HOME: '/nonexistent',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_NO_LAZY_FETCH: '1',
      GIT_LITERAL_PATHSPECS: '1',
      ...(workTree === undefined ? {} : { GIT_WORK_TREE: workTree }),
      LC_ALL: 'C',
    },
  });
  return stdout;
}
