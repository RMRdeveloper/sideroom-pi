---
"@rmrdeveloper/sideroom-pi": minor
---

Add an optional Jev review. After a successful `write` or `edit`,
`extensions/jev/` asks TypeSafe's Jev decision model about the six guide rules
no mechanical check can decide (3, 4, 7, 8, 9, 10) on the changed file, and
appends a note to the tool result when an answer clears the probability cutoff.
It never blocks, never reaches the system prompt, and sends only the file body
and the added lines. Without a key nothing is called; on quota exhaustion, a
rejected key, or an unreachable endpoint it goes quiet instead of slowing the
turn down. The key comes from `TYPESAFE_API_KEY` or from
`getAgentDir()/sideroom.json`, captured with `F10` through a masked screen.
