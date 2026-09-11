# Guidelines gate

A short, always-on system-prompt reminder plus a hard gate: `write` and `edit`
are blocked until the agent has fully read the packaged coding skill and, for a
supported target, the matching complete language guide.

## Reminder

On every `before_agent_start`, `guidelines` appends `GUIDELINES_REMINDER` to the
system prompt (idempotently — it never appends twice). It points at:

- `skills/sideroom-guidelines/SKILL.md` (`GUIDELINE_SKILL_PATH`).
- The exact language guide under
  `skills/sideroom-guidelines/references/languages/` for the target extension.

The canonical seed, `assets/artifacts/GUIDELINES_TEMPLATE.md`, is never pasted
into the prompt.

## Read gate

- A read counts only when it succeeds, is **not** truncated, and uses **no**
  `offset` or `limit`. Same-named files elsewhere do not count.
- Paths are canonicalized (`~`, leading `@`, relative to `cwd`, `realpath`) so
  only the packaged files satisfy the gate.
- On `tool_call` for `edit`/`write`, `mutationBlockReason()` returns a block
  reason listing the required paths until they have been read.
- If the `read` tool is inactive, the gate cannot be satisfied and says so.
- Read state resets on `before_agent_start` and on `session_compact` (a summary
  may drop the guides from context mid-run).

## Language map

| Target extension | Guide |
| --- | --- |
| `.java` | `java.md` |
| `.php` | `php-laravel.md` |
| `.ts`, `.tsx` | `typescript.md` |
| `.py` | `python.md` |
| `.go` | `go.md` |
| `.rs` | `rust.md` |
| anything else | shared skill table only |

Each guide mirrors all 19 rules from the seed with idiomatic examples. The
catalog lives in `extensions/guidelines/catalog.ts`.

## Files

| File | Role |
| --- | --- |
| `extensions/guidelines/index.ts` | Registers the guard and the reminder injection/reset events. |
| `extensions/guidelines/guard.ts` | Tracks reads, canonicalizes paths, and blocks mutations. |
| `extensions/guidelines/catalog.ts` | Package-rooted skill and language-guide paths. |
| `extensions/guidelines/prompt.ts` | Builds and idempotently appends the reminder. |

## Tests

`index.test.ts` covers blocking, accepted reads, truncation, compaction reset,
and the inactive-read-tool case. `prompt.test.ts` covers idempotent appending.
