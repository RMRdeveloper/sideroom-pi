# Edited files (`modified-files`)

Session-scoped tracking of files changed by successful Pi `write` and `edit`
calls. It records agent editing activity, not the Git working tree.

## Contract

- **Trigger:** only successful built-in `write` and `edit` tool results.
- **Ignore:** errors, shell commands, Git, people, subagents.
- **Storage:** the active Pi session branch. No state is written to the target
  project.
- **Reset:** a new session starts clean.

## Recording

On `tool_result`, a successful `edit`/`write` resolves its `input.path` against
`ctx.cwd`, moves that path to the front of the list, and deduplicates. The list
is capped at **100** tracked files.

## Widgets

| View | Limit | Notes |
| --- | --- | --- |
| Compact (above editor) | 5 paths | Reapplied after `sideroom:todo-widget-refreshed` so it stays below the board. |
| Extended (`F8`) | 12 visible, scrollable | The full session history. |

- Each path is an OSC 8 `file://` link built with `pathToFileURL()`; click
  behavior depends on the terminal.
- Paths whose resolved location is outside `cwd` are labelled `external:`.
- The overlay closes with `Esc` or `F8`, scrolls with `↑`/`↓` and
  `PgUp`/`PgDn`, and clears the session history with `R` (writing an empty
  snapshot).
- The overlay is only offered in TUI mode and when the terminal is at least 60
  columns wide.

## Persistence

Every successful record and every reset appends:

```ts
pi.appendEntry('sideroom-modified-files', { files });
```

Restoration walks `getBranch()` from the end for the latest valid snapshot. An
intentionally empty snapshot is final. With no snapshot, the code reconstructs
from the branch by matching successful tool results to the assistant tool calls
that produced them.

## Files

| File | Role |
| --- | --- |
| `extensions/modified-files/index.ts` | Composes events, the refresh listener, and the `F8` shortcut. |
| `extensions/modified-files/model.ts` | Record/dedupe/cap, path resolution and display, snapshot reader. |
| `extensions/modified-files/session.ts` | Event handling, snapshots, reconstruction, widget refresh. |
| `extensions/modified-files/ui.ts` | Compact widget, overlay controller, and overlay component. |

## Tests

`model.test.ts` covers recording, dedupe, capping, and display. `session.test.ts`
covers snapshots, empty resets, and fallback reconstruction. `ui.test.ts` covers
the compact widget, link rendering, and overlay behavior. `index.test.ts` covers
composition.

## Maintenance contract

The original design contract is preserved in
[`../modified-files-plan.md`](../modified-files-plan.md).
