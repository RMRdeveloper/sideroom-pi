export const GUIDELINES_REMINDER_HEADING =
  'Sideroom coding guidelines (always-on reminder):';

export const GUIDELINES_REMINDER = `${GUIDELINES_REMINDER_HEADING}
Before write or edit, read the sideroom-guidelines skill.
Apply its Do/Don't table. If the path is .java, .php, .ts/.tsx, .py, .go, or .rs, also read that language file under the skill's references/languages/.
Do not load other language files.`;

export const LANGUAGE_DELTA_FILES = [
  'go.md',
  'java.md',
  'php-laravel.md',
  'python.md',
  'rust.md',
  'typescript.md',
] as const;

export function appendGuidelinesReminder(systemPrompt: string): string {
  if (systemPrompt.includes(GUIDELINES_REMINDER_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return GUIDELINES_REMINDER;
  }
  return `${systemPrompt}\n\n${GUIDELINES_REMINDER}`;
}
