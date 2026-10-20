# Walkthrough offer (`explain`)

The walkthrough offer joins an already necessary end-of-work continuation.
It never requests a model response by itself. There is no tool, widget, or
persisted state.

## Trigger

Successful `write`/`edit` results count distinct paths using Pi's aliases and
canonical file identity. At least five files must have changed in the user
turn, and the mode must be `tui` because the offer uses `sideroom_ask`.

At a completed, quiet `agent_before_settle`, the shared settle guard selects
necessary work: review and late semantic notes, then a pending persona
correction, then checks/coverage. Through `sideroom:settle-supplement`, explain
can append its instruction to that same continuation, regardless of extension
load order. The instruction says to finish the implementation, review and
checks before asking the question. The offer cannot claim that checks passed.

If no stage needs to continue, explain stays silent. This also applies when
explain runs alone or the five-file threshold is reached after the last
necessary continuation. The extension does not wake the model just to offer
an optional explanation.

## Limits

- Once per user turn, marked only when the supplement is actually appended.
- Only successful file mutations count; aliases of one file count once.
- Aborts, errors, queued messages and earlier continuations do not consume the
  offer. It does not run on `agent_end` or `agent_settled`.
- Idle interactive/RPC input re-arms it; input typed during a run does not.
- `session_start` clears its in-memory state.

## The offer

After finishing the requested work, review, and checks:

> Use sideroom_ask for one question in the user's language with four parallel
> options: changes only, test steps only, both, or no explanation. Recommend
> changes only.

The agent writes the wording in the user's language. `sideroom_ask` owns the
recommendation, Out of scope and custom-answer rows.

## Files and tests

`index.ts` initializes session state; `model.ts` owns file counting, the TUI
gate, the threshold and the offer text; `guard.ts` records mutations and
registers the supplement. `extensions/shared/settle.ts` owns necessary
continuations and supplement collection through Pi's synchronous event bus.

`model.test.ts` covers the threshold, aliases and re-arming. `index.test.ts`
covers non-triggering standalone behavior, load order, successful mutations,
input timing, resets, and abort/error paths. `shared/settle.test.ts` verifies
coalescing with review, persona and checks without an extra closing turn.
