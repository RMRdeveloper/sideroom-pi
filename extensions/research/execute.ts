import { realpath } from 'node:fs/promises';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createResearchAgent } from './agent.ts';
import { createResearchEvidence, verifyResearchEvidence, type EvidenceCheck } from './evidence.ts';
import { researchLimits } from './limits.ts';
import { parseResearchRequest, parseResearchResult, type ResearchResult } from './model.ts';
import { buildPartialReport } from './partial.ts';
import { assessResearchReport, unreadResearchPaths } from './reconcile.ts';
import { readResearchRevision } from './revision.ts';
import { sumResearchUsage, type ResearchUsage } from './usage.ts';
import { runResearch, type ResearchRun } from './workflow.ts';

const FINALIZATION_RESERVE_MS = 5_000;

type ResearchContext = Pick<ExtensionContext, 'cwd' | 'model' | 'modelRegistry' | 'thinkingLevel'>;

export interface ResearchExecution {
  readonly outcome: ResearchResult;
  readonly usage?: ResearchUsage;
}

interface ExecuteResearchOptions {
  readonly ctx: ResearchContext;
  readonly input: unknown;
  readonly signal?: AbortSignal;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

function incompleteRun(status: 'cancelled' | 'timed_out' | 'failed', error?: string): ResearchRun {
  return {
    status,
    messages: [],
    elapsedMs: 0,
    toolCalls: 0,
    usedGit: false,
    report: buildPartialReport([], status === 'cancelled'),
    ...(error === undefined ? {} : { error }),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailableChecks(paths: readonly string[], reason: string): EvidenceCheck[] {
  return paths.map((path) => ({ path, status: 'unavailable', error: reason }));
}

export async function executeResearch({ ctx, input, signal, environment = process.env }: ExecuteResearchOptions): Promise<ResearchExecution> {
  const request = parseResearchRequest(input);
  const limits = researchLimits(environment);
  const started = performance.now();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), limits.timeoutMs);
  const activeSignal = signal === undefined ? deadline.signal : AbortSignal.any([signal, deadline.signal]);
  const evidence = createResearchEvidence();
  const limitations = ['Public web search is unavailable in this run.'];
  let revision: string | null = null;
  let messages: readonly AgentMessage[] = [];
  let run: ResearchRun | undefined;
  let cwd = ctx.cwd;
  try {
    activeSignal.throwIfAborted();
    cwd = await realpath(ctx.cwd);
    const revisionAtStart = await readResearchRevision(cwd, activeSignal);
    revision = revisionAtStart.revision;
    if (revisionAtStart.warning !== undefined) {
      limitations.push(revisionAtStart.warning);
    }
    activeSignal.throwIfAborted();
    const agent = await createResearchAgent({ cwd, model: ctx.model, modelRegistry: ctx.modelRegistry, thinkingLevel: ctx.thinkingLevel }, { onRead: evidence.observe });
    const remaining = Math.floor(limits.timeoutMs - (performance.now() - started));
    const reserve = Math.min(FINALIZATION_RESERVE_MS, Math.floor(limits.timeoutMs / 4));
    if (remaining <= reserve) {
      run = incompleteRun('timed_out');
    } else {
      run = await runResearch({
        agent, request, signal: activeSignal, timeoutMs: remaining - reserve, maxOutputBytes: limits.outputBytes,
        unreadPaths: (report) => unreadResearchPaths(report, evidence.snapshot()),
        contextWindow: ctx.model?.contextWindow,
      });
      messages = run.messages;
    }
  } catch (error) {
    const status = signal?.aborted ? 'cancelled' : deadline.signal.aborted ? 'timed_out' : 'failed';
    run = incompleteRun(status, errorText(error));
  }
  try {
    if (run.status === 'cancelled' && deadline.signal.aborted && !signal?.aborted) {
      run = { ...run, status: 'timed_out', report: run.report === undefined ? undefined : { ...run.report, status: 'partial' } };
    }
    const snapshot = evidence.snapshot();
    let checks = unavailableChecks(snapshot.files.map((file) => file.path), 'Verification did not finish.');
    if (!activeSignal.aborted && run.status !== 'cancelled' && run.status !== 'timed_out') {
      try {
        checks = [...await verifyResearchEvidence({ cwd, files: snapshot.files, signal: activeSignal })];
      } catch (error) {
        limitations.push(`Evidence verification stopped: ${errorText(error).slice(0, 500)}`);
      }
    }
    let revisionAtEnd: string | null = null;
    let revisionIssue: 'revision_changed' | 'revision_unavailable' | undefined;
    if (run.usedGit) {
      if (!activeSignal.aborted) {
        try {
          const current = await readResearchRevision(cwd, activeSignal);
          revisionAtEnd = current.revision;
          if (current.warning !== undefined) {
            limitations.push(current.warning);
          }
        } catch (error) {
          limitations.push(`Git revision check stopped: ${errorText(error).slice(0, 500)}`);
        }
      }
      if (revision === null || revisionAtEnd === null) {
        revisionIssue = 'revision_unavailable';
      } else if (revision !== revisionAtEnd) {
        revisionIssue = 'revision_changed';
      }
    }
    if (run.error !== undefined) {
      limitations.push(`Research stopped: ${run.error.slice(0, 500)}`);
    }
    if (run.correction !== undefined) {
      limitations.push(run.correction);
    }
    if (activeSignal.aborted) {
      const status = signal?.aborted ? 'cancelled' : 'timed_out';
      run = { ...run, status, report: run.report === undefined ? undefined : { ...run.report, status: status === 'cancelled' ? 'cancelled' : 'partial' } };
    }
    const report = run.report ?? buildPartialReport(messages, run.status === 'cancelled');
    const assessment = assessResearchReport({ report, evidence: snapshot, checks, revisionIssue });
    const usage = sumResearchUsage(messages);
    const outcome = parseResearchResult({
      request,
      report: assessment.report,
      cwd,
      revision,
      revisionAtEnd,
      runStatus: run.status,
      issues: assessment.issues,
      ...(assessment.unverifiedConclusion === undefined ? {} : { unverifiedConclusion: assessment.unverifiedConclusion }),
      limitations,
      changedDuringResearch: snapshot.changedDuringResearch,
      evidenceChecks: checks.map((check) => ({ ...check, ...(check.error === undefined ? {} : { error: check.error.slice(0, 2_000) }) })),
      files: snapshot.files,
      usage: {
        elapsedMs: Math.max(0, Math.round(performance.now() - started)),
        toolCalls: run.toolCalls,
        inputTokens: usage?.input ?? null,
        outputTokens: usage?.output ?? null,
        cacheReadTokens: usage?.cacheRead ?? null,
        cacheWriteTokens: usage?.cacheWrite ?? null,
        totalTokens: usage?.totalTokens ?? null,
      },
    });
    return { outcome, ...(usage === undefined ? {} : { usage }) };
  } finally {
    clearTimeout(timer);
  }
}
