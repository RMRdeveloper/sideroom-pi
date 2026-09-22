# Walkthrough offer (`explain`)

Once an implementation settles, the agent offers to explain what changed and how
to test it, through `sideroom_ask`. There is no tool, widget, or persisted
state. The turn's in-memory state decides when to send one steer.

## Trigger

| Moment | Effect |
| --- | --- |
| `input` from `interactive` or `rpc` | Clears the turn state, so a new user prompt re-arms the offer. |
| `tool_result` for a successful `write`/`edit` | Adds the resolved file path to the turn's mutated files. |
| `agent_settled` | Defers while the settle mutated files, so the review runs first, and sends the offer at the next settle when the turn reached five distinct files, nothing was offered yet, and the mode is `tui`. |

`agent_end` is deliberately not used. Pi may still retry, auto-compact, or drain
queued messages after it, so an offer there could land on work that is about to
be redone. `agent_settled` is the documented point where none of that is left.

## Limits

- **Once per turn.** The flag is set before the steer is sent, so the turn the
  offer itself triggers cannot re-trigger it.
- **One settle of delay.** The guidelines review steers on the same event, and
  Pi runs both deferred steers in extension load order, which comes from the
  filesystem. Explain holds its own steer back one settle so the review always
  runs first. A settle that mutates below the threshold still arms the delay, so
  a review turn that crosses the threshold is not lost; if no follow-up settle
  arrives, the offer is skipped for that prompt.
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

## Tests

`model.test.ts` covers the deferral decision, the threshold, path keying, and
caps the complete offer at 180 characters. `index.test.ts` covers the wiring, delivery
options, session reset, all silence paths, and re-arming on the next user
prompt.
