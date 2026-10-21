# Jev review

An optional semantic pass over changed code, successful questionnaires, and newly completed tasks. Jev is
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
- **A queued review for each successful mutation worth asking about**, carrying only the
  applicable `noul` questions and one shared state. No request is made for a
  file outside a supported language (`.md`, `.json`, `.yaml`, lockfiles), for an
  edit that adds no lines, or for a file outside the working directory.
- **State is the changed file, its added lines, and bounded related source.**
  `file` holds the project-relative path, language and complete body; `change`
  holds the kind and added lines. `context` holds up to four complete directly
  related source files, with their relative paths and relation (`imported`, `consumer` or
  `test`), plus a `partial` flag when discovery or selection was incomplete.
  Relevant tests take priority, then production consumers, then imports. A sibling
  test convention also counts as a direct relation, in either direction. Files outside the working directory,
  ignored files, hidden paths, symlinks, dependency/build folders and
  sensitive-named paths are excluded. These path checks do not detect a secret
  embedded in an otherwise ordinary source file. The conversation, session,
  documentation, configuration, git history and environment never travel.
  Workflow requests below send only the selected question or task wording.
- **Trigger.** `tool_call` records the added lines, because after a `write` the
  previous content is already gone. `tool_result` reads the resulting body from
  disk and queues a review without waiting for HTTP. A call another extension
  blocks never reaches `tool_result`,
  so recorded calls are dropped on `turn_end` and on `session_start`.
- **Budget.** The official Jev 1.13 limits are 32k tokens for state plus the
  longest question and 64k tokens for the entire request. Without a service
  tokenizer, Sideroom conservatively bounds their JSON UTF-8 size to 32,000
  and 64,000 bytes, respectively. A complete changed file that does not fit
  skips review; related files that do not fit are omitted whole. The scan stops
  after 1,024 source files or ten folder levels and never includes more than
  four neighbours. Incomplete discovery sets `context.partial` rather than
  pretending the missing evidence is absent.
- **Background queue.** One request runs while the parent agent continues;
  at most sixteen snapshots wait. A new review replaces queued work for the
  same subject and cancels an older active version. At capacity, the producing tool waits for a free slot instead of
  discarding a distinct file review. Source requests track
  their observed dependencies; changes to those files cancel stale snapshots.
  Surviving added lines from a retained prior file snapshot are merged into
  the latest review. Completion snapshots are invalidated by source/check
  changes. The existing four-file evidence limit still applies.
- **Drain before review.** At a completed, quiet `agent_before_settle`, shared
  guards wait for queued reviews before selecting priorities or consuming
  notes, regardless of extension load order. The HTTP wait does not request an
  extra model turn. Standalone Jev also drains at this boundary.
- **Escape cuts the request.** Requests combine the run signal and queue
  cancellation with the three-second HTTP timeout. No request starts for an
  aborted run, a missing/changed key or a paused breaker. Cancelled/replaced
  responses cannot emit notes or change the breaker, even if a transport
  ignores cancellation. Idle user input, session reset, key rearm and shutdown
  cancel outstanding work. Session call counts reflect actual started requests.
- **Cutoff.** An answer at or above `0.8` probability becomes a note. A `noul`
  carries no confidence field, so the probability itself is the only brake.
- **Usage counter.** Every request increments a counter for the active session.
  It resets on `session_start` and never touches disk. The footer and the F10
  screen show it; the endpoint returns no token or cost figures, so calls are
  the only honest unit.
- **Dedup.** The same rule on the same file is noted at most once per turn,
  however the model spelled the path. Questionnaire and board rule notes are
  also capped once per tool and rule per user turn. The turn starts on `input` from
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

## Additional code judgments

- `testability` (18): hardcoded clock, network or randomness in business code,
  with an explicit exception for adapters and composition boundaries.
- `unnecessary-abstraction` (12–14): demonstrably redundant layers or merged
  distinct domain concepts. One caller or delegation alone is not a violation;
  current responsibilities, compatibility, testability and decomposition by intent
  remain valid reasons.
- `decomposition-by-intent` (20, structural): coherent implementation details
  that obscure orchestration, or a new split that makes tightly coupled steps
  harder to understand. Requires visible bodies for the operation and its
  surrounding orchestration or helper caller in the changed file or supplied
  related source. A named operation with a clear contract is useful even with
  one caller. Length alone is never a violation; shared mutable state, excessive
  parameters or needing to read both functions are reasons to keep steps
  together. Insufficient evidence is not a finding. This question joins the same
  bounded request; it adds no call, length detector or blocking rule.
- `contract-compatibility`: a concrete mismatch between the changed contract
  and a supplied non-test consumer. Omitted without such a consumer.
- `test-quality`: assertions that cannot catch the changed behavior or an
  explicit changed error branch left untested in the supplied relevant tests.
  Requires both production and test bodies. Partial context is never proof that
  repository coverage is absent; this does not measure coverage or run tests.

Source-reference discovery still cannot resolve every alias or dynamic import.
Sibling test names cover `.test`, `.spec`, `_test`, `test_` and `Test.java`;
matching basenames elsewhere in the project are not enough.

## Questionnaire and completion reviews

A successful, non-cancelled `sideroom_ask` result makes one additional request
with the validated question batch: prompts, options and recommendation indexes.
It asks about overlapping single-choice options, bundled independent decisions,
and visibly contradictory or unsupported factual recommendations. User answers
and conversation history are excluded. This is an end-of-run advisory review,
not a gate before the questionnaire appears. It never silently reverses an answer.

A successful `sideroom_todo` result makes at most one additional request for
newly completed or reworded completed items targeted by that call. It sends only
those items and up to four most recently observed changed files with their
complete bodies and added lines, without their neighbouring files. The evidence
is in memory, bounded and reset on an idle user prompt, session start or manual
rearm. Whole snapshots are omitted when the request budget is exceeded and
`partial` is set. Deletion-only or oversized edits invalidate an older snapshot.
There is no request without source evidence or an observed check result.

Only the status of the detected project check travels: `passed`, `failed`,
`unknown`, or `stale` after a later supported source mutation. Commands, logs,
configuration and arbitrary shell output are excluded. Jev asks for an explicit
contradiction between a completion claim and visible evidence; an omitted file,
unknown checks or stale checks do not establish incomplete work. Arbitrary shell
mutations are not tracked, so a status is evidence from Pi's observed tools, not
a guarantee of the current filesystem.

All request types share the key, timeout, abort signal, probability cutoff,
session call counter, rate-limit pause and circuit breaker. Notes alone can arm
one guidelines review even if no code changed; it verifies question/task
contracts and runs checks only if code changes. Extra questions in the existing
code request add no extra calls; workflow reviews do add calls.

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
| `extensions/jev/workflow.ts` | Validated workflow requests, bounded changed-file evidence, completion transitions and budgets. |
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

`workflow.test.ts` covers parsed-question privacy, completion targeting, whole-file
budgets, evidence eviction, check invalidation and turn reset. Guard tests also
exercise workflow calls, failure policies, cancelled questionnaires and exclusion
of user answers and command output. These tests stub Jev; real-model false-positive
rates have not been measured.

`extensions/jev/queue.ts` owns bounded background scheduling; its tests cover
replacement, dependency invalidation, cancellation, backlog limits and errors.
Shared settle tests verify that delayed notes reach review before settling.
