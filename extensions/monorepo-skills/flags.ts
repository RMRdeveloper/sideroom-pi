const END_OF_OPTIONS = '--';
const NO_SKILLS_FLAGS = new Set(['--no-skills', '-ns']);

export function areSkillsDisabled(argv: readonly string[]): boolean {
  const endOfOptions = argv.indexOf(END_OF_OPTIONS);
  const optionArguments =
    endOfOptions === -1 ? argv : argv.slice(0, endOfOptions);
  return optionArguments.some((argument) => NO_SKILLS_FLAGS.has(argument));
}
