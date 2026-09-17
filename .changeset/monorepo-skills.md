---
"@rmrdeveloper/sideroom-pi": minor
---

Add trusted monorepo child-folder skill discovery. Sideroom now contributes
`.pi/skills` and Pi-compatible `.agents/skills` entries from up to three levels
below Pi's working directory, respects ignore files and `--no-skills`, and
leaves duplicate-name precedence and diagnostics to Pi.
