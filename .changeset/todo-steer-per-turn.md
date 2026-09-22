---
"@rmrdeveloper/sideroom-pi": patch
---

Fix the todo board watchdog so it fires once per turn instead of once per run.
`extensions/todo/guards.ts` kept `steerFromUs` set until the next interactive
input, so the propose nudge silenced every later update steer in the same run
and the agent updated the whole board only after finishing the work. It now
resets on `turn_start` with the other per-turn counters.
