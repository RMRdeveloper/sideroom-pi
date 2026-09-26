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

The language guides sit on one dense index line, one `extension → path` entry
per language, rather than one sentence each: the same paths and the same
requirement, a fraction of the tokens the reminder costs on every turn.
`prompt.test.ts` caps the reminder's length so the budget cannot drift back up.

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

## Review steer

Reading the guide is not enough; the agent still has to apply it. After a run
in which any `write`/`edit` succeeded, `review.ts` appends one hidden steer on
`agent_before_settle` asking the agent to re-check every changed file against the
loaded language guide and run the relevant formatter, linter, type checks, and
tests. If the guide has drifted out of context, the steer tells the agent to
re-read it in full first.

- Fires at most once per turn: `steeredThisTurn` is set when the entry is
  appended, so the continuation the steer starts cannot re-trigger it.
- Only successful mutations count; a failed `write`/`edit` does not arm it.
- Skipped when the run was aborted (Escape) or errored, and when a user message
  is pending; the review stays armed for the next boundary.
- Review state resets on `input` (`source: 'interactive'` or `'rpc'`) that
  arrives while the agent is idle, and on `session_start`. A message typed
  while the agent runs joins the current run as a steer or follow-up and does
  not re-arm the review. It deliberately does *not* reset on
  `before_agent_start` (that would re-arm every steer continuation into an
  infinite loop) or on `session_compact` (compaction may interrupt a run
  mid-edit; the review still applies once the run settles).
- The steer travels as a hidden `custom_message` entry (`display: false`,
  `customType: 'sideroom-guidelines-review'`) returned from
  `agent_before_settle` with `continue: true`, so the review stays inside the
  same run. Entries earlier handlers proposed are kept. It does not go through
  `input` or `before_agent_start`, so it neither resets its own state nor
  appends another reminder.
- `agent_settled` is not used: Pi documents it as notification-only, and a
  steer sent there opens a second run after the user saw the agent stop.
- `explain` defers behind it: both handle `agent_before_settle`, and Pi runs
  handlers in extension load order, so `explain` holds its offer back one
  boundary and appends it after the review has run.

### Semantic notes from Jev

`jev` does not append its findings to the tool result. It emits each note on
`pi.events` as `sideroom:review-note` (`extensions/shared/review-note.ts`), and
the review collects them for the current turn.

- Notes gathered before the review fires ride the review steer, after the
  review text.
- Notes that arrive after the review fired, because the review's own fixes drew
  new ones, get one follow-up steer per turn. A second batch in the same turn is
  held, so a fix that draws new notes cannot keep the run going.
- A note alone never starts a review; it needs a successful mutation first.
- A follow-up that yields to an abort, an error, or a pending user message keeps
  its notes for the next boundary. An idle user prompt drops them with the rest
  of the turn state. Malformed payloads are ignored.

## Files

| File | Role |
| --- | --- |
| `extensions/guidelines/index.ts` | Registers the guard, the reminder injection/reset events, and the review guard. |
| `extensions/guidelines/guard.ts` | Tracks reads, canonicalizes paths, and blocks mutations. |
| `extensions/guidelines/catalog.ts` | Package-rooted skill and language-guide paths. |
| `extensions/guidelines/prompt.ts` | Builds and idempotently appends the reminder. |
| `extensions/guidelines/review.ts` | Arms the review steer on successful mutations, fires it once per turn, and carries Jev's notes. |

## Tests

`index.test.ts` covers blocking, accepted reads, truncation, compaction reset,
and the inactive-read-tool case. `prompt.test.ts` covers idempotent appending.
`review.test.ts` covers the one-shot arm/fire cycle, the failed-mutation case,
abort and error outcomes, a pending user message, kept entries from earlier
handlers, input typed during a run, interactive vs. extension input resets,
`session_start` clearing, independence from `before_agent_start`, notes carried
in the review, the single late-note follow-up, notes kept across a yield,
malformed notes, and stale notes dropped on a new prompt.
