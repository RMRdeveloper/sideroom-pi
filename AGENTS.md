# AGENTS.md

## Scope

Sideroom is a global Pi package. Each tool lives in `extensions/<name>/` with
`index.ts` as the Pi entry (`export default`). Do not add a slash command, a
standalone CLI, project-local harness files, or a subprocess wrapper around Pi.

`assets/artifacts/GUIDELINES_TEMPLATE.md` is an unwired seed for later product
work. Do not load it into a tool.

## Source of truth

- `extensions/ask/index.ts` registers `sideroom_ask`.
- `extensions/ask/model.ts` owns the schema and answer contract.
- `extensions/ask/ui.ts` owns the TUI: questionnaire tabs, required
  recommendation, always-on Out of scope, and a custom answer.

Add a tool by creating `extensions/<name>/index.ts`. Pi discovers
`extensions/*/index.ts`; helper files in that folder are not extensions.

## Commands

```bash
npm install
npm run types
npm run lint
npm run format:check
npm test
npm run check
npm run changeset
npm run changeset:status
npm run version-packages
```

Use Biome; do not add ESLint or Prettier. Conventional Commits. Node 22.19 or
later. Release only through Changesets on protected `main`. Never publish
locally.

Biome requires braces around every `if` body. Do not disable
`style/useBlockStatements`. Follow `assets/artifacts/GUIDELINES_TEMPLATE.md`.

## Design rules

- `sideroom_ask` is a normal parent-agent tool. One call is one 1–N batch.
- Each question requires `recommendationIndex`. The UI always adds Out of scope
  and a custom answer; callers must not send those rows.
- Non-TUI calls fail with an explicit UI-not-available error.
- The tool must not write Sideroom state into the target repository.
