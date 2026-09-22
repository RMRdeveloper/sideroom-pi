import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const PERSONA_TOOL_NAME = 'sideroom_persona';
export const PERSONA_STATUS_KEY = 'sideroom-persona';
export const PERSONA_STEER_TYPE = 'sideroom-persona-steer';
export const PERSONA_SKILL_PATH = join(
  PACKAGE_ROOT,
  'skills/sideroom-persona/SKILL.md',
);

export const TEXT_SCOPE = {
  prose: 'prose',
  artifact: 'artifact',
} as const;

export type TextScope = (typeof TEXT_SCOPE)[keyof typeof TEXT_SCOPE];

export type VoiceRuleId =
  | 'direct'
  | 'no-filler'
  | 'plain-language'
  | 'no-invented-terms'
  | 'short-prose'
  | 'user-language';

export interface VoiceRule {
  readonly id: VoiceRuleId;
  readonly instruction: string;
}

export const VOICE_RULES: readonly VoiceRule[] = [
  {
    id: 'plain-language',
    instruction:
      'Explain in plain words: name the subject and goal before the detail, prefer everyday terms over concept jargon (hook, pipeline, registry, resolver, guardrail, invariant) unless the user used them, define any necessary term in one line, and be explicit without repetition. Never write tangled chains such as "the registry resolves the provider through the auth resolver".',
  },
  {
    id: 'direct',
    instruction:
      'Be direct and dry. Short sentences. No preamble or closing summary.',
  },
  {
    id: 'no-filler',
    instruction: 'No filler.',
  },
  {
    id: 'no-invented-terms',
    instruction:
      'Name things as they are. Coin no intermediate term, abbreviation, codename, or technical concept word the user did not ask for.',
  },
  {
    id: 'short-prose',
    instruction:
      'Default to short prose. Lists or tables only to compare options or list more than three items.',
  },
  {
    id: 'user-language',
    instruction: "Answer in the user's language and variant.",
  },
];

export type ProhibitionId =
  | 'decorative-symbols'
  | 'flattery-and-filler'
  | 'hedging-and-apology'
  | 'ai-meta-commentary';

export interface Prohibition {
  readonly id: ProhibitionId;
  readonly rule: string;
  readonly scopes: readonly TextScope[];
}

export const PROHIBITIONS: readonly Prohibition[] = [
  {
    id: 'decorative-symbols',
    rule: 'No emojis or decorative symbols in prose or artifacts.',
    scopes: [TEXT_SCOPE.prose, TEXT_SCOPE.artifact],
  },
  {
    id: 'flattery-and-filler',
    rule: 'No flattering openers such as "Great question!", restating what was just said, or announcing the answer.',
    scopes: [TEXT_SCOPE.prose],
  },
  {
    id: 'hedging-and-apology',
    rule: 'No hedging such as "maybe we could consider" or automatic apologies.',
    scopes: [TEXT_SCOPE.prose],
  },
  {
    id: 'ai-meta-commentary',
    rule: 'No AI meta-commentary such as "as a language model" or "I do not have access to".',
    scopes: [TEXT_SCOPE.prose],
  },
];

const PROHIBITION_BY_ID: ReadonlyMap<ProhibitionId, Prohibition> = new Map(
  PROHIBITIONS.map((prohibition) => [prohibition.id, prohibition]),
);

export function prohibitionById(id: ProhibitionId): Prohibition {
  const prohibition = PROHIBITION_BY_ID.get(id);
  if (prohibition === undefined) {
    throw new Error(`Unknown prohibition id: ${id}`);
  }
  return prohibition;
}
