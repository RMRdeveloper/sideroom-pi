---
"@rmrdeveloper/sideroom-pi": minor
---

Add `explain`: once an implementation settles, the agent now offers a
walkthrough through `sideroom_ask` — explain the changes and how to test them,
only how to test them, or nothing. The offer fires on `agent_settled`, the only
point with no retry, compaction, or queued continuation left, so it never lands
on work that is still being reworked.

It triggers once per user prompt, only after a successful `write` or `edit`, and
only in the TUI, because `sideroom_ask` rejects every other mode. No tool, no
widget, and no persisted session state: `done` keeps its single meaning, and a
problem in the offer cannot affect the green-before-finish gate.
