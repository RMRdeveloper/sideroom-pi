# `sideroom_done`

Observes checks the agent chooses to run and shares successful results with
guidelines review. It never blocks, registers a settle guard, or forces another
model response to execute checks. Verification remains part of the project's
instructions and the guidelines review.

## Check-command detection

Detected from `ctx.cwd`, in order, cached per working directory:

1. `package.json` script, first of `check` → `test` → `lint` → `typecheck` →
   `types`, run with the lockfile's package manager (`pnpm`, `yarn`, `bun`,
   else `npm`; Yarn omits `run`).
2. `pytest -q` when `pyproject.toml` or `setup.py` exists.
3. `go test ./...` when `go.mod` exists.
4. `cargo test` when `Cargo.toml` exists.
5. `make check` when the `Makefile` has a `check:` target.

Detection observes one command, not an aggregate of equivalent checks.
Unrecognised shell forms remain unconfirmed and never trigger a retry.

## Observed state

- A successful `write`/`edit` clears `checksGreen`.
- A bash command matching the detected check marks the call. Its result sets
  `checksGreen` to whether it succeeded; a failed rerun clears a previous pass.
- The synchronous `sideroom:check-status` event exposes the detected command and
  green flag. Guidelines review can reuse a successful result when no later
  mutation made it stale. Jev can also read this bounded status.
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
| `extensions/done/index.ts` | Creates state, caches detections per `cwd`, wires reset events. |
| `extensions/done/detect.ts` | Check-command detection, test-setup detection, and command matching. |
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
