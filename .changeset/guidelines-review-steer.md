---
"@rmrdeveloper/sideroom-pi": minor
---

Add a one-shot guidelines review steer. After any successful `write`/`edit`, `extensions/guidelines/review.ts` sends a hidden `agent_settled` message asking the agent to re-check every changed file against the loaded language guide and run the relevant formatter, linter, type checks, and tests. Fires at most once per turn; resets on interactive input and `session_start`.
