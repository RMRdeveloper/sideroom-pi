export const MONOREPO_SKILLS_NOTE_HEADING = 'Sideroom monorepo skills:';

export const MONOREPO_SKILLS_NOTE = `${MONOREPO_SKILLS_NOTE_HEADING}
Some available skills come from child folders of this repository. When skills cover the same work, prefer the skill whose location is inside the folder you are editing.`;

export function appendMonorepoSkillsNote(systemPrompt: string): string {
  if (systemPrompt.includes(MONOREPO_SKILLS_NOTE_HEADING)) {
    return systemPrompt;
  }
  if (systemPrompt.length === 0) {
    return MONOREPO_SKILLS_NOTE;
  }
  return `${systemPrompt}\n\n${MONOREPO_SKILLS_NOTE}`;
}
