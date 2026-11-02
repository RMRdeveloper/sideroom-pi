---
"@rmrdeveloper/sideroom-pi": patch
---

Apply the Sideroom voice to the text the agent writes inside `sideroom_ask` and
`sideroom_todo`, and rewrite the fixed tool messages so each one says what
happened and what to do next. The scope lives in `VOICE_SCOPE` and the shared
`TOOL_TEXT_VOICE_NOTE`, so the reminder, the guide and both tools cannot drift.
No new block, steer, model call or continuation is added: text inside tool
arguments stays instruction-only.
