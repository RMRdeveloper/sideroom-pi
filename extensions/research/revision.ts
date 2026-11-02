import { runResearchGit } from './git-client.ts';

export interface ResearchRevision {
  readonly revision: string | null;
  readonly warning?: string;
}

export async function readResearchRevision(cwd: string, signal?: AbortSignal): Promise<ResearchRevision> {
  signal?.throwIfAborted();
  try {
    const stdout = await runResearchGit({ cwd, args: ['rev-parse', '--verify', 'HEAD'], signal });
    const revision = stdout.trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision)) {
      return { revision: null, warning: 'Git returned an invalid revision.' };
    }
    return { revision };
  } catch (error) {
    signal?.throwIfAborted();
    return { revision: null, warning: `Git revision unavailable: ${error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)}` };
  }
}
