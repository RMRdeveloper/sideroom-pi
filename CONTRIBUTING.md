# Contributing to Sideroom Pi

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages): a
set of extensions and skills that give the parent agent a side room next to
your code. Bug reports, extension ideas, new mechanical rules, language
guides, and documentation fixes are all welcome.

This document is the contributor contract. [`AGENTS.md`](./AGENTS.md) is the
source of truth for paths, tools, and commands; read it before a structural
change. [`docs/README.md`](./docs/README.md) explains how the package loads
in Pi.

## Ways to contribute

| Contribution | Start with |
| --- | --- |
| Bug report | [Bug report issue](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=bug_report.yml) |
| Feature or new extension idea | [Feature request issue](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=feature_request.yml) |
| Code, tests, docs | A pull request against `develop` (see [pull requests](#branches-and-pull-requests)) |
| Security vulnerability | [`SECURITY.md`](./SECURITY.md) — never a public issue |

## Requirements

- Node 22.19 or later. CI runs 22.19 and 24, so both are the supported floor.
- npm and Git.
- A Pi installation to test against (`pi --version`). Pi and `pi-tui` are
  peer dependencies and devDependencies here; `typebox` is a peer dependency.

## Setup

```bash
git clone https://github.com/RMRdeveloper/sideroom-pi.git
cd sideroom-pi
npm install
npm run check
```

`npm run check` must pass on a clean checkout before you start: it is the same
gate CI runs.

### Try your change inside Pi

Run the working copy for a single Pi session without installing it:

```bash
pi -e /absolute/path/to/sideroom-pi
```

Or register the working copy for good — a local path is added to your settings
without copying:

```bash
pi install /absolute/path/to/sideroom-pi
```

If you already installed the published package, remove it first so the local
copy is the only one providing these extensions:

```bash
pi remove npm:@rmrdeveloper/sideroom-pi
```

Extensions run in the Pi process, so the fastest loop is: change a file, restart
Pi, exercise the tool. `sideroom_ask` and `propose` need the interactive TUI;
headless runs fail fast by design.

## Commands

| Command | What it does |
| --- | --- |
| `npm run types` | `tsc --noEmit` over the whole package. |
| `npm run lint` | Biome lint. `npm run lint:fix` writes fixes. |
| `npm run format` | Biome format. `npm run format:check` verifies without writing. |
| `npm test` | `node --test` over `extensions/**/*.test.ts` and `scripts/**/*.test.mjs`. |
| `npm run check` | The gate: types, braces check, Biome check, tests. Run it before every PR. |
| `npm run preview` | Rebuilds `media/preview.png` and `media/preview.mp4`. Needs ffmpeg; maintainer tool. |
| `npm run changeset` | Creates a changeset (see [Changesets](#changesets)). |
| `npm run changeset:status` | Shows which packages and bumps the pending changesets produce. |

Use Biome. Do not add ESLint, Prettier, or a competing formatter.

## Layout

| Path | Holds |
| --- | --- |
| `extensions/` | One folder per tool. `extensions/<name>/index.ts` is the Pi entry point; helper files in that folder are not extensions. |
| `skills/` | The packaged skills, including the language guides under `sideroom-guidelines/references/languages/`. |
| `assets/artifacts/GUIDELINES_TEMPLATE.md` | Canonical seed for the guidelines rules. Never pasted into the system prompt. |
| `scripts/` | Maintainer tooling, including the preview renderer. |
| `docs/` | Architecture, one page per extension, and the ADRs. |
| `media/` | Gallery previews referenced by the `pi` manifest. |

Read [`docs/architecture.md`](./docs/architecture.md) before touching the Pi
lifecycle events, session persistence, widget ordering, or steering.

## Design rules

These are not style preferences; a change that breaks one is rejected.

- The tools never write Sideroom state into the repository they run in. Board
  and edited-file history live in the Pi session branch.
- No slash commands, no standalone CLI, no subprocess wrapper around Pi, no
  project-local harness files. A tool is an extension, and Pi discovers it from
  `extensions/*/index.ts`.
- One `sideroom_ask` call is one 1–N question batch. Each question requires
  `recommendationIndex`, or `recommendedIndices` with
  `selectionMode: "multiple"`. Callers never send *Out of scope* or a custom
  answer — the UI always adds them.
- Non-TUI modes fail with an explicit UI-not-available error instead of hanging.
- `sideroom_todo` is a display-only board. The compact widget caps at five rows;
  the cap never reaches the injected system prompt. `propose` is TUI-only and
  `update` patches ids everywhere.
- `modified-files` tracks only successful `write`/`edit` results and reapplies
  its widget after `sideroom:todo-widget-refreshed` so it stays below the board.
- `guidelines` injects a short reminder and blocks mutation until the packaged
  skill and the matching language guide were read in full.
- `sideroom_rules` checks only the lines a mutation adds, and a repeatedly
  firing block degrades to a warning instead of dead-locking the agent.
- `sideroom_done` steers, never blocks, and stays silent when it cannot detect a
  check command.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), checked by
commitlint. Use the tool or area as the scope:

```text
feat(todo): cap the board widget at five rows
fix(done): match check commands only across safe && chains
docs(readme): document the board row cap and the F9 overlay
```

Common scopes: `ask`, `todo`, `modified-files`, `guidelines`, `rules`, `done`,
`skills`, `scripts`, `packaging`, `docs`, `ci`, `deps`, `release`.

The repository ships `.husky/pre-commit` and `.husky/commit-msg`, but husky is
not a dependency and those hooks only run when your local Git points
`core.hooksPath` at `.husky/_`. Treat them as a convenience: CI runs
`npm run check`, and conventional commits are enforced in review.

## Branches and pull requests

- Branch from `develop`, not from `main`: `feat/todo-multi-select`,
  `fix/rules-brace-detection`, `docs/contributing-guide`.
- Open the pull request against `develop`.
- Keep it focused. No drive-by reformatting, no unrelated refactors, no
  version bumps.
- CI must be green on Node 22.19 and 24. `npm run check` is the only required
  job, and it runs on every pull request.
- `develop` → `main` happens as a pull request once there is something worth
  publishing. `main` is protected and always release-ready; never push to it.
- Merging to `main` triggers the Release workflow, which opens or updates a
  version pull request and publishes only when that version pull request is
  merged. Never publish from a local machine.

## Changesets

Every change that affects the published package needs a changeset, authored in
the same pull request by whoever opened it:

```bash
npm run changeset
```

Choose the bump — `patch` for a fix, `minor` for a new capability, `major` for
a breaking contract change — and write a summary aimed at users, not at
reviewers.

Files outside the published set (`docs/`, `.github/`, `media/`, `SECURITY.md`,
this file) need no changeset; `files` in `package.json` is the exact published
list. Never edit `CHANGELOG.md` by hand — `npm run version-packages` owns it.

## Adding an extension

1. Create `extensions/<name>/index.ts` and `export default` the extension.
   Pi discovers exactly this file; delegate to sibling modules and keep them in
   the same folder.
2. Register the tool with the Pi API, including a schema the parent agent can
   emit. Validate inputs once, at the boundary, and fail fast with an actionable
   message.
3. Keep pure logic (selection, normalization, formatting) in its own module and
   unit-test it. `extensions/todo/model.ts` and `extensions/ask/selection.ts`
   are the models to copy.
4. Add `extensions/<name>/*.test.ts` using `node:test` and `node:assert`.
5. Document it: a page in `docs/extensions/<name>.md`, a row in the
   `docs/README.md` table, and an entry in the `AGENTS.md` source-of-truth list.
6. Add a changeset (`minor` for a new tool), then run `npm run check`.

Respect the [design rules](#design-rules): a new tool must not write into the
target repository, must not add a slash command, and must degrade instead of
trapping the agent.

## Adding a rule or a language guide

- Mechanical rules live in `assets/artifacts/GUIDELINES_TEMPLATE.md`. A new rule
  needs a detector in `extensions/rules/checks.ts`, a severity in
  `extensions/rules/catalog.ts`, and a test proving both the hit and the miss.
- A new language guide goes to
  `skills/sideroom-guidelines/references/languages/<language>.md` and must mirror
  every rule in the canonical seed with idiomatic examples. Register the
  extension in the guidelines gate when the guide joins the supported set.

## Documentation and decisions

- [`docs/README.md`](./docs/README.md) is the index. Add the page there when you
  add it to `docs/`.
- [`CONTEXT.md`](./CONTEXT.md) is a domain glossary and nothing else: what a
  thing is, in one or two sentences, plus rejected synonyms under `_Avoid_`. No
  implementation detail, no spec prose.
- A hard-to-reverse, surprising decision that came from a real trade-off gets an
  ADR under `docs/adr/`, numbered and listed in `docs/README.md`. All three gates
  must pass; otherwise the reasoning belongs in the pull request.
- [`README.md`](./README.md) is product copy for users. Keep maintainer detail
  out of it.

## Reporting an issue

Use the [bug report](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=bug_report.yml)
or [feature request](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=feature_request.yml)
form. A useful report includes:

- the Sideroom Pi version (`npm view @rmrdeveloper/sideroom-pi version` or the
  `pi list` entry), the Pi version, Node version, and operating system;
- the mode you were in — interactive TUI, print, JSON, or RPC — because several
  tools are TUI-only by design;
- the exact prompt or tool call, what you expected, and what happened;
- logs or a screenshot, with secrets and private repository content removed.

Never paste tokens, session files, or private code. Security problems go to
[`SECURITY.md`](./SECURITY.md), not to the issue tracker.

## Code of conduct

Participation is covered by [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
Report unacceptable behavior to the maintainer through GitHub.

## License

Contributions are licensed under the [MIT license](./LICENSE) that covers this
repository.
