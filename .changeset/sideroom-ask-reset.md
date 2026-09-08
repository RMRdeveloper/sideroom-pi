---
"@rmrdeveloper/sideroom-pi": major
---

Replace the `/sideroom` coding pipeline with the `sideroom_ask` question tool.

This major release removes the isolated planner/implementer/reviewer/verifier/fixer
pipeline, the `/sideroom` command, packaged skills, and language guideline layers.
The package now registers one parent-agent TUI questionnaire from
`extensions/ask/`. Each question requires a recommendation; the UI always adds
Out of scope and a custom answer. Pi loads TypeScript extensions directly.
