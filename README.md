# Sideroom Pi

[![npm version](https://img.shields.io/npm/v/@rmrdeveloper/sideroom-pi?label=npm&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm monthly downloads](https://img.shields.io/npm/dm/@rmrdeveloper/sideroom-pi?label=downloads&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm license](https://img.shields.io/npm/l/@rmrdeveloper/sideroom-pi?label=license)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages). It
registers two parent-agent tools: `sideroom_ask`, a TUI questionnaire for
clarifying decisions, and `sideroom_todo`, a live work board shown above the
editor. It also shows a session-scoped list of files successfully edited by Pi.
It writes no `.pi` configuration, task graph, or other Sideroom files into the
repository you are working in.

## Quick path

1. Install globally from npm. Pi writes this installation to your user
   settings, so do not use `-l`.

   ```bash
   pi install npm:@rmrdeveloper/sideroom-pi
   ```

2. Start Pi in the repository you want to work in.
3. Ask the parent agent a question that needs a decision or a visible work
   board. It can call `sideroom_ask` or `sideroom_todo` in the TUI.

For a reproducible environment, pin a release. A pinned version does not move
when you run Pi's package update command.

```bash
pi install npm:@rmrdeveloper/sideroom-pi@7.0.0
```

To update an unpinned installation:

```bash
pi update --extension npm:@rmrdeveloper/sideroom-pi
```

## Details

| Topic | Decision |
| --- | --- |
| Surface | Two LLM-callable tools: `sideroom_ask` and `sideroom_todo`. No `/sideroom` command. |
| Questionnaire | One `sideroom_ask` call is one 1–N question batch; every question has `recommendationIndex`. |
| Always-on rows | The questionnaire UI adds Out of scope and a custom answer. Do not send those options. |
| Work board | `sideroom_todo propose` replaces a visible board; `update` patches items by id. |
| Headless | `sideroom_todo update` works in print, JSON, and RPC. `propose` and `sideroom_ask` return `Error: UI not available` there. |
| Edited files | Successful `write` and `edit` results appear below an active work board; `F8` opens the full list. |
| Session state | The work board and edited-file history live in the Pi session branch, not in the target repository. |
| Seed artifact | `assets/artifacts/GUIDELINES_TEMPLATE.md` ships unwired. |

## Tool

`sideroom_ask` follows Pi's questionnaire UI: a simple list for one question,
tabs plus Submit for several. Write prompts, tab labels, and option copy in
the language the user is speaking; ids, option values, and TUI chrome stay
English. Each question needs:

- `id`
- `prompt`
- at least two `{ value, label, description? }` options
- `recommendationIndex` pointing at the recommended option
- optional `label` for the tab bar (defaults to `Q1`, `Q2`, …)

The recommended option is marked in the list. Escape cancels the batch.

## Work board

`sideroom_todo` keeps an ordered, display-only board above the editor. The
agent maintains it and the user steers through chat. It never creates a
repository task file or a `/todos` command.

- `propose` replaces the full board and is available only in the interactive
  TUI.
- `update` applies one or more `{ id, status?, content? }` patches and works in
  every Pi mode.
- Items have stable string ids, short content, and one of `pending`,
  `in_progress`, `completed`, or `cancelled`.
- While items are pending, exactly one item must be `in_progress`. Complete the
  current item and start the next one in the same update.
- Snapshots are stored in the active session branch. The board is rebuilt after
  session navigation and compaction.

## Edited files

The package automatically records successful Pi `write` and `edit` calls for
the active session. It does not infer filesystem changes from shell commands,
Git, people, or subagents. The compact list is shown below the work board when
one is active and contains at most five recent paths.

- `F8` opens or closes the extended, scrollable list; press `R` there
  to clear the current session's history.
- Every path is an OSC 8 `file://` link. Your terminal determines whether that
  is a click, Ctrl+click, or another modifier-assisted action.
- Paths outside the active project are labelled `external`.
- A new session starts with a new list; the current session's history survives
  reload, tree navigation, and compaction.

## Development

```bash
npm install
npm run check
```

Biome is the sole formatter and linter. Pi loads TypeScript from `extensions/`
directly; do not bundle. Pi provides `@earendil-works/pi-coding-agent`,
`@earendil-works/pi-tui`, and `typebox` as peer dependencies.

## Releases and commits

Commit messages must follow the Conventional Commits format. The existing
Husky `commit-msg` hook validates each local commit with Commitlint, for
example `feat: mark the recommended sideroom_ask option`.

Every user-visible package change needs a Changeset. Create one with:

```bash
npm run changeset
```

Review pending release work with `npm run changeset:status`. When Changesets
are merged to `main`, the `Release` workflow creates or updates a reviewable
Changesets version PR. That PR contains the generated `package.json`,
`package-lock.json`, and `CHANGELOG.md` updates. Merge the version PR only after
review; its merge runs `npm ci` and `npm run check`, then uses
npm 11.5.1 and npm Trusted Publishing (GitHub OIDC) to publish. Changesets then
pushes the release Git tag and creates the GitHub Release automatically.

Never run `npm publish`, create release tags, or create GitHub Releases locally.
Publishing is allowed only through the merged Changesets version PR and the
`Release` workflow. The npm package's Trusted Publisher must be configured for
this GitHub repository, the workflow filename `release.yml` (not its path),
and the `npm` environment; configure the matching GitHub `npm` environment
before the first release.

## Layout

```text
extensions/
  ask/                   sideroom_ask (index.ts, execute.ts, model.ts, ui.ts)
  todo/                  sideroom_todo (index.ts, execute.ts, session.ts,
                         guards.ts, model.ts, ui.ts)
  modified-files/        session-backed edited-file tracker and view
assets/artifacts/        unwired GUIDELINES_TEMPLATE.md seed
```

Add another tool as `extensions/<name>/index.ts`. Pi discovers
`extensions/*/index.ts`; helpers in that folder are not loaded as extensions.
