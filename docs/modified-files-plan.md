# Edited files: design contract

`modified-files` is the session-backed Sideroom extension that shows files
successfully changed by Pi. Its implementation, tests, documentation, and
Changeset are present in this branch; retain this document as its maintenance
contract.

## Scope

- Observe only successful built-in `write` and `edit` tool results.
- Do not infer mutations from Git, shell commands, people, or subagents.
- Store state only in the active Pi session branch; never write target-project
  state.
- Treat the list as **files edited during this session**, not the current Git
  working tree.

## Interaction

- The compact widget appears above the editor and contains at most five recent
  paths.
- When the TODO board is active, the file widget must appear directly below it.
  Todo emits `sideroom:todo-widget-refreshed`; files reapply their widget after
  that event because Pi orders widgets by registration order.
- Every path is an OSC 8 `file://` link built with `pathToFileURL()`. Terminal
  support determines whether activation is click, Ctrl+click, or a different
  modifier gesture.
- `F8` opens or closes a scrollable overlay. `Esc` also closes it.
- `R` in the overlay clears the list and writes an empty session snapshot.
- Paths outside `cwd` are visibly prefixed `external:`.

## Persistence

Each successful record and reset appends:

```ts
pi.appendEntry('sideroom-modified-files', { files });
```

On session start, tree navigation, and compaction, restore the latest valid
custom snapshot from `getBranch()`. An intentionally empty snapshot is final.
When a snapshot is absent, reconstruct successful `write` and `edit` results by
matching tool-result IDs to assistant tool calls in the current branch.

## Verification

- Test only successful `write` and `edit` paths are recorded and deduplicated.
- Test snapshots, empty resets, and fallback reconstruction.
- Test the compact widget renders five paths at most and emits OSC 8 links.
- Test overlay scrolling, close, and reset.
- Test Todo refreshes cause the files widget to reapply after the board.
- Run `npm run check` before release.
