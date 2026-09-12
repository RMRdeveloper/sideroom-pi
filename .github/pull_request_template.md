# Pull request

<!-- Target branch: `develop`. See CONTRIBUTING.md for the full flow. -->

## What and why

<!-- What changes, and which problem or failure mode it closes. Link the issue
     when one exists: Closes #123 -->

## How it was verified

<!-- The commands you ran and what you exercised by hand in Pi.
     `npm run check` is the gate and CI runs it on Node 22.19 and 24. -->

## Checklist

- [ ] `npm run check` passes locally.
- [ ] Tests cover the new pure logic, and a fix has a test that failed before it.
- [ ] The change respects the design rules in `CONTRIBUTING.md` — no slash
      command, no standalone CLI, no Sideroom state written into the target
      repository, and TUI-only paths still fail fast in other modes.
- [ ] Documentation is updated: `docs/extensions/<name>.md` and the
      `docs/README.md` table for a new or changed tool, `AGENTS.md` for a new
      path or command, `CONTEXT.md` for a new domain term.
- [ ] A changeset is included, or this change does not touch the published
      package (`files` in `package.json` is the exact published list).
- [ ] No unrelated reformatting, no version bump, no hand-edited `CHANGELOG.md`.

## Breaking change

<!-- Remove this section when nothing breaks. Otherwise describe the contract
     that changed, who is affected, and the migration. -->
