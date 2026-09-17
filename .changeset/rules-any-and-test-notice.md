---
"@rmrdeveloper/sideroom-pi": minor
---

`sideroom_rules` now blocks `any` in a type position and flags `@ts-ignore` and
`@ts-nocheck`. Replace `any` with the type the value actually has; `unknown` is
the way out when the value must be narrowed first. The check reads code with
strings and comments masked, so `'any'`, `// any`, `anyValue` and `record.any`
pass, and the project's own type check still has the last word on whether the
replacement compiles.

`sideroom_done` also notes a run that changed code files without touching a test
file. It fires once per run, only when the project has a test setup, and never
blocks; the check gate keeps priority while the checks are red.
