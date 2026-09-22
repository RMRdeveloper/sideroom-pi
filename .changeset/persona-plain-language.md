---
"@rmrdeveloper/sideroom-pi": minor
---

Sharpen the persona voice. `plain-language` becomes the first voice rule and
now names the concept jargon to avoid (`hook`, `pipeline`, `registry`,
`resolver`, `guardrail`, `invariant`) unless the user used it. The injected
reminder carries two static Do/Don't example pairs, and persona steers send
`triggerTurn: true` so a correction still reaches the model when the run is
already idle.
