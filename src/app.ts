import {
  createFixer,
  createImplementer,
  createPlanner,
  createReviewer,
  createVerifier,
} from './core/agents.ts';
import { createGriller } from './core/grilling.ts';
import type { FilePolicy } from './core/language-policy.ts';
import {
  type PipelineObserver,
  SideroomOrchestrator,
} from './core/orchestrator.ts';
import { createPiModelProvider } from './runtimes/pi.ts';

/** Create the Pi-first pipeline for its Pi extension host. */
export function createPipeline(options: {
  readonly dir: string;
  readonly policies: readonly FilePolicy[];
  readonly model?: string;
  readonly maxFixPasses?: number;
  readonly allowWrite?: boolean;
  readonly signal?: AbortSignal;
  readonly onStage?: PipelineObserver;
}): SideroomOrchestrator {
  const model = createPiModelProvider({
    dir: options.dir,
    policies: options.policies,
    ...(options.model === undefined ? {} : { model: options.model }),
    allowWrite: options.allowWrite,
    signal: options.signal,
  });
  return new SideroomOrchestrator({
    planner: createPlanner(model),
    implementer: createImplementer(model),
    reviewer: createReviewer(model),
    verifier: createVerifier(model),
    fixer: createFixer(model),
    griller: createGriller(model),
    maxFixPasses: options.maxFixPasses,
    onStage: options.onStage,
  });
}
