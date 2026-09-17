# `sideroom_done`

Steers the agent back to the project's own check command when files changed and
the checks have not passed. It never blocks and does nothing when no check
command is detectable. When the project has tests, it also notes a run that
changed code files without touching one.

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

`hasTestSetup(cwd)` answers a narrower question than the check command: does
this project have tests at all? True when `package.json` has a `test` script,
or when `pyproject.toml`, `setup.py`, `go.mod`, or `Cargo.toml` exists. A
project with only `npm run check`, or only `make check`, has a gate but no test
setup, so the notice stays quiet.

## State and steering

```ts
interface DoneState {
  mutated: boolean;
  checksGreen: boolean;
  steeredThisTurn: boolean;
  steerCount: number;
  mutatedSource: boolean;
  mutatedTest: boolean;
  noticedMissingTest: boolean;
}
```

- A successful `write`/`edit` sets `mutated` and clears `checksGreen`.
- A bash command matching the detected check (by prefix on a command separator)
  marks the call; a successful result sets `checksGreen`.
- At `turn_end`, if checks are not green and the cap is not reached, one steer
  is sent:

  ```ts
  pi.sendMessage(
    { customType: 'sideroom-done-gate', content: 'Run `...` and make it pass before finishing.', display: false },
    { triggerTurn: true, deliverAs: 'steer' },
  );
  ```

- Steering is capped at `MAX_DONE_STEERS = 2` per run and once per turn.
- State resets on a real user prompt and on `session_start`.

## Missing-test notice

A successful `write`/`edit` records whether its path is a supported source file
and whether it looks like a test (`isSourcePath` by extension, `isTestPath` by
name convention). Documentation, configuration, and other non-code files do not
activate the notice. At `turn_end`, when the check gate did not fire, the
project has tests, the run changed code files and never a test file, one notice
is sent:

```ts
pi.sendMessage(
  { customType: 'sideroom-missing-test-notice', content: 'This run changed code files and no test file. Add or update the test that covers the change before finishing.', display: false },
  { triggerTurn: true, deliverAs: 'steer' },
);
```

- It never blocks, and it never claims the right test exists: paths are
  recognised by convention, not by reading the tests.
- With checks red, the check gate wins the turn and the notice waits for a turn
  where the checks are green.
- It fires once per run and shares `steerCount` with the check gate, so the two
  never exceed `MAX_DONE_STEERS` between them.

## Files

| File | Role |
| --- | --- |
| `extensions/done/index.ts` | Creates state, caches both detections per `cwd`, wires reset events. |
| `extensions/done/detect.ts` | Per-ecosystem check-command detection, test-setup detection, and command matching. |
| `extensions/done/guard.ts` | Watches mutations and bash results; sends the steer and the notice. |
| `extensions/done/model.ts` | State shape, reset, decisions, test-path detection, and steer text. |

## Tests

`detect.test.ts` covers each ecosystem, the test setup, and command matching.
`model.test.ts` covers test-path detection and the notice decision.
`index.test.ts` covers green/red transitions, the notice, caps, and reset.
