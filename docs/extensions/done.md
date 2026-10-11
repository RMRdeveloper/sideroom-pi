# `sideroom_done`

Steers the agent back to the project's own check command when files changed and
the checks have not passed. It never blocks and does nothing when no check
command is detectable. When the project has tests, it also asks whether existing
tests cover a change that touched code but no test file.

## Check-command detection

Detected from `ctx.cwd`, in order, cached per working directory:

1. `package.json` script, first of `check` → `test` → `lint` → `typecheck` →
   `types`, run with the lockfile's package manager (`pnpm`, `yarn`, `bun`,
   else `npm`; Yarn omits `run`).
2. `pytest -q` when `pyproject.toml` or `setup.py` exists.
3. `go test ./...` when `go.mod` exists.
4. `cargo test` when `Cargo.toml` exists.
5. `make check` when the `Makefile` has a `check:` target.

## Test-setup detection

`hasTestSetup(cwd)` is true when `package.json` has a `test` script, or when
`pyproject.toml`, `setup.py`, `go.mod`, or `Cargo.toml` exists. A project with
only `npm run check` or `make check` has a gate but no detected test setup.

## State and steering

- A successful `write`/`edit` sets `mutated` and clears `checksGreen`.
- A bash command matching the detected check marks the call. Its result sets
  `checksGreen` to whether it succeeded; a failed rerun clears a previous pass.
- Checks and the coverage notice run only at `agent_before_settle`, after the
  low-level tool loop, retries and compaction recovery. They never interrupt
  implementation at `turn_end`.
- The shared settle guard gives guidelines review and its late semantic notes
  priority over `done`, and gives `done` priority over the walkthrough offer.
  The order does not depend on extension loading order.
- An aborted or errored run, any queued message, or an earlier handler's
  continuation postpones the gate without spending its steering budget.
- A steer is a hidden `custom_message` entry returned with `continue: true`,
  preserving earlier entries and continuing the same run.
- Checks and the coverage notice share `MAX_DONE_STEERS = 2` per user turn.
- State resets on idle interactive/RPC input and `session_start`. Input queued
  while the agent runs does not reset the cap or a green check.

## Missing-test notice

A successful `write`/`edit` records source and test paths by convention. A run
that changes code but no test file receives one coverage notice when checks are
green and a test setup is detected. Existing tests may already cover the change;
the notice asks the agent to inspect that coverage and add or update a meaningful
test only when needed, then rerun the checks.

Documentation and configuration alone do not activate the notice. With checks
red, the check gate wins and the notice waits. Path recognition never proves
that the right test exists. Both messages share the same two-steer cap.

## Files

| File | Role |
| --- | --- |
| `extensions/done/index.ts` | Creates state, caches detections per `cwd`, wires reset events. |
| `extensions/done/detect.ts` | Check-command detection, test-setup detection, and command matching. |
| `extensions/done/guard.ts` | Watches mutations and bash results; appends the settle steer and notice. |
| `extensions/done/model.ts` | State, reset, decisions, test-path detection, and steer text. |
| `extensions/shared/settle.ts` | Quiet boundary checks and stage priority through Pi's event bus. |

## Tests

`detect.test.ts` covers ecosystems, test setup, and command matching.
`model.test.ts` covers path detection and the notice decision.
`index.test.ts` covers green/red transitions, caps, reset, and postponed steers.
`shared/settle.test.ts` covers all six extension loading orders and late notes.
