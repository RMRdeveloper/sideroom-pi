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
- **One request per successful mutation worth asking about**, carrying only the
  applicable `noul` questions and one shared state. No request is made for a
  file outside a supported language (`.md`, `.json`, `.yaml`, lockfiles), for an
  edit that adds no lines, or for a file outside the working directory.
- **State is the changed file, its added lines, and bounded related source.**
  `file` holds the project-relative path, language and complete body; `change`
  holds the kind and added lines. `context` holds up to four complete directly
  related source files, with their relative paths and relation (`imported` or
  `consumer`), plus a `partial` flag when discovery or selection was incomplete.
  Imports take priority over consumers. Files outside the working directory,
  ignored files, hidden paths, symlinks, dependency/build folders and
  sensitive-named paths are excluded. These path checks do not detect a secret
  embedded in an otherwise ordinary source file. The conversation, session,
  board, documentation, configuration, git history and environment never travel.
- **Trigger.** `tool_call` records the added lines, because after a `write` the
  previous content is already gone. `tool_result` reads the resulting body from
  disk and asks. A call another extension blocks never reaches `tool_result`,
  so recorded calls are dropped on `turn_end` and on `session_start`.
- **Budget.** The official Jev 1.13 limits are 32k tokens for state plus the
  longest question and 64k tokens for the entire request. Without a service
  tokenizer, Sideroom conservatively bounds their JSON UTF-8 size to 32,000
  and 64,000 bytes, respectively. A complete changed file that does not fit
  skips review; related files that do not fit are omitted whole. The scan stops
  after 1,024 source files or ten folder levels and never includes more than
  four neighbours. Incomplete discovery sets `context.partial` rather than
  pretending the missing evidence is absent.
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
- **Findings cannot block.** The changed file and its neighbours are untrusted
  input; misleading code or comments may still cause a wrong review note. Jev
  can only emit notes for the guidelines review, never mutate code or block a
  write.

## The questions

The six original questions remain: `guard-clauses` (3), `fail-fast` (4),
`command-query` (7), `null-handling` (8), `immutability` (9), and `validate-once`
(10). Rule 10 now requires visible evidence of the same check at the input
boundary and in the added lines, rather than guessing what another file did.

Three questions are added: `single-responsibility` (11) looks for unrelated
work performed inside the changed unit, not merely coordinated by it;
`dependency-direction` (17) runs only when an imported source file is actually
included; and `comments` (19) runs only when added text contains a comment
marker. Every question checks the added lines against the supplied body, not
unchanged code as a new violation. The mechanical rules still cover their
existing local cases. Rules requiring requirements or more distant files stay
in the language guide for the agent's review.

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
| `extensions/jev/model.ts` | Wire shapes, the applicable questions, the byte budget, the cutoff, the note text. Pure. |
| `extensions/jev/context.ts` | Bounded ignore-aware source discovery and complete-file selection. |
| `extensions/jev/key.ts` | Environment-first key resolution and the owner-only config file. |
| `extensions/jev/guard.ts` | Events, filters, dedup, the circuit breaker, the rate-limit pause and the fail-open paths. |
| `extensions/jev/ui.ts` | The masked capture screen and the footer labels. |
| `extensions/shared/review-note.ts` | The `sideroom:review-note` event name and payload check shared with the guidelines review. |
| `extensions/shared/file-path.ts` | Pi-compatible path resolution and the project-relative path. |

## Tests

`model.test.ts` covers the request shape, evidence-based questions, the cutoff,
parsing, the request budget and the language filter. `context.test.ts` checks
imported files, consumers, language references, exclusions and budget skips.
`client.test.ts`
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
