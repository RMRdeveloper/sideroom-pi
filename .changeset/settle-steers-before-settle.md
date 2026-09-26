---
"@rmrdeveloper/sideroom-pi": patch
---

Stop the guidelines review and the walkthrough offer from taking over the next
request. Both steered through `sendMessage` on `agent_settled`, which Pi
documents as notification-only: each steer opened a new run after the agent had
already stopped, fired after Escape and after errors, and a message typed during
the run re-armed the review, so asking for the explanation could start another
review instead. They now append a hidden `custom_message` entry on
`agent_before_settle` with `continue: true`, so the steer stays inside the same
run. They skip aborted or errored runs and runs with a pending user message,
keep the entries earlier handlers proposed, and reset only on input that
arrives while the agent is idle. `extensions/shared/settle.ts` holds these
shared rules. `agent_before_settle` needs Pi 0.87.0 or later; the development
dependencies move to 0.87.1.
