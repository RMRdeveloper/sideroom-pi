# `sideroom_done`

Steers the agent back to the project's own check command when files changed and
the checks have not passed. It never blocks and does nothing when no check
command is detectable.

## Check-command detection

Detected from `ctx.cwd`, in order, cached per working directory:

1. `package.json` script, first of `check` → `test` → `lint` → `typecheck` →
   `types`, run with the lockfile's package manager (`pnpm`, `yarn`, `bun`,
   else `npm`; Yarn omits `run`).
2. `pytest -q` when `pyproject.toml` or `setup.py` exists.
3. `go test ./...` when `go.mod` exists.
4. `cargo test` when `Cargo.toml` exists.
5. `make check` when the `Makefile` has a `check:` target.

## State and steering

```ts
interface DoneState {
  mutated: boolean;
  checksGreen: boolean;
  steeredThisTurn: boolean;
  steerCount: number;
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

## Files

| File | Role |
| --- | --- |
| `extensions/done/index.ts` | Creates state, caches detection per `cwd`, wires reset events. |
| `extensions/done/detect.ts` | Per-ecosystem detection and command matching. |
| `extensions/done/guard.ts` | Watches mutations and bash results; sends the steer. |
| `extensions/done/model.ts` | State shape, reset, decision, and steer text. |

## Tests

`detect.test.ts` covers each ecosystem and command matching. `index.test.ts`
covers green/red transitions, caps, and reset.
