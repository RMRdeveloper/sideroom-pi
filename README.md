# Sideroom Pi

[![npm version](https://img.shields.io/npm/v/@rmrdeveloper/sideroom-pi?label=npm&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm monthly downloads](https://img.shields.io/npm/dm/@rmrdeveloper/sideroom-pi?label=downloads&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm license](https://img.shields.io/npm/l/@rmrdeveloper/sideroom-pi?label=license)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages). It
registers the `/sideroom` command inside Pi and runs planner, implementer,
reviewer, verifier, and fixer as isolated Pi SDK sessions.

It creates no `.pi` configuration, task graph, harness state, or other files
in the repository being changed.

## Install

Install Sideroom globally from npm. Pi writes this installation to your user
settings, so do not use `-l`.

```bash
pi install npm:@rmrdeveloper/sideroom-pi
```

For a reproducible environment, install a specific release instead. A pinned
version does not move when you run Pi's package update command.

```bash
pi install npm:@rmrdeveloper/sideroom-pi@6.0.0
```

To update an unpinned installation:

```bash
pi update --extension npm:@rmrdeveloper/sideroom-pi
```

Start Pi from the repository you want to work in, then invoke the extension:

```text
/sideroom "Add a health endpoint"
/sideroom --read-only "Review the retry behavior"
```

Pi extension commands are necessarily slash commands, so `/sideroom` is the
single command; there is no subcommand or separate binary to run. When the
request is omitted, Pi asks for it using its own UI.

Supported guideline variants are `typescript` (default), `javascript`,
`php-laravel`, `python`, `java`, `go`, and `rust`. `--read-only` removes
write-capable tools from every role. `--max-fix-passes <number>` changes the
default limit of two repair passes.

When the request declares no file paths, Sideroom infers the file-policy map
from repository evidence (`composer.json`, `go.mod`, `Cargo.toml`,
`package.json` with or without `tsconfig.json`, Python markers, and Java
markers) and continues without confirmation.

## Provenance and isolation

`/sideroom` is dispatched to the extension before Pi expands skills or sends
the command to the interactive agent. The extension then creates direct,
in-memory SDK sessions for the five Sideroom roles. Those child sessions load
only this package's skills and explicit policy; global Pi skills, extensions,
prompt templates, and global context files are excluded.

At the end of every run, Pi displays a `Sideroom completed` or `Sideroom
failed` message with its provenance and the completed roles. It also records
the same trace in Pi's session history as `sideroom:run`; this is Pi session
metadata, never a file in the target repository.

The packaged `sideroom-grilling` skill runs as the design-decision gate. Its
questions use Pi's native decision UI. During a run, a persistent Pi widget
shows the active phase, the waiting-for-answer state, and the direct-SDK
provenance. Selecting a recommendation accepts it; selecting the alternate
option opens a custom-answer field. The widget is removed automatically when a
run completes or fails; the final Pi session message remains as the durable
record. Grilling continues until every design decision is settled; it has no
fixed round limit. It is not a request to any global skill with the same name.

## Content and guidelines

The five role prompts are in `src/assets/agents/`. The shared policy is
`src/assets/artifacts/GUIDELINES_TEMPLATE.md`; the language layers live in
`src/assets/artifacts/guidelines/`. Implementer and fixer receive those
policies before their write gate and must read them before every code-writing
tool call.

Reusable Pi skills ship in `skills/`: `sideroom-grilling`,
`sideroom-domain-modeling`, `sideroom-spec`, and `sideroom-transcribe-audio`.
Pi loads them directly through the package manifest.
The transcription skill needs `uv`, Python, and `ffmpeg` only when explicitly
used.

## Development

```bash
npm install
npm run check
npm run build
```

Biome is the sole formatter and linter. Runtime code uses Pi's SDK only; Pi
provides `@earendil-works/pi-coding-agent` as a peer dependency.

## Releases and commits

Commit messages must follow the Conventional Commits format. The existing
Husky `commit-msg` hook validates each local commit with Commitlint, for
example `feat: add a pipeline summary` or `fix: validate malformed findings`.

Every user-visible package change needs a Changeset. Create one with:

```bash
npm run changeset
```

Review pending release work with `npm run changeset:status`. On the protected
`main` branch, run `npm run version-packages`, review and commit the updated
`package.json`, `package-lock.json`, and `CHANGELOG.md`, then create and push an
annotated `v<SemVer>` tag at that commit. Publish only by manually dispatching
the `Publish npm package` workflow from `main` with that exact tag. The workflow
fails unless the tag is annotated, resolves to `main`, and matches the package
version; it publishes with npm OIDC provenance. Never publish locally.

## Layout

```text
src/
  pi-extension.ts        Pi extension entry point for /sideroom (thin barrel)
  extension/             /sideroom command modules mounted by index.ts
    command.ts           command registration, request intake, pipeline assembly
    preflight.ts         language-policy preflight and map confirmation
    grilling.ts          grilling overlay, sequential fallback, prompt detail
    progress.ts          pipeline progress widget, status, and stage observer
    report.ts            run record, session message, and model reference
  pi-command.ts          slash-command parsing
  app.ts                 Pi pipeline assembly
  core/                  orchestration, roles, contracts, and content catalog
  runtimes/pi.ts         direct Pi SDK adapter for isolated child sessions
  assets/                role prompts and coding guidelines
skills/                  package-provided Pi skills
```
