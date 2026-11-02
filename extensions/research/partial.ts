import type { AgentMessage } from '@earendil-works/pi-agent-core';
import type { ResearchReport } from './model.ts';

const MAX_PARTIAL_FINDINGS = 10;
const MAX_PATH_BYTES = 512;
const MAX_EXCERPT_CHARS = 500;

interface ResearchCall {
  readonly name: 'research_read' | 'research_git' | 'research_search';
  readonly paths: readonly string[];
}

function callFor(part: Extract<Extract<AgentMessage, { role: 'assistant' }>['content'][number], { type: 'toolCall' }>): ResearchCall | undefined {
  const args: unknown = part.arguments;
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  if ((part.name === 'research_read' || part.name === 'research_git') && 'path' in args && typeof args.path === 'string') {
    return { name: part.name, paths: [args.path] };
  }
  if (part.name === 'research_search' && 'paths' in args && Array.isArray(args.paths)) {
    return { name: part.name, paths: args.paths.filter((path): path is string => typeof path === 'string') };
  }
  return undefined;
}

function resultExcerpt(call: ResearchCall, path: string, text: string): string {
  if (call.name !== 'research_search') {
    return text;
  }
  const prefix = `${JSON.stringify(path)}: `;
  return text.split('\n')
    .filter((line) => line.startsWith(prefix) && /^\d+: /u.test(line.slice(prefix.length)))
    .join('\n');
}

export function buildPartialReport(messages: readonly AgentMessage[], cancelled: boolean): ResearchReport {
  const calls = new Map<string, ResearchCall>();
  const findings: ResearchReport['findings'] = [];
  let omitted = 0;
  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const part of message.content) {
        if (part.type === 'toolCall') {
          const call = callFor(part);
          if (call !== undefined) {
            calls.set(part.id, call);
          }
        }
      }
      continue;
    }
    if (message.role !== 'toolResult' || message.isError) {
      continue;
    }
    const call = calls.get(message.toolCallId);
    if (call === undefined || call.name !== message.toolName) {
      continue;
    }
    const text = message.content.filter((part) => part.type === 'text').map((part) => part.text).join('');
    for (const path of call.paths) {
      const found = resultExcerpt(call, path, text);
      if (found.length === 0) {
        continue;
      }
      if (path.length === 0 || Buffer.byteLength(path, 'utf8') > MAX_PATH_BYTES || findings.length >= MAX_PARTIAL_FINDINGS) {
        omitted += 1;
        continue;
      }
      const excerpt = found.length > MAX_EXCERPT_CHARS ? `${found.slice(0, MAX_EXCERPT_CHARS)} [excerpt shortened]` : found;
      findings.push({
        claim: call.name === 'research_search' ? `Found matching lines in ${path}` : `Read ${path}`,
        evidence: call.name === 'research_search' ? 'The search returned the matching lines below.' : 'The research tool returned the excerpt below.',
        status: 'observed',
        consequence: 'Review the source before deciding the change.',
        references: [{ path, excerpt }],
      });
    }
  }
  return {
    status: cancelled ? 'cancelled' : 'partial',
    conclusion: 'The research stopped before producing a complete report.',
    findings,
    questions: [{ question: 'The original question still needs an evidence-based answer.', blocking: true }],
    verification: [],
    termination: omitted === 0
      ? 'The run stopped before the report was complete.'
      : `The run stopped before the report was complete; ${String(omitted)} read results were not included.`,
  };
}
