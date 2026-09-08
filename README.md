# Sideroom Pi

[![npm version](https://img.shields.io/npm/v/@rmrdeveloper/sideroom-pi?label=npm&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm monthly downloads](https://img.shields.io/npm/dm/@rmrdeveloper/sideroom-pi?label=downloads&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm license](https://img.shields.io/npm/l/@rmrdeveloper/sideroom-pi?label=license)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages). It
registers `sideroom_ask`, a TUI questionnaire the parent agent can call to
clarify requirements, preferences, or decisions. It writes no `.pi`
configuration, task graph, or other Sideroom files into the repository you
are working in.

## Quick path

1. Install globally from npm. Pi writes this installation to your user
   settings, so do not use `-l`.

   ```bash
   pi install npm:@rmrdeveloper/sideroom-pi
   ```

2. Start Pi in the repository you want to work in.
3. Ask the parent agent a question that needs a decision. It can call
   `sideroom_ask` in the TUI.

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
| Surface | One LLM-callable tool, `sideroom_ask`. No `/sideroom` command. |
| Batch | One tool call is one 1–N question batch. Call again for another round. |
| Recommendation | Every question must send `recommendationIndex`. |
| Always-on rows | The UI adds Out of scope and a custom answer. Do not send those options. |
| Headless | Print, JSON, and RPC return `Error: UI not available`. |
| Seed artifact | `assets/artifacts/GUIDELINES_TEMPLATE.md` ships unwired. |

## Tool

`sideroom_ask` follows Pi's questionnaire UI: a simple list for one question,
tabs plus Submit for several. English copy. Each question needs:

- `id`
- `prompt`
- at least two `{ value, label, description? }` options
- `recommendationIndex` pointing at the recommended option
- optional `label` for the tab bar (defaults to `Q1`, `Q2`, …)

The recommended option is marked in the list. Escape cancels the batch.

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
  ask/                   sideroom_ask (index.ts, model.ts, ui.ts)
assets/artifacts/        unwired GUIDELINES_TEMPLATE.md seed
```

Add another tool as `extensions/<name>/index.ts`. Pi discovers
`extensions/*/index.ts`; helpers in that folder are not loaded as extensions.
