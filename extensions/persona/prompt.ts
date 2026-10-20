import {
  PERSONA_SKILL_PATH,
  PERSONA_TOOL_NAME,
  PROHIBITIONS,
  VOICE_RULES,
} from './catalog.ts';

export const PERSONA_REMINDER_HEADING =
  'Sideroom persona (always-on reminder):';

const VOICE_SUMMARY = VOICE_RULES.map((rule) => rule.instruction).join(' ');
const PROHIBITION_SUMMARY = PROHIBITIONS.map(
  (prohibition) => prohibition.rule,
).join(' ');
const ENFORCEMENT_SUMMARY =
  'A write/edit adding a decorative symbol is blocked; other violations trigger a steer.';

export const PERSONA_EXAMPLES = [
  "Do: Your work list stays with this conversation, not in project files. Don't: Session-scoped board state persists outside the repository.",
  "Do: To get a fresh answer, turn off the cache (stored results). Don't: Disable the cache invalidation pipeline.",
] as const;

export const PERSONA_REMINDER = `${PERSONA_REMINDER_HEADING}
Apply this voice to progress messages, final answers, and user-facing documentation.
Voice: ${VOICE_SUMMARY}
Never: ${PROHIBITION_SUMMARY}
${ENFORCEMENT_SUMMARY}
Examples:
${PERSONA_EXAMPLES.join('\n')}
Before the first substantial explanation or report, call ${PERSONA_TOOL_NAME} or read ${PERSONA_SKILL_PATH}; reuse the complete guide while it remains in context.
Before sending prose, check: outcome first, necessary terms explained, no repetition or invented labels. Preserve evidence and requested detail.`;

export function appendPersonaReminder(systemPrompt: string): string {
  if (systemPrompt.includes(PERSONA_REMINDER_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return PERSONA_REMINDER;
  }
  return `${systemPrompt}\n\n${PERSONA_REMINDER}`;
}
