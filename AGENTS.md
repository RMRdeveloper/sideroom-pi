# AGENTS.md

## Scope

Sideroom is a global Pi package. Each tool lives in `extensions/<name>/` with
`index.ts` as the Pi entry (`export default`). Do not add a slash command, a
standalone CLI, project-local harness files, or a subprocess wrapper around Pi.

`assets/artifacts/GUIDELINES_TEMPLATE.md` is the canonical seed. Do not dump
it into the system prompt. `extensions/guidelines/` injects a short reminder;
`skills/sideroom-guidelines/` is the on-demand checklist and complete language guides.

## Source of truth

- `extensions/ask/index.ts` registers `sideroom_ask`.
- `extensions/ask/execute.ts` runs one questionnaire batch.
- `extensions/ask/model.ts` owns the schema, answer contract, and selection
  modes.
- `extensions/ask/selection.ts` owns the multiple-selection reducer: toggling
  option indexes and building the answer.
- `extensions/ask/ui.ts` owns the TUI: questionnaire tabs, required
  recommendation, multiple-selection checkboxes, always-on Out of scope, and a
  custom answer.
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
- `extensions/guidelines/index.ts` appends a short write/edit reminder.
- `extensions/guidelines/prompt.ts` owns the reminder text and idempotent append.
- `extensions/rules/index.ts` composes the guidelines rule gate;
  `extensions/rules/catalog.ts` owns rule severities and language detection;
  `extensions/rules/model.ts` owns added-line diffing and result formatting;
  `extensions/rules/checks.ts` owns the per-rule detectors;
  `extensions/rules/guard.ts` owns blocking, warning notes, and the circuit
  breaker.
- `extensions/done/index.ts` composes the finish gate; `extensions/done/detect.ts`
  owns per-ecosystem check-command detection; `extensions/done/guard.ts` owns
  run state and steering.
- `scripts/render-preview.mjs` is the entry that renders `media/preview.png`
  and `media/preview.mp4`, the gallery's `pi.image` and `pi.video`.
  `scripts/preview/` holds the pipeline: `ansi.mjs` turns SGR and OSC 8 into
  styled runs, `theme.mjs` owns pi's dark palette, `svg.mjs` owns panel geometry
  and serialization, `ffmpeg.mjs` is the external tool boundary, `scenes.mjs`
  owns the demo and drives the widgets, and `media-manifest.mjs` owns the
  manifest contract that every run asserts. Pure modules carry `*.test.mjs`. It
  needs ffmpeg; it is a maintainer tool, not an extension and not a wrapper
  around Pi.- `skills/sideroom-guidelines/SKILL.md` owns the Do/Don't table and language map;
  `skills/sideroom-guidelines/references/languages/` owns complete per-language guides.

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
npm run preview
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
- Each question requires `recommendationIndex`, or `recommendedIndices` when it
  declares `selectionMode: "multiple"`. The UI always adds Out of scope and a
  custom answer; callers must not send those rows.
- Write `sideroom_ask` prompts, tab labels, and option labels or descriptions
  in the language the user is speaking. Keep ids, option values, and source in
  English. TUI chrome stays English.
- Non-TUI calls fail with an explicit UI-not-available error.
- The tool must not write Sideroom state into the target repository.
- `sideroom_todo` is a display-only work board. `propose` replaces it and is
  TUI-only; `update` patches ids in every mode. Persist snapshots with
  `appendEntry`, reconstruct from `getBranch()`, and never take over
  `session_before_compact` or add `/todos`.
- `modified-files` tracks only successful Pi `write` and `edit` results in the
  current session. Its compact widget shows at most five paths and must
  reapply after `sideroom:todo-widget-refreshed` so it remains below the board.
- `guidelines` injects a short reminder and blocks `write`/`edit` until exact
  full-file reads load the packaged skill body and one complete language guide. Do not add a slash
  command or a writer subagent.
- `sideroom_rules` checks only lines added by a `write`/`edit`, blocks braceless
  conditionals and swallowed errors, notes softer violations on the result, and
  degrades a repeatedly firing block. It writes no files and reads no project
  config; the catalog ships with the package.
- `sideroom_done` steers, never blocks, and does nothing when no check command
  is detected. It clears green after any later successful mutation and caps its
  steering.
