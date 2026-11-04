import { createResearchReader, type ResearchFileEvidence } from './reader.ts';

const MAX_EVIDENCE_FILES = 200;

export const UNFINISHED_VERIFICATION = 'Verification did not finish.';

export interface ResearchEvidenceSnapshot {
  readonly files: readonly ResearchFileEvidence[];
  readonly changedDuringResearch: readonly string[];
}

export interface ResearchEvidence {
  observe(file: ResearchFileEvidence): void;
  snapshot(): ResearchEvidenceSnapshot;
}

export interface EvidenceCheck {
  readonly path: string;
  readonly status: 'unchanged' | 'changed' | 'unavailable';
  readonly error?: string;
}

interface VerifyEvidenceOptions {
  readonly cwd: string;
  readonly files: readonly ResearchFileEvidence[];
  readonly signal?: AbortSignal;
}

export function createResearchEvidence(): ResearchEvidence {
  const files = new Map<string, ResearchFileEvidence>();
  const changed = new Set<string>();
  return {
    observe(file) {
      const previous = files.get(file.path);
      if (previous !== undefined) {
        if (previous.sha256 !== file.sha256) {
          changed.add(file.path);
        }
        return;
      }
      if (files.size >= MAX_EVIDENCE_FILES) {
        throw new Error('Research reached the 200-file evidence limit.');
      }
      files.set(file.path, { ...file });
    },
    snapshot() {
      return {
        files: [...files.values()].map((file) => ({ ...file })),
        changedDuringResearch: [...changed],
      };
    },
  };
}

export async function verifyResearchEvidence({ cwd, files, signal }: VerifyEvidenceOptions): Promise<readonly EvidenceCheck[]> {
  signal?.throwIfAborted();
  const checks: EvidenceCheck[] = [];
  let observed: ResearchFileEvidence | undefined;
  const reader = await createResearchReader(cwd, { onRead: (file) => { observed = file; } });
  for (const file of files) {
    if (signal?.aborted === true) {
      checks.push({
        path: file.path,
        status: 'unavailable',
        error: UNFINISHED_VERIFICATION,
      });
      continue;
    }
    observed = undefined;
    try {
      await reader.read(file.path, signal);
    } catch (error) {
      signal?.throwIfAborted();
      checks.push({ path: file.path, status: 'unavailable', error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (observed === undefined) {
      throw new Error('The reader did not record a file fingerprint.');
    }
    const current: ResearchFileEvidence = observed;
    checks.push({ path: file.path, status: current.sha256 === file.sha256 ? 'unchanged' : 'changed' });
  }
  return checks;
}
