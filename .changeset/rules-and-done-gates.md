---
"@rmrdeveloper/sideroom-pi": minor
---

Add two enforcement gates. `sideroom_rules` checks only the lines a write or edit adds: braceless conditionals and swallowed errors block the mutation, while vague names, stale comments, commented-out code, and debug artifacts are appended as notes, with a per-rule circuit breaker. `sideroom_done` detects the project's check command and steers the agent to run it before finishing, clearing green after any later successful mutation.
