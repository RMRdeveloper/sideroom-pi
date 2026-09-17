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
- `extensions/todo/session.ts` reconstructs, snapshots, refreshes the widget, and
  sends the board block as a session message.
- `extensions/todo/guards.ts` owns skip-prevention steers.
- `extensions/todo/model.ts` owns the board schema, normalization, patches, and
  state invariants; `extensions/todo/ui.ts` owns its display-only widget, the
  five-row cap, the hidden-row hint, and the `F9` overlay.
- `extensions/modified-files/index.ts` composes successful edit/write tracking,
  session restoration, and the `F8` view.
- `extensions/modified-files/session.ts` owns snapshots and widget refreshes;
  `extensions/modified-files/ui.ts` owns the compact and extended displays.
- `extensions/guidelines/index.ts` appends a short write/edit reminder.
- `extensions/guidelines/prompt.ts` owns the reminder text and idempotent append.
- `extensions/monorepo-skills/index.ts` composes trusted child-folder skill
  discovery; `extensions/monorepo-skills/scan.ts` owns the bounded,
  ignore-aware walk and Pi-compatible location rules;
  `extensions/monorepo-skills/flags.ts` owns the CLI disable check; and
  `extensions/monorepo-skills/prompt.ts` owns the static location-preference
  note.
- `extensions/rules/index.ts` composes the guidelines rule gate;
  `extensions/rules/catalog.ts` owns rule severities and language detection;
  `extensions/rules/model.ts` owns added-line diffing and result formatting;
  `extensions/rules/checks.ts` owns the per-rule detectors;
  `extensions/rules/guard.ts` owns blocking, warning notes, and the circuit
  breaker.
- `extensions/done/index.ts` composes the finish gate; `extensions/done/detect.ts`
  owns per-ecosystem check-command detection; `extensions/done/guard.ts` owns
  run state and steering.
- `extensions/persona/index.ts` composes the single built-in voice and its
  status; `extensions/persona/catalog.ts` owns the voice rules and hard
  prohibitions, `extensions/persona/checks.ts` owns the detectors,
  `extensions/persona/guard.ts` owns artifact blocking and the prose steer.
- `extensions/explain/index.ts` composes the end-of-work walkthrough offer;
  `extensions/explain/model.ts` owns its turn state, file threshold, and
  trigger, `extensions/explain/guard.ts` owns the event wiring.
- `extensions/shared/file-path.ts` owns file-tool path resolution shared by
  guards that must match Pi's built-in `write` and `edit` semantics.
- `scripts/render-preview.mjs` is the entry that renders `media/preview.png`
  and `media/preview.mp4`, the gallery's `pi.image` and `pi.video`.
  `scripts/preview/` holds the pipeline: `ansi.mjs` turns SGR and OSC 8 into
  styled runs, `theme.mjs` owns pi's dark palette, `svg.mjs` owns panel geometry
  and serialization, `ffmpeg.mjs` is the external tool boundary, `scenes.mjs`
  owns the demo and drives the widgets, and `media-manifest.mjs` owns the
  manifest contract that every run asserts. Pure modules carry `*.test.mjs`. It
  needs ffmpeg; it is a maintainer tool, not an extension and not a wrapper
  around Pi.
- `scripts/cache-report.mjs` prints how many prompt tokens each recorded session
  re-sent and how much of that followed a work-board update. `scripts/cache-report/parse.mjs`
  reads Pi's session JSONL, `report.mjs` formats the totals and the per-session
  rows. Pure modules carry `*.test.mjs`. It reads session files and writes
  nothing; it is a maintainer tool.
- `skills/sideroom-guidelines/SKILL.md` owns the Do/Don't table and language map;
  `skills/sideroom-guidelines/references/languages/` owns complete per-language guides.
- `skills/sideroom-persona/SKILL.md` owns the persona Do/Don't table, the
  plain-language bar, and the enforcement boundaries.

- `CONTRIBUTING.md` owns the contributor contract: setup, commands, design
  rules, commit and branch conventions, the changeset requirement, the extension
  recipe, and how to report an issue.
- `.github/ISSUE_TEMPLATE/` owns the issue forms and the contact links;
  `.github/pull_request_template.md` owns the pull request checklist.
- `CODE_OF_CONDUCT.md` owns community standards; `SECURITY.md` owns supported
  versions and private vulnerability reporting.

Add a tool by creating `extensions/<name>/index.ts`. Pi discovers
`extensions/*/index.ts`; helper files in that folder are not extensions. Test
files live in a subdirectory, never directly in `extensions/`, because Pi loads
every top-level `.ts` file there and running a test file at startup would fire
its `node:test` cases. `pi.extensions` also excludes `extensions/*.test.ts`.

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
- No extension may make the system prompt depend on per-turn session state.
  Per-turn context travels as a session message, so the composed system prompt
  stays byte-identical while a session runs and the provider's cached prefix
  survives. `extensions/shared/prompt-cache.test.ts` enforces this.
- `monorepo-skills` contributes trusted `.pi/skills` and `.agents/skills` from
  child folders through `resources_discover`, at most three levels below Pi's
  working directory. It respects ignore files and `--no-skills`, leaves name
  collisions to Pi, writes no state, and adds no tool or command.
- `sideroom_todo` is a display-only work board. Its compact widget shows at
  most five rows, open items first, and `F9` opens the read-only overlay. The
  cap never reaches the board block. Send that block on `before_agent_start` as
  a session message, only when it changed, so the system prompt stays stable for
  prompt caching; queue it again immediately when automatic compaction retries
  an interrupted turn. `propose` replaces the board and is
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
- `sideroom_persona` is a single built-in voice: no profiles, no switching, no
  persisted profile state. A `write`/`edit` whose added lines contain a decorative symbol
  is blocked and degrades after repeated fires; the other prohibitions are
  steered, capped per run.
- `explain` offers a walkthrough through `sideroom_ask` at most once per turn,
  only after successful `write`/`edit` results touched at least five distinct
  files, and only in the TUI. It fires on `agent_settled`, never `agent_end`, so
  the offer never lands on work that a retry or a compaction is about to redo.
  It has no tool and no persisted state.
- `sideroom_done` steers, never blocks, and does nothing when no check command
  is detected. It clears green after any later successful mutation, notes once
  per run when code files changed and no test file did, and caps its steering.
