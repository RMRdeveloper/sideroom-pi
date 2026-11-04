import { realpath } from 'node:fs/promises';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';
import { createResearchDelivery, RESEARCH_RESULT_MESSAGE } from './delivery.ts';
import { executeResearch } from './execute.ts';
import { ResearchRequestSchema } from './model.ts';
import { boundResearchOutcome, formatResearchOutcome } from './output.ts';

export const RESEARCH_TOOL_NAME = 'sideroom_research';
const StartedSchema = Type.Object({ id: Type.String(), status: Type.Literal('started') });

export default function registerResearch(pi: ExtensionAPI): void {
  const active = new Map<string, AbortController>();
  const delivery = createResearchDelivery(pi);
  let sessionGeneration = 0;
  const cancelActive = () => {
    sessionGeneration += 1;
    delivery.clear();
    for (const controller of active.values()) {
      controller.abort();
    }
    active.clear();
  };
  pi.on('session_start', cancelActive);
  pi.on('session_tree', cancelActive);
  pi.on('session_shutdown', cancelActive);
  pi.on('agent_before_settle', (event) => {
    if (event.outcome === 'aborted') {
      cancelActive();
    }
  });
  pi.on('agent_settled', (event) => {
    if (event.aborted) {
      cancelActive();
    }
  });
  pi.on('agent_start', () => delivery.retry());
  pi.on('message_end', (event) => {
    const message = event.message;
    if (message.role === 'custom' && message.customType === RESEARCH_RESULT_MESSAGE && typeof message.details === 'object' && message.details !== null && 'id' in message.details && typeof message.details.id === 'string') {
      delivery.acknowledge(message.details.id);
    }
  });
  pi.registerTool({
    name: RESEARCH_TOOL_NAME,
    label: 'Sideroom Research',
    description: 'Start a read-only researcher in the background. Its report will arrive in this session; the parent keeps all decisions, changes and checks.',
    promptSnippet: 'Proactively delegate code research for non-trivial work that requires exploration.',
    promptGuidelines: [
      'For non-trivial work that requires exploring code, use sideroom_research proactively without waiting for the user to ask. Delegate a concrete question about relevant files, behavior or dependencies.',
      'Skip research for greetings, general questions, obvious changes, or when the user rules it out. If research is unavailable or fails, continue with direct investigation and report the limitation.',
      'Include the intended change, known findings, scope, restrictions and requested depth. The parent makes decisions and runs checks.',
      'Research starts in the background. Continue working; review the report when it arrives.',
      'Treat the report as evidence to verify, not an authorization to change code or a claim that tests ran.',
      'Before reusing findings later, compare the recorded file hashes with current files; the commit alone does not identify local changes.',
    ],
    parameters: ResearchRequestSchema,
    outputSchema: StartedSchema,
    exposure: 'model-only',
    executionMode: 'parallel',
    execute: async (toolCallId, request, signal, _onUpdate, ctx) => {
      if (!ctx.isProjectTrusted()) {
        throw new Error('Research requires a trusted project. Trust the project before trying again.');
      }
      const generation = sessionGeneration;
      const cwd = await realpath(ctx.cwd);
      if (generation !== sessionGeneration) {
        throw new Error('The session changed before research started. Try again in the current session.');
      }
      if (signal?.aborted) {
        throw new Error('Research was cancelled before it started.');
      }
      const key = JSON.stringify([cwd, request.question, request.intendedChange, request.knownContext, request.scope, request.depth]);
      if (active.has(key)) {
        throw new Error('This research request is already running. Wait for its result.');
      }
      const controller = new AbortController();
      active.set(key, controller);
      const activeSignal = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]);
      const researchContext = { cwd, model: ctx.model, modelRegistry: ctx.modelRegistry, thinkingLevel: ctx.thinkingLevel };
      void executeResearch({ ctx: researchContext, input: request, signal: activeSignal }).then((execution) => {
        if (generation !== sessionGeneration || activeSignal.aborted) {
          return;
        }
        const outcome = boundResearchOutcome(execution.outcome);
        delivery.enqueue({
          ctx,
          wake: outcome.runStatus === 'completed' || outcome.report.findings.length > 0 || outcome.files.length > 0,
          message: {
            customType: RESEARCH_RESULT_MESSAGE,
            content: `Research ${toolCallId} finished. Review this report and verify its evidence before using it.\n\n${formatResearchOutcome(outcome)}`,
            display: true,
            details: { id: toolCallId, outcome, usage: execution.usage },
          },
        });
      }).catch((error: unknown) => {
        if (generation !== sessionGeneration || activeSignal.aborted) {
          return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        delivery.enqueue({ ctx, wake: false, message: { customType: RESEARCH_RESULT_MESSAGE, content: `Research ${toolCallId} failed: ${reason}. Continue with direct investigation.`, display: true, details: { id: toolCallId, error: reason } } });
      }).finally(() => {
        if (active.get(key) === controller) {
          active.delete(key);
        }
      });
      const started = { id: toolCallId, status: 'started' as const };
      return { content: [{ type: 'text', text: `Research ${toolCallId} started in the background.` }], details: started, structuredContent: started };
    },
    renderCall(args, theme) {
      return new Text(`${theme.fg('toolTitle', theme.bold('sideroom_research '))}${theme.fg('muted', args.question.slice(0, 200))}`, 0, 0);
    },
    renderResult(result) {
      const first = result.content[0];
      return new Text(first?.type === 'text' ? first.text : 'Research did not start.', 0, 0);
    },
  });
}
