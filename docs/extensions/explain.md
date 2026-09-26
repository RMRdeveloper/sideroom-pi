# Walkthrough offer (`explain`)

Once an implementation settles, the agent offers to explain what changed and how
to test it, through `sideroom_ask`. There is no tool, widget, or persisted
state. The turn's in-memory state decides when to send one steer.

## Trigger

| Moment | Effect |
| --- | --- |
| `input` from `interactive` or `rpc` while the agent is idle | Clears the turn state, so a new user prompt re-arms the offer. A message typed while the agent runs joins the current run and changes nothing. |
| `tool_result` for a successful `write`/`edit` | Adds the resolved file path to the turn's mutated files. |
| `agent_before_settle` | Defers while the run mutated files, so the review runs first, and appends the offer at the next boundary when the turn reached five distinct files, nothing was offered yet, and the mode is `tui`. Skipped when the run was aborted or errored, or a user message is pending. |

`agent_end` is deliberately not used. Pi may still retry, auto-compact, or drain
queued messages after it, so an offer there could land on work that is about to
be redone. `agent_before_settle` runs after all of that, and its continuation
stays inside the same run.

`agent_settled` is not used either. Pi documents it as notification-only; a
steer sent there with `triggerTurn` opens a second run after the user already
saw the agent stop, and it fires after Escape too.

## Limits

- **Once per turn.** The flag is set when the offer is appended, so the
  continuation the offer itself starts cannot re-trigger it.
- **One boundary of delay.** The guidelines review steers on the same event,
  and Pi runs both handlers in extension load order, which comes from the
  filesystem. Explain holds its own steer back one boundary so the review always
  runs first; the review's continuation brings the next boundary. A boundary
  that mutates below the threshold still arms the delay, so a review
  continuation that crosses the threshold is not lost; if no later boundary
  arrives, the offer is skipped for that prompt.
- **Never over the user.** An aborted or errored run, or a user message waiting
  in the queue, skips the offer; the deferral is kept for the next boundary.
- **At least five distinct files.** `EXPLAIN_FILE_THRESHOLD = 5` files must be
  mutated in the turn. Files are counted through the same aliases as Pi's
  built-in file tools and existing paths are canonicalized, so relative,
  `@`-prefixed, home-relative, absolute, and symbolic-link paths to one file
  count once. A turn that touches fewer files stays silent, because a small
  adjustment does not need a walkthrough.
- **Only in the TUI.** `sideroom_ask` returns an explicit UI-not-available error
  in every other mode, so `explain` gates on `ctx.mode === 'tui'`.
- **Only after a real mutation.** A failed `write`/`edit` does not count.
- **No green requirement.** An agent that settles with red checks still gets the
  offer. Tightening that would mean reading `done`'s internal state; the
  trade-off is left open on purpose.

## The offer

The steer names the intent, not the final sentence:

> Use sideroom_ask for one question in the user's language with four parallel
> options: changes only, test steps only, both, or no explanation. Recommend
> changes only.

The agent writes the question in the user's language, because the extension
cannot know which language the user speaks, and it writes the four labels in one
grammatical form: four noun phrases, never a verb phrase beside a subordinate
clause. *Parallel* is the whole instruction the extension gives; the wording is
the agent's.

The rest of the questionnaire contract — four options, one recommendation, plus
the always-on *Out of scope* and custom answer — stays owned by `sideroom_ask`.
Declining is a caller option here rather than *Out of scope*, so the question
renders six rows.

## Files

| File | Role |
| --- | --- |
| `extensions/explain/index.ts` | Creates the turn state and clears it on `session_start`. |
| `extensions/explain/model.ts` | The turn state, the five-file threshold, path keying, the TUI gate, the deferral decision, and the offer text. |
| `extensions/explain/guard.ts` | Event wiring and the single steer. |
| `extensions/shared/file-path.ts` | Pi-compatible path aliases and canonical file identity. |
| `extensions/shared/settle.ts` | When a boundary accepts a steer, the hidden steer entry, and which `input` opens a turn. |

## Tests

`model.test.ts` covers the deferral decision, the threshold, path keying, and
caps the complete offer at 180 characters. `index.test.ts` covers the wiring,
session reset, all silence paths including abort and error, input typed during
a run, re-arming on the next idle prompt, and the review arriving before the
offer in both extension load orders.
