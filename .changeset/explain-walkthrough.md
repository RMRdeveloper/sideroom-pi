---
"@rmrdeveloper/sideroom-pi": minor
---

Add `explain`: once an implementation settles, the agent now offers a
walkthrough through `sideroom_ask` — explain the changes only, how to test them
only, both, or nothing. The offer fires on `agent_settled`, the only
point with no retry, compaction, or queued continuation left, so it never lands
on work that is still being reworked.

It triggers once per turn, only after that turn mutated at least five distinct
files, and only in the TUI, because `sideroom_ask` rejects every other mode.
File identity follows Pi's path aliases and canonicalizes existing paths, so one
file cannot inflate the threshold through several spellings. No tool, no widget,
and no persisted session state: `done` keeps its single meaning, and a problem
in the offer cannot affect the green-before-finish gate.
