import {
  PERSONA_SKILL_PATH,
  PERSONA_TOOL_NAME,
  PROHIBITIONS,
  type Prohibition,
  TEXT_SCOPE,
  VOICE_RULES,
} from './catalog.ts';
import type { ProhibitionViolation } from './checks.ts';

// Pi narrows these blocks before handing the message over; the shape is
// structural so no runtime decoding is needed here.
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

export function formatPersonaDetail(): string {
  return [
    'Sideroom persona: one always-on voice; no profiles or switching.',
    '',
    'Voice rules',
    ...VOICE_RULES.map((rule) => `- ${rule.instruction}`),
    '',
    'Hard prohibitions',
    ...PROHIBITIONS.map(
      (prohibition) => `- ${prohibition.rule} (${enforcementOf(prohibition)})`,
    ),
    '',
    `Complete guide: ${PERSONA_SKILL_PATH}`,
  ].join('\n');
}

export function formatBlockReason(
  path: string,
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `Blocked ${path}: the Sideroom persona forbids this content.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Remove the flagged content and retry the mutation.',
  ].join('\n');
}

export function formatArtifactSteer(
  path: string,
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `Sideroom persona stopped blocking ${path} after repeated attempts, but this content is still forbidden.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Remove it in the next edit.',
  ].join('\n');
}

export function formatSteer(
  violations: readonly ProhibitionViolation[],
): string {
  return [
    `${PERSONA_TOOL_NAME}: part of your last message is forbidden.`,
    ...violations.map(
      (violation) =>
        `- ${violation.prohibition.rule} Found: "${violation.excerpt}"`,
    ),
    'Rewrite in plain words: subject and goal first, everyday terms, no concept jargon the user did not use.',
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

function enforcementOf(prohibition: Prohibition): string {
  if (prohibition.scopes.includes(TEXT_SCOPE.artifact)) {
    return 'blocked on write and edit';
  }
  return 'corrected with a steer';
}
