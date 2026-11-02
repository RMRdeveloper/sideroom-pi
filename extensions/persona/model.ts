import { PERSONA_TOOL_NAME, PROHIBITIONS, VOICE_RULES } from './catalog.ts';
import type { ProhibitionViolation } from './checks.ts';

export interface TextBlock {
  readonly type: string;
  readonly text?: string;
}

export interface PersonaToolDetails {
  readonly voiceRules: readonly string[];
  readonly prohibitions: readonly string[];
}

export function personaStatusLabel(blocks: number, steers: number): string {
  const counts = [
    countLabel(blocks, 'block'),
    countLabel(steers, 'steer'),
  ].filter((count) => count.length > 0);
  if (counts.length === 0) {
    return 'persona: direct';
  }
  return `persona: direct · ${counts.join(' · ')}`;
}

function countLabel(count: number, noun: string): string {
  if (count === 0) {
    return '';
  }
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

export function personaToolDetails(): PersonaToolDetails {
  return {
    voiceRules: VOICE_RULES.map((rule) => rule.id),
    prohibitions: PROHIBITIONS.map((prohibition) => prohibition.id),
  };
}

export function formatBlockReason(
  path: string,
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `Blocked ${path}: a Sideroom voice rule rejects this content.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Remove the flagged content, then save again.',
  ].join('\n');
}

export function formatArtifactSteer(
  path: string,
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `Sideroom persona: ${path} still has blocked content, and blocking is off for the rest of this run.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Remove it in your next edit.',
  ].join('\n');
}

export function formatSteer(
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `${PERSONA_TOOL_NAME}: your last reply breaks a voice rule.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Rewrite in plain words: say what matters first, use everyday terms, and drop jargon the user did not ask for.',
  ].join('\n');
}

export function assistantMessageText(content: readonly TextBlock[]): string {
  const parts: string[] = [];
  for (const block of content) {
    if (block.type !== 'text') {
      continue;
    }
    parts.push(block.text ?? '');
  }
  return parts.join('\n');
}
