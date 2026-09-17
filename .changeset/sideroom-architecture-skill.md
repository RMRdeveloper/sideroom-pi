---
"@rmrdeveloper/sideroom-pi": minor
---

Add the `sideroom-architecture` skill. It surfaces the architectural decisions a
change forces so the agent asks them through `sideroom_ask` instead of assuming
a default and starting to type. The skill is judgment-first: it names the
dimensions a change touches (boundaries, data ownership, integration, quality
attributes, failure, operations, cost, lock-in, reversibility) as a reference,
not a mandatory checklist, and requires a number, a range, or an explicit
`Out of scope` before any dimension closes.

`sideroom_ask` prompt guidelines now delegate architectural decisions to the new
skill, and `sideroom-grill` drives it for the architectural part of an
interview.
