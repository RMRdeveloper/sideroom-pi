---
"@rmrdeveloper/sideroom-pi": patch
---

Register `sideroom_todo` with a flat, top-level object schema so Claude Code keeps every tool from the Pi MCP bridge. Claude Code silently drops all tools of an MCP server when one tool's `inputSchema` has a non-object top level, which `sideroom_todo`'s discriminated union emitted. The strict union is still enforced by `parseTodoParams`, and the workaround is documented for removal once the upstream bug is fixed.
