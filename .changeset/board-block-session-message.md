---
"@rmrdeveloper/sideroom-pi": minor
---

`sideroom_todo` now sends its board block as a session message on
`before_agent_start`, and only when the block changed since the previous turn,
instead of appending it to the system prompt. You see the same board and the
agent reads the same items; `session_start`, `session_tree`, and
`session_compact` re-send the block after a restore.

A system prompt that changed on every board update invalidated the cached prefix
of the whole request. In ten recorded sessions of this repository, turns opened
after a board update re-sent 82% of the context on average, 129,842 tokens,
against 5,450 tokens when the board did not change.
