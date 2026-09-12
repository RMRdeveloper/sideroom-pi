# 0003. `develop` as the integration branch and release-only `main`

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

Releases are fully automated. `.github/workflows/release.yml` selects a mode on
every push to `main`: with pending changesets it opens or updates a version pull
request, and once that pull request is merged it publishes to npm, tags, and
creates the GitHub release. `main` is protected and is the only branch that
triggers publishing. `.github/workflows/ci.yml` runs `npm run check` on pull
requests and on pushes to `main`.

That made `main` carry two jobs at once: the branch contributors merge into, and
the branch the release workflow watches. Every merge to `main` is a release
candidate, so merging an unfinished feature to unblock someone is the same
action as deciding to prepare a release, and a revert has to travel back
through the release path. `.changeset/config.json` fixes `baseBranch` at
`main`, so the changeset tooling assumes the same branch that publishing does.

The package also ships no runtime state: a release is a version bump plus
generated notes, which is cheap to prepare and expensive to take back once it is
on npm.

## Decision

1. `develop` is the integration branch. Contributor pull requests target
   `develop`.
2. `main` is release-only and protected. It receives changes through a single
   `develop` → `main` pull request, opened when there is something worth
   publishing. Nothing else merges into `main`.
3. The person opening a pull request authors the changeset in that same pull
   request. Files outside `files` in `package.json` need none.
4. CI runs on every pull request and on pushes to both `develop` and `main`.
   The Release workflow stays bound to pushes to `main` and is not modified.
5. The version pull request created by the Release workflow remains the only
   automated writer of `main`, and publishing stays impossible from a local
   machine.
6. `develop` is also the repository default branch, so a new pull request and
   every web edit start from the integration branch. `main` stops being default
   but keeps its role: it is what releases are cut from.

## Consequences

- `main` history is a sequence of release-intent merges, so a push to `main`
  always means "prepare a release". A feature can sit in `develop` without
  arming the release workflow.
- A fresh clone checks out `develop`. GitHub resolves `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, the issue forms, and the pull request
  template from the default branch, so those files have to reach `develop`
  before the repository UI links them. Contributor-facing links in
  `.github/ISSUE_TEMPLATE/config.yml` therefore point at `develop`, while
  `README.md` and `package.json` keep pointing at `main` for the released
  gallery assets.
- `.changeset/config.json` keeps `baseBranch: main`. Version pull requests still
  target the release branch, and the Changesets action keeps reading that config
  rather than the repository default.
- After a release, `main` holds the `Version Packages` commit that `develop`
  does not. The maintainer merges `main` back into `develop` before the next
  `develop` → `main` pull request, or the next release re-applies the same
  version bump.
- Contributors must know the base branch. `CONTRIBUTING.md`,
  `.github/pull_request_template.md`, and the issue templates all state it, and
  a pull request opened against `main` is retargeted rather than merged.
- `develop` is a long-lived branch and must not drift. It stays releasable:
  the same `npm run check` gate as `main`, and `develop` → `main` is opened
  regularly rather than at the end of a large batch.
- A hotfix is a normal pull request against `develop`, followed by a
  `develop` → `main` pull request. There is no separate hotfix path.

## Alternatives considered

- **Pull requests directly against `main`.** Rejected: it collapses
  integration and release, so every merge arms the release workflow and any
  unfinished work has to be untangled from the release path.
- **Issue-first policy for code pull requests.** Rejected: it adds friction
  without giving contributors a place to integrate, and the discussion can
  happen in the pull request itself.
- **A release branch per version instead of `develop`.** Rejected: more
  long-lived branches to sync, and no single branch that accumulates tested
  work.
- **Cherry-picking each merged pull request into `main`.** Rejected: it breaks
  the link between the commits a release contains and the commits reviewers
  approved, which is exactly what changesets reads.

## References

- `CONTRIBUTING.md` — the flow contributors follow.
- `.github/workflows/ci.yml` — the gate on `develop` and `main`.
- `.github/workflows/release.yml` — the release path this decision protects.
- `.changeset/config.json` — `baseBranch`, unchanged by this decision.
