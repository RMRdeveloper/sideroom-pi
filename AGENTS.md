# AGENTS.md

## Scope

Sideroom is a global Pi package. Each tool lives in `extensions/<name>/` with
`index.ts` as the Pi entry (`export default`). Do not add a slash command, a
standalone CLI, project-local harness files, or a subprocess wrapper around Pi.

`assets/artifacts/GUIDELINES_TEMPLATE.md` is an unwired seed for later product
work. Do not load it into a tool.

## Source of truth

- `extensions/ask/index.ts` registers `sideroom_ask`.
- `extensions/ask/execute.ts` runs one questionnaire batch.
- `extensions/ask/model.ts` owns the schema and answer contract.
- `extensions/ask/ui.ts` owns the TUI: questionnaire tabs, required
  recommendation, always-on Out of scope, and a custom answer.
- `extensions/todo/index.ts` registers `sideroom_todo` and composes its
  collaborators.
- `extensions/todo/execute.ts` prepares propose/update results without
  mutating the store.
- `extensions/todo/session.ts` reconstructs, snapshots, refreshes the widget,
  and injects the compact board.
- `extensions/todo/guards.ts` owns skip-prevention steers.
- `extensions/todo/model.ts` owns the board schema, normalization, patches, and
  state invariants; `extensions/todo/ui.ts` owns its display-only widget.
- `extensions/modified-files/index.ts` composes successful edit/write tracking,
  session restoration, and the `F8` view.
- `extensions/modified-files/session.ts` owns snapshots and widget refreshes;
  `extensions/modified-files/ui.ts` owns the compact and extended displays.

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
- `sideroom_todo` is a display-only work board. `propose` replaces it and is
  TUI-only; `update` patches ids in every mode. Persist snapshots with
  `appendEntry`, reconstruct from `getBranch()`, and never take over
  `session_before_compact` or add `/todos`.
- `modified-files` tracks only successful Pi `write` and `edit` results in the
  current session. Its compact widget shows at most five paths and must
  reapply after `sideroom:todo-widget-refreshed` so it remains below the board.
