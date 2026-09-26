# Jev review

An optional semantic pass over the file a `write` or `edit` just changed. Jev is
TypeSafe's decision model: you send a state and typed questions, and it returns
probabilities, never prose. Sideroom asks it about the guide rules that no
mechanical check can decide.

## Contract

- **Off without a key.** With neither `TYPESAFE_API_KEY` nor a stored key, no
  request is made and Sideroom behaves exactly as it does without this
  extension.
- **Warn only, at the end of the run.** A finding is not appended to the tool
  result. Jev emits it on `pi.events` (`sideroom:review-note`), and the
  guidelines review carries it in its end-of-run steer. A note that arrives
  after the review fired gets one follow-up steer per turn. Nothing blocks, and
  nothing reaches the system prompt, so the cached prefix survives.
- **One request per successful mutation worth asking about**, carrying six
  `noul` questions and one shared state. Latency is flat in question count, and
  the file leaves the machine once. No request is made for a file outside a
  supported language (`.md`, `.json`, `.yaml`, lockfiles), for an edit that adds
  no lines, or for a file outside the working directory.
- **State is the file and the change, nothing else.** `file` holds the path
  relative to the working directory, resolved the way Pi's file tools resolve
  it, the language and the body; `change` holds the kind and the added lines.
  An absolute or `@`-prefixed path the model wrote never leaves the machine.
  The conversation, the session transcript, the board, other files, git history
  and environment values never travel.
- **Trigger.** `tool_call` records the added lines, because after a `write` the
  previous content is already gone. `tool_result` reads the resulting body from
  disk and asks. A call another extension blocks never reaches `tool_result`,
  so recorded calls are dropped on `turn_end` and on `session_start`.
- **Budget.** A serialized state over 60k characters is skipped, never
  truncated: half a file reads as a distorted picture and Jev answers it with
  the same confidence. The whole state is measured, because a new file travels
  twice, as the body and as its added lines. The API allows 64k tokens for the
  request and 32k for the state plus the longest question.
- **Escape cuts the request.** Pi waits for every `tool_result` handler before
  the result reaches the model, so the request follows the run's abort signal
  as well as the three-second timeout. A request is not started once the run is
  aborted, and a cancelled request does not count as a failure.
- **Cutoff.** An answer at or above `0.8` probability becomes a note. A `noul`
  carries no confidence field, so the probability itself is the only brake.
- **Usage counter.** Every request increments a counter for the active session.
  It resets on `session_start` and never touches disk. The footer and the F10
  screen show it; the endpoint returns no token or cost figures, so calls are
  the only honest unit.
- **Dedup.** The same rule on the same file is noted at most once per turn,
  however the model spelled the path. The turn starts on `input` from
  `interactive` or `rpc` that arrives while the agent is idle; a message typed
  during a run joins that run and does not clear the dedup set.
- **Failures never reach the agent.** Quota (`402`) and a rejected key (`401`,
  `403`) stop calls immediately. A rate limit (`429`) pauses calls until the
  next idle user prompt and does not count toward the breaker. Network errors
  and other `4xx`/`5xx` stop after three consecutive failures. A successful call
  rearms the breaker, and the F10 screen rearms it by hand. A request that hangs
  is cut after three seconds.
- **Injection has nowhere to go.** TypeSafe states that the state is not treated
  as hostile, and the body was written by the agent. Because the review can only
  add a note to a steer, the worst an injected instruction achieves is one
  wrong note.

## The six rules

The mechanical engine decides seven local things on added lines: braces, `any`,
swallowed errors, vague names, stale comments, commented-out code and suppressed
type errors. These six are the guide rules a single file can still answer.

| Question id | Guide rule | Why a single file answers it |
| --- | --- | --- |
| `guard-clauses` | 3 | Nesting is visible in the body |
| `fail-fast` | 4 | A fallback that hides a broken dependency sits in the function |
| `command-query` | 7 | Doing and returning are both in the signature and the body |
| `null-handling` | 8 | The convention is local to the file |
| `immutability` | 9 | Mutating a parameter is visible at the mutation |
| `validate-once` | 10 | A repeated check is visible where it repeats |

Rules 11, 12, 15, 16, 17 and 18 stay out: they need the module's neighbours, and
sending only the file would make Jev guess.

## The key

- `TYPESAFE_API_KEY` wins, so containers and CI need no file at all.
- Otherwise `getAgentDir()/sideroom.json`, holding
  `{ "jevApiKey": "..." }`, written with mode `0600` inside a `0700` directory.
  `getAgentDir()` honours the agent directory environment variable, so a
  rebranded distribution still lands in the right place.
- `F10` opens a masked capture screen. It shows the key source and the session
  call count. `Enter` saves, `Ctrl+U` clears, `Esc` closes. The screen draws its
  own field because the packaged `Input` does not mask, and a key must never
  render.
- The key never enters the session, a message, or a tool result.
- The footer carries the state, the served model once it is known, and the
  session call count: `jev: no key (F10)`, `jev: ready`,
  `jev: ready (jev-1.13.0) · 12 calls`, `jev: out of quota (F10) · 12 calls`,
  `jev: key rejected (F10)`, `jev: rate limited`, `jev: unreachable`. The call
  count is omitted while
  it is zero, and the model appears once known because the cutoff couples the
  code to one model's probability distribution.

## Files

| File | Role |
| --- | --- |
| `extensions/jev/index.ts` | Composition: resolves the key, wires the guard, the shortcut and the footer. |
| `extensions/jev/client.ts` | The single HTTP call, status classification, and the injectable transport. |
| `extensions/jev/model.ts` | Wire shapes, the six questions, the cutoff, the note text. Pure. |
| `extensions/jev/key.ts` | Environment-first key resolution and the owner-only config file. |
| `extensions/jev/guard.ts` | Events, filters, dedup, the circuit breaker, the rate-limit pause and the fail-open paths. |
| `extensions/jev/ui.ts` | The masked capture screen and the footer labels. |
| `extensions/shared/review-note.ts` | The `sideroom:review-note` event name and payload check shared with the guidelines review. |
| `extensions/shared/file-path.ts` | Pi-compatible path resolution and the project-relative path. |

## Tests

`model.test.ts` covers the request shape, the state allowlist, the cutoff,
parsing, the serialized-state budget and the language filter. `client.test.ts`
covers the status-to-failure map including `429`, the fail-open paths, a user
cancel, and the outgoing request following the run's abort signal, with `fetch`
stubbed. `key.test.ts` covers precedence, the owner-only modes and a missing or
malformed config. `guard.test.ts` covers the note handed to the review, the
cutoff, the missing key, the failed mutation, unsupported files, deletion-only
edits, files outside the project, the relative path, Escape, the rate-limit
pause, the transient and quota halts, dedup, input typed during a run, dropped
recorded calls, the session reset and the budget skip. `index.test.ts` covers
the footer states, the shortcut and the non-terminal path. No test touches the
network.
