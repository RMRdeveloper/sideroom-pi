---
"@rmrdeveloper/sideroom-pi": patch
---

Raise the `sideroom_research` time limit from 2 to 30 minutes, including finalization. The default and the ceiling of `SIDEROOM_RESEARCH_TIMEOUT_MS` both become 1,800,000 ms, so the operator can still lower it but not raise it further.
