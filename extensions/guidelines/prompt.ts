export const GUIDELINES_REMINDER_HEADING =
  'Sideroom coding guidelines (always-on reminder):';

export const GUIDELINES_REMINDER = `${GUIDELINES_REMINDER_HEADING}
Before the first write or edit in each agent run, use the read tool without offset or limit on the absolute SKILL.md path shown for sideroom-guidelines in Available Skills.
For .java, .php, .ts/.tsx, .py, .go, or .rs targets, also fully read exactly the matching guide under that skill's references/languages/ directory.
The extension blocks write/edit until those exact full-file reads succeed. Do not bypass the gate with bash or another mutation tool.
Before finishing, review changed code against the loaded guide and run the relevant formatter, linter, type checks, and tests.`;

export const LANGUAGE_GUIDE_FILES = [
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
