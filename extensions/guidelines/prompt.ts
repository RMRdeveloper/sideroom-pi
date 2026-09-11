import { GUIDELINE_SKILL_PATH, LANGUAGE_GUIDES } from './catalog.ts';

export { LANGUAGE_GUIDE_FILES } from './catalog.ts';

export const GUIDELINES_REMINDER_HEADING =
  'Sideroom coding guidelines (always-on reminder):';

const LANGUAGE_GUIDE_REMINDERS = LANGUAGE_GUIDES.map(
  ({ extensions, path }) =>
    `If a file you will write or edit ends in ${extensions.join(' or ')}, use the read tool without offset or limit to load the exact matching guide at ${path} in full.`,
).join('\n');

export const GUIDELINES_REMINDER = `${GUIDELINES_REMINDER_HEADING}
Before the first write or edit in each agent run, use the read tool without offset or limit to load ${GUIDELINE_SKILL_PATH} in full.
${LANGUAGE_GUIDE_REMINDERS}
A required read counts only when it succeeds without truncation. Until all required reads succeed, do not call write or edit and do not mutate files through bash or another tool; the extension blocks those mutations.
After changing files, review the code against the loaded guide and run the relevant formatter, linter, type checks, and tests.`;

export function appendGuidelinesReminder(systemPrompt: string): string {
  if (systemPrompt.includes(GUIDELINES_REMINDER_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return GUIDELINES_REMINDER;
  }
  return `${systemPrompt}\n\n${GUIDELINES_REMINDER}`;
}
