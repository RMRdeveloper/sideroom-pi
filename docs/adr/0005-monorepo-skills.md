# 0005. Discover monorepo child-folder skills

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

Pi 0.84.4 discovers project `.pi/skills` only from its working directory and
project `.agents/skills` from that directory and its ancestors. It never walks
down into child folders. Starting Pi at a monorepo root therefore leaves skills
under folders such as `api/`, `web/`, and `mobile-app/` outside the available
skill list.

Pi exposes `resources_discover` after `session_start`. An extension can return
additional skill paths there, after project trust has resolved and before the
system prompt is rebuilt. Those paths are appended after Pi's normal resources,
so they cannot override a root-project or user skill with the same name.

Pi's two project skill locations also have different file rules. `.pi/skills`
accepts root Markdown skills and nested `SKILL.md` folders. `.agents/skills`
ignores root Markdown files, accepts Markdown skills inside grouping folders,
and stops below a folder that contains `SKILL.md`. Passing the whole
`.agents/skills` directory through the generic path loader reverses the first
two rules.

## Decision

1. Ship a global `monorepo-skills` extension that scans down from Pi's working
   directory. It visits at most three child-folder levels, respects
   `.gitignore`, `.ignore`, and `.fdignore`, skips `node_modules` and hidden
   traversal directories, and does not follow directory symlinks.
2. Return every discovered child `.pi/skills` directory. Enumerate
   `.agents/skills` entries with Pi's location-specific rules and return those
   files instead of the directory.
3. Make precedence deterministic: child-folder paths sort lexically, with
   `.pi/skills` before `.agents/skills` inside one child folder. Duplicate skill
   names remain Pi's responsibility; its startup diagnostics name the winner
   and every skipped path.
4. Add paths only after `ctx.isProjectTrusted()` returns true. Return no paths
   when the CLI arguments contain `--no-skills` or `-ns`, because Pi's own
   `noSkills` filter runs before extension resource paths are added.
5. When at least one monorepo skill is found, append one static, idempotent
   system-prompt note telling the agent to prefer the skill whose location is
   inside the folder being edited. The note stays byte-identical for the
   session and changes only when Pi rebuilds resources.
6. Store no state, write no target-repository files, add no tool or command,
   and add no project configuration. Pin the runtime `ignore` dependency to the
   same 7.0.5 release Pi uses.

## Consequences

- Starting Pi at a monorepo root exposes child-folder skills in TUI, print, and
  RPC modes without per-repository setup.
- Skill bodies remain progressive: Pi puts names, descriptions, and locations
  in the system prompt and reads a body only when the model selects it.
- The system prompt grows with every discovered skill. Six current Sideroom
  skills format to 3,699 characters in Pi 0.85.1, about 150 tokens per skill by
  a four-characters-per-token estimate.
- A root-project or user skill with the same name wins because extension paths
  are appended last. `pi config -l` is the supported way to disable the skill
  that shadows a needed monorepo skill. The extension does not duplicate Pi's
  collision detector.
- Extension-provided skills carry temporary extension provenance rather than
  project provenance and cannot be toggled individually through project
  resource settings.
- `--no-skills` is detected from CLI arguments. A host that disables skills
  through the SDK without exposing that choice in `process.argv` cannot be
  detected by the extension.
- The package gains one small runtime dependency instead of maintaining a
  partial gitignore implementation.

## Alternatives considered

- **List every child skill path in root `.pi/settings.json`.** Rejected: it is
  manual repository configuration and becomes stale as child folders change.
- **Ask which child folder is active.** Rejected: the requirement is simple
  discovery, not session switching or another startup interaction.
- **Pass every `.agents/skills` directory directly.** Rejected: the generic
  path loader accepts root Markdown files and skips grouped Markdown files,
  unlike Pi's own `.agents` discovery.
- **Detect collisions independently.** Rejected: Pi already displays the
  winner and skipped paths, while a second detector would have to mirror Pi's
  evolving user, project, package, and CLI precedence.
- **Scan without a depth limit.** Rejected: it increases startup work and can
  add unrelated skills from deeply nested fixtures or tooling.

## References

- `CONTEXT.md` — *Monorepo child folder*, *Monorepo skill*.
- `docs/extensions/monorepo-skills.md` — discovery, precedence, and limits.
- Pi `docs/skills.md` — project locations and progressive skill loading.
- Pi `dist/core/package-manager.js` — project discovery and location-specific
  skill rules.
- Pi `dist/core/agent-session.js` — `resources_discover` and system-prompt
  rebuild.
