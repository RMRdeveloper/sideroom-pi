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

export const PERSONA_REMINDER = `${PERSONA_REMINDER_HEADING}
Voice: ${VOICE_SUMMARY}
Never: ${PROHIBITION_SUMMARY}
${ENFORCEMENT_SUMMARY}
Full guide: call ${PERSONA_TOOL_NAME} or read ${PERSONA_SKILL_PATH}.`;

export function appendPersonaReminder(systemPrompt: string): string {
  if (systemPrompt.includes(PERSONA_REMINDER_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return PERSONA_REMINDER;
  }
  return `${systemPrompt}\n\n${PERSONA_REMINDER}`;
}
