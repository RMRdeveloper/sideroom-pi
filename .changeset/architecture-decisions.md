---
"@rmrdeveloper/sideroom-pi": minor
---

`ask` and `grill` now classify a decision before asking about it. A decision the
repository already settles consistently is a project fact, and the agent reuses
it without interrupting you. A decision that materially affects architecture,
external dependencies, cost, security, operations, persistence, public
contracts, or the difficulty of changing course later is an architectural
decision: the agent exposes it through `sideroom_ask` with the current
situation, the practical consequences of each alternative, and one
recommendation, before committing to it. Everything else stays a minor decision
the agent takes on its own.

No new tool, hook, or state was added. The classification lives in the
`sideroom_ask` prompt guidelines and self-contained `sideroom-grill` skill. Ask
prompts, labels, and option descriptions stay in the user's language, and an
accepted architectural decision still reaches `docs/adr/` only through the
existing three-gate offer.
