# `sideroom_done`

Observes checks the agent chooses to run and shares successful results with
guidelines review. It never blocks, registers a settle guard, or forces another
model response to execute checks. Verification remains part of the project's
instructions and the guidelines review.

## Check-command detection

Detected from `ctx.cwd`, in order, cached per working directory until an
observed `write` or `edit` changes a file that determines it:

1. `package.json` script, first of `check` → `test` → `lint` → `typecheck` →
   `types`, run with the lockfile's package manager (`pnpm`, `yarn`, `bun`,
   else `npm`; Yarn omits `run`).
2. `pytest -q` when `pyproject.toml` or `setup.py` exists.
3. `go test ./...` when `go.mod` exists.
4. `cargo test` when `Cargo.toml` exists.
5. `make check` when the `Makefile` has a `check:` target.

Detection observes one command, not an aggregate of equivalent checks.
A result confirms that command only when the shell text is the exact detected
command, run in that working directory, and started after the latest observed
mutation there. Extra arguments, help flags, another directory, newlines, and
shell joins stay unconfirmed. They never block the command and never trigger a
retry. A detection error publishes `outcome: unknown` instead of a pass, and
does not block bash. An unobserved disk edit is not a detection change.

## Observed state

- A successful `write`/`edit` clears green for that working directory. A pass
  becomes `stale`; a check that overlaps the edit cannot turn green again.
- A bash command matching the exact detected check marks the call. Its result
  sets green only when it succeeded and still covers that directory's current
  changes. A failed rerun clears a previous pass. Another directory's check does
  not turn the parent green.
- The synchronous `sideroom:check-status` event exposes the detected command,
  green flag, and outcome (`not-run`, `passed`, `failed`, `stale`, or
  `unknown`). Guidelines review can reuse a successful result when no later
  mutation made it stale. Jev reads this status when it is present and otherwise
  uses the same confirmation rules.
- State resets on idle interactive/RPC input and `session_start`. Input queued
  while the agent runs does not reset a green check.
- No extension executes a check. Missing, failed, or unrecognised checks do not
  cause a `sideroom-done-gate` message or a standalone coverage continuation.

## Coverage supplement

A successful `write`/`edit` records source and test paths by convention.
`hasTestSetup(cwd)` is true when `package.json` has a `test` script, or when
`pyproject.toml`, `setup.py`, `go.mod`, or `Cargo.toml` exists.

If a run changed code but no test file, one coverage notice may join an existing
review or style continuation through `sideroom:settle-supplement`. Without
another necessary continuation, the notice stays silent. It never opens a
response on its own.

Existing tests may already cover the change; the notice asks the agent to
inspect coverage, add or update a meaningful test only when needed, reuse valid
checks, and run missing, failed, or stale checks. Documentation/configuration
changes alone do not activate it. Path recognition never proves that the right
test exists.

## Files

| File | Role |
| --- | --- |
| `extensions/done/index.ts` | Creates state and wires reset events. |
| `extensions/done/detect.ts` | Check-command detection, cached resolution, test-setup detection, and exact command confirmation. |
| `extensions/done/guard.ts` | Observes mutations and bash results; contributes coverage supplements. |
| `extensions/done/model.ts` | State, reset, coverage decision, path detection, and notice text. |
| `extensions/shared/settle.ts` | Coordinates necessary review/style continuations and their supplements. |

## Tests

`detect.test.ts` covers ecosystems, test setup, and command matching.
`model.test.ts` covers path detection and the notice decision.
`index.test.ts` covers passive observations, invalidation, resets, and the absence
of continuation hooks even for failed or unrecognised checks.
`shared/settle.test.ts` covers all six extension loading orders, late notes,
green-result reuse, and coverage only joining existing continuations.
