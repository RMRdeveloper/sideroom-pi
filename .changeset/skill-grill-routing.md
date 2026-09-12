---
"@rmrdeveloper/sideroom-pi": patch
---

Route grilling to `sideroom-grill` by default. The skill description now claims
non-trivial plans before implementation and states precedence over other
grilling, interview, and spec skills; the `sideroom_ask` tool guidelines point
at that skill; and the README documents coexisting with third-party grilling
skills. Its recommendation rule now matches the ask contract: a question needs
`recommendationIndex` for a single answer, or `recommendedIndices` when it
declares `selectionMode: "multiple"`.
