# 0004. The board block travels as a session message

- **Status:** Accepted
- **Date:** 2026-09-16

## Context

`before_agent_start` appended the board block to `systemPrompt`, so the block
was the tail of the system prompt and the agent read it on every turn.

The board changes while the agent works: the agent calls `sideroom_todo`, and
the next turn opens with a different system prompt. The system prompt sits at
the head of the request, so a change there invalidates the provider's cached
prefix for the whole request — tools, system prompt, and every message.

Ten recorded sessions of this repository show the cost. Turns opened after a
turn that updated the board re-sent 82% of the context on average, 129,842
tokens over 45 turns; turns opened after a turn without a board update re-sent
5,450 tokens on average over 17 turns. The block itself is 80 to 430 tokens.

The system-prompt injection is also the only path to the agent: the tool result
content is `Board updated (N items)`, and the item list in the result `details`
is rendering state, not model input.

## Decision

1. `before_agent_start` returns the board block as a session message
   (`customType: 'sideroom-todo-board'`, `display: false`) instead of replacing
   the system prompt.
2. The block is sent only when it differs from the last block the extension
   sent. An unchanged board sends nothing, so the system prompt stays
   byte-identical for the whole session.
3. `session_start`, `session_tree`, and `session_compact` forget the last sent
   block, so the unchanged board is announced again after a restore that can
   drop it from the model's context. When automatic compaction retries the
   interrupted turn, `session_compact` queues the block immediately.
4. The block content, the five-row widget cap, and the `F9` overlay stay as
   `0002. Capped work-board widget with an `F9` overlay` defines them.

## Consequences

- The provider reuses the cached prefix within a session instead of recomputing
  the context after every board update.
- The block accumulates in the session history, one message per board change,
  each cached after its first send.
- The guidelines and persona reminders still append to `systemPrompt`. They are
  static, so they invalidate nothing.
- The agent reads the board from a message rather than the system prompt, the
  conversion Pi applies to every custom message.

## Alternatives considered

- **Keep the injection and document the cost.** Rejected: the measured cost is
  a full context re-send per board change, and the fix sacrifices no function.
- **Carry the block in the tool result.** Rejected: it would have to become
  result content, the agent would lose the board after a compaction until it
  called the tool again, and every `update` call would grow the context.
- **Send the block on every turn.** Rejected: identical copies accumulate
  without telling the agent anything new.

## References

- `CONTEXT.md` — *Board block*, *Work board*.
- `docs/extensions/todo.md` — the board block and its send conditions.
- `docs/architecture.md` — the `before_agent_start` row.
