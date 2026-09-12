# 0002. Capped work-board widget with an `F9` overlay

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

`sideroom_todo` accepts up to 20 items, and the compact widget rendered one
line per item. A full board therefore pushed the editor and the
`modified-files` widget up the screen, and the widget competed with the code
the user was reading.

`modified-files` already solved the same crowding with a compact widget of five
paths plus an `F8` overlay. Both widgets live above the editor, and the board
sits directly above the edited-file list, so an uncapped board also pushed the
edited-file list out of view.

The board is state the agent must see in full: `before_agent_start` injects it
through `systemPrompt`, and that injection is what the agent acts on. The widget
is only how the user watches the board.

## Decision

1. The compact widget shows at most **five** rows, like the compact
   `modified-files` widget.
2. Open items (`in_progress` and `pending`) survive the cap first; resolved
   items (`completed` and `cancelled`) are hidden before them.
3. The visible rows keep their board order. The single `in_progress` item is
   guaranteed a row even when it falls outside the first five.
4. When rows are hidden, the widget appends a dim `…+N more · F9: view all`
   line. The header keeps counting `active` and `queued`.
5. `F9` opens a read-only overlay with 12 visible rows, `↑`/`↓` and
   `PgUp`/`PgDn` scrolling, and `Esc`/`F9` to close. It mutates nothing: the
   board stays agent-owned and `propose`/`update` remain the only writers.
6. The injected board block is unchanged. All 20 items still reach the system
   prompt; the cap is display-only.

## Consequences

- The widget is bounded, so the edited-file list stays visible below it.
- The board can no longer be read in full from the widget; the overlay and the
  injected block cover that need.
- `extensions/todo/ui.ts` grows the row selector, the hidden-row hint, and a
  second overlay alongside the widget, and `index.ts` registers the `F9`
  shortcut next to the tool.
- Selection logic is pure (`selectVisibleBoardRows`) and unit-tested, so the
  cap rules do not hide inside rendering code.

## Alternatives considered

- **Flat first five in board order.** Rejected: an `in_progress` item late in
  the board would vanish, and the user would lose the one row that matters most.
- **Cap without an overlay.** Rejected: the user would have no way to read the
  hidden rows without asking the agent.
- **Capping the injected block too.** Rejected: the agent must keep every item
  to plan the next step; a truncated prompt would hide work it still owns.
- **Extracting one shared overlay for `modified-files` and `todo`.** Deferred,
  not refused: the two overlays differ in the clear action and the title, and
  one duplication does not yet meet the extraction bar. Revisit once a third
  overlay appears.

## References

- `CONTEXT.md` — *Work board*, *Open item*.
- `docs/extensions/todo.md` — the widget and overlay this decision defines.
- `docs/extensions/modified-files.md` — the compact widget and `F8` overlay
  this one mirrors.
