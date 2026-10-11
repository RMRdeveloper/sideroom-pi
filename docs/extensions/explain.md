# Walkthrough offer (`explain`)

Once an implementation settles, the agent offers to explain what changed and how
to test it, through `sideroom_ask`. There is no tool, widget, or persisted
state. The turn's in-memory state decides when to send one steer.

## Trigger

| Moment | Effect |
| --- | --- |
| `input` from `interactive` or `rpc` while the agent is idle | Clears the turn state, so a new user prompt re-arms the offer. A message typed while the agent runs joins the current run and changes nothing. |
| `tool_result` for a successful `write`/`edit` | Adds the resolved file path to the turn's mutated files. |
| `agent_before_settle` | Offers when five distinct files changed and the mode is `tui`, after pending guidelines review, semantic follow-ups, and check/coverage steers. Yields to aborts, errors, any queued message, or an earlier continuation. |

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
- **After review and checks.** The shared settle guard queries pending stages
  through Pi's synchronous event bus. Review, including late semantic notes,
  has first priority; checks and the coverage notice have second priority; the
  offer comes last. Only one stage steers at a boundary, in every extension
  loading order. No fixed one-boundary delay is needed, and the offer also
  works when the other extensions are disabled.
- **Never over queued work.** An aborted or errored run, any pending message,
  or an earlier handler's continuation postpones the offer without consuming it.
- **At least five distinct files.** `EXPLAIN_FILE_THRESHOLD = 5` files must be
  mutated in the turn. Files are counted through the same aliases as Pi's
  built-in file tools and existing paths are canonicalized, so relative,
  `@`-prefixed, home-relative, absolute, and symbolic-link paths to one file
  count once. A turn that touches fewer files stays silent, because a small
  adjustment does not need a walkthrough.
- **Only in the TUI.** `sideroom_ask` returns an explicit UI-not-available error
  in every other mode, so `explain` gates on `ctx.mode === 'tui'`.
- **Only after a real mutation.** A failed `write`/`edit` does not count.
- **Bounded checks.** The offer waits while `done` has an eligible steer. If
  its steering budget is exhausted, the offer may still appear with red checks;
  the offer itself does not claim that checks passed.

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
| `extensions/explain/model.ts` | The turn state, the five-file threshold, path keying, the TUI gate, the offer decision, and the offer text. |
| `extensions/explain/guard.ts` | Event wiring and the single steer. |
| `extensions/shared/file-path.ts` | Pi-compatible path aliases and canonical file identity. |
| `extensions/shared/settle.ts` | When a boundary accepts a steer, the hidden steer entry, and which `input` opens a turn. |

## Tests

`model.test.ts` covers the offer decision, the threshold, path keying, and
caps the complete offer at 180 characters. `index.test.ts` covers the wiring,
session reset, all silence paths including abort and error, input typed during
a run, re-arming on the next idle prompt, and the review arriving before the
offer in both extension load orders.
