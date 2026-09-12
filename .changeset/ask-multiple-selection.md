---
"@rmrdeveloper/sideroom-pi": minor
---

Add multiple-selection questions to `sideroom_ask`. A question can declare
`selectionMode: "multiple"` and list `recommendedIndices` instead of
`recommendationIndex`; the TUI marks every recommendation without pre-checking
it, toggles with `Space` or a digit, confirms with `Enter`, and keeps the
question unanswered until at least one option is picked. Answers stay additive:
`AskAnswer.selections` carries the picked options while `value`, `label`, and
`index` mirror the first one, so existing single-selection readers keep working.
Out of scope and the custom answer remain exclusive with the selections, and the
tool stays TUI-only.
