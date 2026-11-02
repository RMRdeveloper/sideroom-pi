import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, sep } from 'node:path';
import { runResearchGit } from './git-client.ts';
import type { ResearchReader } from './reader.ts';

export interface ResearchGitRequest {
  readonly operation: 'diff' | 'history';
  readonly path: string;
}

interface GitOptions {
  readonly cwd: string;
  readonly reader: ResearchReader;
  readonly request: ResearchGitRequest;
  readonly signal?: AbortSignal;
}

async function worktreeForProject(cwd: string, signal?: AbortSignal): Promise<string> {
  const top = await runResearchGit({ cwd, args: ['rev-parse', '--show-toplevel'], signal });
  const workTree = await realpath(top.replace(/\r?\n$/u, ''));
  const local = relative(workTree, cwd);
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    throw new Error('Git worktree does not contain the research project.');
  }
  return workTree;
}

export async function researchGit({ cwd, reader, request, signal }: GitOptions): Promise<string> {
  const excerpt = await reader.read(request.path, signal);
  const args = request.operation === 'diff'
    ? ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--no-color', 'HEAD', '--', request.path]
    : ['log', '-n', '10', '--format=%H%x09%s', '--no-color', '--no-show-signature', '--', request.path];
  const workTree = await worktreeForProject(cwd, signal);
  const output = await runResearchGit({ cwd, args, workTree, signal });
  const history = output.length === 0 ? 'No Git output for this file and operation.' : output;
  return `Current file excerpt:\n${excerpt}\nGit ${request.operation}:\n${history}`;
}
