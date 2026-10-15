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
- `extensions/guidelines/index.ts` registers `sideroom_guidelines` and composes
  the reminder, read gate, and review steer; it appends a short write/edit
  reminder and resets both read and review state on `session_start`.
- `extensions/guidelines/execute.ts` loads complete packaged documents;
  `catalog.ts` owns their paths and shared language selection; `guard.ts`
  accepts complete final tool deliveries or full reads and blocks missing
  documents. The tool is `model-only`, requiring Pi 1.2.0 or later.
- `extensions/guidelines/prompt.ts` owns the reminder text and idempotent append.
- `extensions/guidelines/review.ts` owns the end-of-turn review steer: arms on a
  successful `write`/`edit`, fires once on `agent_before_settle`, and resets on
  idle interactive `input` and `session_start`.
- `extensions/shared/settle.ts` owns the end-of-run rules review, checks, and the
  walkthrough offer share: stage priority through Pi's synchronous event bus, when a settle boundary accepts a steer, how to
  append a hidden steer without dropping another handler's entries, and which
  `input` opens a new user turn.
- `extensions/monorepo-skills/index.ts` composes trusted child-folder skill
  discovery; `extensions/monorepo-skills/scan.ts` owns the bounded,
  ignore-aware walk and Pi-compatible location rules;
  `extensions/monorepo-skills/flags.ts` owns the CLI disable check; and
  `extensions/monorepo-skills/prompt.ts` owns the static location-preference
  note.
- `extensions/jev/index.ts` composes the optional Jev review: it resolves the
  key, and registers the guard, the `F10` capture screen, and the footer
  status. The guard counts the calls made in the active session; the footer and
  the capture screen show that count.
- `extensions/jev/client.ts` owns the single call to the Jev endpoint, the
  status-to-failure map, and the injectable transport; `extensions/jev/model.ts`
  owns the wire shapes, evidence-based questions, byte budget, cutoff, and note text;
  `extensions/jev/workflow.ts` owns validated questionnaire and completion
  requests and bounded per-turn evidence; `extensions/jev/context.ts` owns bounded, ignore-aware related-source selection;
  `extensions/jev/key.ts` owns environment-first key resolution and the
  owner-only config file; `extensions/jev/guard.ts` owns the events, the
  filters, dedup, the circuit breaker, the rate-limit pause, the session call
  count, and the fail-open paths; `extensions/jev/ui.ts` owns the masked
  capture screen and the footer labels.
- `extensions/shared/review-note.ts` owns the `sideroom:review-note` event Jev
  emits and the guidelines review collects.
- `extensions/rules/index.ts` composes the guidelines rule gate;
  `extensions/rules/catalog.ts` owns rule severities and language detection;
  `extensions/rules/model.ts` owns added-line diffing and result formatting;
  `extensions/rules/checks.ts` owns the per-rule detectors;
  `extensions/rules/guard.ts` owns blocking, warning notes, and the circuit
  breaker.
- `extensions/done/index.ts` composes the finish gate; `extensions/done/detect.ts`
  owns per-ecosystem check-command detection; `extensions/done/guard.ts` owns
  run state and steering.
- `extensions/persona/index.ts` composes the single built-in voice and the
  footer's per-run counts; `extensions/persona/catalog.ts` owns the voice rules and hard
  prohibitions, `extensions/persona/checks.ts` owns the detectors,
  `extensions/persona/guard.ts` owns artifact blocking and the prose steer.
- `extensions/explain/index.ts` composes the end-of-work walkthrough offer;
  `extensions/explain/model.ts` owns its turn state, file threshold, offer
  decision, and trigger, `extensions/explain/guard.ts` owns the event wiring.
- `extensions/shared/file-path.ts` owns file-tool path resolution shared by
  guards that must match Pi's built-in `write` and `edit` semantics;
  `extensions/shared/read-file.ts` owns the missing-file read those guards share.
- `extensions/visual-context/index.ts` composes `F7` browser pairing, pending
  element review, idle interactive input attachment, and session cleanup.
  `bridge.ts` owns Pi registration, reconnection and broker takeover;
  `broker.ts` owns authenticated local routing; `envelope.ts` owns the
  websocket envelope both sides send and parse; `pairing.ts` owns atomic global
  installation identity, outside the target repository. `model.ts` owns the
  bounded DOM protocol and context text; `match.ts` owns candidate scoring and
  source locations; `source.ts` owns the bounded, ignore-aware walk and hash
  validation in operation-local batches; `session.ts` owns branch snapshots
  and one-time consumption; `dialogs.ts` owns F7 option rendering and answer
  decoding without changing session state; `ui.ts` owns the compact widget and
  companion path.
  `setup.ts` registers `sideroom_visual_setup` and prepares configuration edits;
  `projects.ts` owns bounded child-project discovery and package-manager detection;
  `configure.ts` owns conservative configuration patches; `compiler-config.ts`
  owns framework and compiler package contracts and renders development-only
  metadata integrations; `files.ts` owns the shared path and ignore policy,
  reused only within one synchronous operation. The parent applies requested setup through
  normal Pi read/edit/bash tools so mutation guards and checks still apply.
  `assets/visual-context/browser/` is the bundled browser companion;
  `destinations.js` owns destination choice without browser dependencies,
  `background.js` owns connections and per-selection receipts, and `content.js`
  owns capture and inspector cleanup. New browser modules must also enter the
  explicit list in `scripts/browser-package/archive.mjs`. Basic matching
  requires no project changes. Explicitly requested compiler setup may add a
  development dependency and build configuration, never Sideroom state or a local
  harness. Compiler locations are checked against local markup; inferred locations
  remain candidates and browser metadata never proves a matching build revision.
- `scripts/render-preview.mjs` is the entry that renders `media/preview.png`
  and `media/preview.mp4`, the gallery's `pi.image` and `pi.video`.
  `scripts/preview/` holds the pipeline: `ansi.mjs` turns SGR and OSC 8 into
  styled runs, `theme.mjs` owns pi's dark palette, `svg.mjs` owns panel geometry
  and serialization, `ffmpeg.mjs` is the external tool boundary, `scenes.mjs`
  owns the demo and drives the widgets, and `media-manifest.mjs` owns the
  manifest contract that every run asserts. Pure modules carry `*.test.mjs`. It
  needs ffmpeg; it is a maintainer tool, not an extension and not a wrapper
  around Pi.
- `scripts/package-browser.mjs` builds the browser ZIP and checksum in
  `dist/browser/`; `scripts/browser-package/archive.mjs` owns the explicit file
  list and reproducible archive, with `archive.test.mjs` checking its contents.
  `.github/workflows/release.yml` attaches it after Changesets publishes;
  `.github/workflows/browser-download.yml` retries assets from an existing tag
  without publishing npm again.
- `scripts/cache-report.mjs` prints how many prompt tokens each recorded session
  re-sent and how much of that followed a work-board update. `scripts/cache-report/parse.mjs`
  reads Pi's session JSONL, `report.mjs` formats the totals and the per-session
  rows. Pure modules carry `*.test.mjs`. It reads session files and writes
  nothing; it is a maintainer tool.
- `skills/sideroom-guidelines/SKILL.md` owns the Do/Don't table and language map;
  `skills/sideroom-guidelines/references/languages/` owns complete per-language guides.
- `skills/sideroom-persona/SKILL.md` owns the persona Do/Don't table, the
  plain-language bar, and the enforcement boundaries.
- `extensions/persona/execute.ts` returns that complete packaged guide;
  `extensions/shared/skills.test.ts` checks packaged discovery with Pi's loader.
- `docs/skills.md` owns skill selection boundaries and manual behavior checks.
- `skills/sideroom-visual-setup/SKILL.md` owns the requested compiler-context setup
  workflow, portable runtime paths, and browser verification. It reuses the
  configuration plan from `sideroom_visual_setup` without duplicating compiler code.
- `skills/sideroom-codebase-design/SKILL.md` owns codebase improvement reviews,
  module design, and incremental migration; `references/growth.md` assesses
  behavior, team, and workload growth without graphic reports.

- `site/astro.config.mjs` fixes the origin and the base path of the GitHub
  Pages project page; `site/src/lib/urls.ts` derives every absolute address and
  every in-page href from them, and `site/src/lib/crawl.ts` renders `robots.txt`
  and the sitemap from the same origin.
- `site/src/lib/schema.ts` builds the `SoftwareApplication` JSON-LD;
  `site/src/layouts/Layout.astro` owns the head, the masthead and the colophon;
  `site/src/i18n/` owns both dictionaries and the language tags;
  `site/src/components/` and `site/src/pages/` hold the landing and policy
  pages; `site/src/styles/site.css` is the whole stylesheet.
- `site/src/lib/board.ts` is the board display model, tested by
  `site/src/lib/board.test.ts`; `site/src/lib/batch.ts` and
  `site/src/lib/languages.ts` hold the question-batch model and the language
  catalogue the page prints.
- `site/public/` holds the published icons, the link card and the web manifest,
  all derived from the source art in `media/`.
- `DESIGN.md` owns the site's design system: palette, type scale, components and
  the rules that decide them. `PRODUCT.md` owns the product brief: platform,
  users, positioning, brand commitments and the evidence on hand.
- `CONTRIBUTING.md` owns the contributor contract: setup, commands, design
  rules, commit and branch conventions, the changeset requirement, the extension
  recipe, and how to report an issue.
- `.github/ISSUE_TEMPLATE/` owns the issue forms and the contact links;
  `.github/pull_request_template.md` owns the pull request checklist, and
  `.github/workflows/site.yml` checks `site/` and deploys it to GitHub Pages.
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

The site in `site/` has its own `package.json`: `cd site && npm install`, then
`npm run check` for its own gate, `npm run dev` to serve it locally, and
`npm run build` for the published files.

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
- Visual compiler setup is opt-in for one explicitly selected project. Prepare
  returns edits and installation commands without applying them; the parent agent
  uses normal file and shell tools. Origin-to-project associations live only on
  the Pi session branch, including when Pi runs in a parent folder.
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
- `guidelines` injects a short reminder and blocks `write`/`edit` until
  `sideroom_guidelines` or exact full-file reads load the packaged skill body
  and, for supported targets, the complete language guide. Only successful,
  complete tool delivery counts; loaded documents and pending receipts reset
  on `session_start`, `before_agent_start`, and `session_compact`. After any successful
  mutation it appends one hidden review steer on `agent_before_settle`, at most
  once per turn, asking the agent to review only changes introduced by the run against the
  loaded guide without omitting requirements or refactoring unrelated code and run the project checks. Do not add a slash command or a
  writer subagent.
- `sideroom_rules` checks only lines added by a `write`/`edit`, blocks braceless
  conditionals and swallowed errors, notes softer violations on the result, and
  degrades a repeatedly firing block. It writes no files and reads no project
  config; the catalog ships with the package.
- `jev` is an optional semantic review using `fetch` and the existing `ignore`
  dependency. It asks one decision model about guide rules 3, 4, 7–14, and 17–20, plus visible test quality and
  consumer compatibility when supported by visible evidence, and emits each finding on
  `sideroom:review-note` for the guidelines review to carry in its end-of-run
  steer, never on the tool result. It never blocks or reaches the system prompt,
  and reviews project source changes that add lines, successful non-cancelled
  questionnaires, and targeted newly completed tasks. Workflow requests send
  validated question wording without answers, or completion descriptions with
  up to four observed changed files and a detected check status, never logs or
  conversation history. Notes alone may arm the end-of-run review. It sends the changed file, its added lines and up to four directly
  related, non-ignored source files with relative paths; hidden, symlinked,
  sensitive-named and out-of-project paths are excluded. It uses conservative
  32,000-byte state-plus-question and 64,000-byte request limits, keeps files
  whole, and omits questions without the evidence they require. It follows the
  run's abort signal, pauses on `429` until the next idle prompt, stops calling
  on quota or a rejected key, and does nothing at all without a key. The key
  comes from `TYPESAFE_API_KEY` or from `getAgentDir()/sideroom.json` at mode
  `0600`, captured through `F10` and never written to the session. The call
  count is per session, resets on `session_start`, and is never persisted.
- `sideroom_persona` is a single built-in voice: no profiles, no switching, no
  persisted profile state. A `write`/`edit` whose added lines contain a decorative symbol
  is blocked and degrades after repeated fires; the other prohibitions are
  steered, capped per run. The footer shows the run's block and steer counts and
  drops back to `persona: direct` on the next `before_agent_start`.
- `explain` offers a walkthrough through `sideroom_ask` at most once per turn,
  only after successful `write`/`edit` results touched at least five distinct
  files, and only in the TUI. It fires on `agent_before_settle`, never
  `agent_end`, so the offer never lands on work that a retry or a compaction is
  about to redo. The shared settle guard gives review and checks priority over
  the offer in every extension load order, including late semantic notes. It
  has no tool and no persisted state.
- End-of-run steers go on `agent_before_settle` as `custom_message` entries
  with `continue: true`, never through `sendMessage` on `agent_settled`.
  `agent_settled` is notification-only: a steer there opens a second run after
  the user saw the agent stop, and it fires after Escape too. Skip the steer
  when the outcome is not `completed`, any message is pending, or an earlier
  handler already requested continuation; leave postponed state armed, keep the
  entries earlier handlers proposed, and reset turn state only on `input` that
  arrives while the agent is idle. The package requires Pi 1.2.0 or later,
  including `model-only` tool exposure for guidelines.
- `sideroom_done` steers only at `agent_before_settle` after pending review,
  never at `turn_end`; it never blocks, and does nothing when no check command
  is detected. It clears green after any later successful mutation, asks once
  per user turn whether existing tests cover code-only changes, and caps its
  steering.
  State resets only on idle user input and `session_start`.
