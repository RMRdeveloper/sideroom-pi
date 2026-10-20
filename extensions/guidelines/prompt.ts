import { GUIDELINE_SKILL_PATH, LANGUAGE_GUIDES } from './catalog.ts';

export { LANGUAGE_GUIDE_FILES } from './catalog.ts';

export const GUIDELINES_REMINDER_HEADING =
  'Sideroom coding guidelines (always-on reminder):';

const LANGUAGE_GUIDE_INDEX = LANGUAGE_GUIDES.map(
  ({ extensions, path }) => `${extensions.join('/')} ${path}`,
).join('; ');

export const GUIDELINES_REMINDER = `${GUIDELINES_REMINDER_HEADING}
Before write or edit, call sideroom_guidelines with the target path. Reuse loaded guides in this run; reload after compaction. Alternatively, use the read tool without offset or limit to load in full:
- ${GUIDELINE_SKILL_PATH}
- for the extension of the file you will change, one of: ${LANGUAGE_GUIDE_INDEX}
Only successful loads without truncation count. Until all required documents are loaded, do not call write or edit and do not mutate files through bash or another tool; the extension blocks those mutations.`;

export function appendGuidelinesReminder(systemPrompt: string): string {
  if (systemPrompt.includes(GUIDELINES_REMINDER_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return GUIDELINES_REMINDER;
  }
  return `${systemPrompt}\n\n${GUIDELINES_REMINDER}`;
}
