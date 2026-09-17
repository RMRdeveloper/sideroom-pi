import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { areSkillsDisabled } from './flags.ts';
import { appendMonorepoSkillsNote } from './prompt.ts';
import { findMonorepoSkillPaths } from './scan.ts';

// Pi loads extensions/*/index.ts through export default.
export default function registerMonorepoSkills(pi: ExtensionAPI): void {
  let hasMonorepoSkills = false;

  pi.on('resources_discover', (event, ctx) => {
    hasMonorepoSkills = false;
    if (!ctx.isProjectTrusted() || areSkillsDisabled(process.argv)) {
      return;
    }

    const skillPaths = findMonorepoSkillPaths(event.cwd);
    if (skillPaths.length === 0) {
      return;
    }

    hasMonorepoSkills = true;
    return { skillPaths };
  });

  pi.on('before_agent_start', (event) => {
    if (!hasMonorepoSkills) {
      return;
    }

    const systemPrompt = appendMonorepoSkillsNote(event.systemPrompt);
    if (systemPrompt === event.systemPrompt) {
      return;
    }
    return { systemPrompt };
  });
}
