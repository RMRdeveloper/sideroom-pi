# Walkthrough offer (`explain`)

Once an implementation settles, the agent offers to explain what changed and how
to test it, through `sideroom_ask`. There is no tool, widget, or persisted
state. Two in-memory booleans decide when to send one steer.

## Trigger

| Moment | Effect |
| --- | --- |
| `input` from `interactive` or `rpc` | Clears the run state, so a new user prompt re-arms the offer. |
| `tool_result` for a successful `write`/`edit` | Marks that the run changed files. |
| `agent_settled` | Sends the offer when the run mutated files, nothing was offered yet, and the mode is `tui`. |

`agent_end` is deliberately not used. Pi may still retry, auto-compact, or drain
queued messages after it, so an offer there could land on work that is about to
be redone. `agent_settled` is the documented point where none of that is left.

## Limits

- **Once per user prompt.** The flag is set before the steer is sent, so the
  turn the offer itself triggers cannot re-trigger it.
- **Only in the TUI.** `sideroom_ask` returns an explicit UI-not-available error
  in every other mode, so `explain` gates on `ctx.mode === 'tui'`.
- **Only after a real mutation.** A failed `write`/`edit` does not count.
- **No green requirement.** An agent that settles with red checks still gets the
  offer. Tightening that would mean reading `done`'s internal state; the
  trade-off is left open on purpose.

## The offer

The steer names the intent, not the final sentence:

> Use sideroom_ask for one question in the user's language with three options:
> explain changes and test steps, test steps only, or no explanation. Recommend
> one.

The agent writes the question in the user's language, because the extension
cannot know which language the user speaks. The rest of the questionnaire
contract — three options, one recommendation, plus the always-on *Out of scope*
and custom answer — stays owned by `sideroom_ask`.

## Files

| File | Role |
| --- | --- |
| `extensions/explain/index.ts` | Creates the run state and clears it on `session_start`. |
| `extensions/explain/model.ts` | Run state, the TUI gate, and the offer text. |
| `extensions/explain/guard.ts` | Event wiring and the single steer. |

## Tests

`model.test.ts` covers the predicate and caps the complete offer at 160
characters. `index.test.ts` covers the wiring, delivery options, session reset,
all silence paths, and re-arming on the next user prompt.
