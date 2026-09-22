---
"@rmrdeveloper/sideroom-pi": minor
---

Count Jev's requests per session. `jev` appends the total to its footer label
(`jev: ready (jev-1.13.0) · 12 calls`) and to the `F10` capture screen. The
count resets on `session_start`, is never persisted, and is omitted while zero;
the endpoint returns no token or cost figures, so calls are the only unit
available.
