# `sideroom_todo`

A live, user-visible work board the parent agent maintains and the user steers
through chat. State lives in the session branch; no repository task file and no
`/todos` command exist.

## Actions

| Action | Effect | Modes |
| --- | --- | --- |
| `propose` | Replaces the whole board, including clearing it with an empty list. | TUI only |
| `update` | Applies atomic `{ id, status?, content? }` patches. | All modes |

`update` is how the agent completes the current item and starts the next one in
the same call. A patch that changes neither `status` nor `content` is invalid,
and no batch may repeat an `id`.

## Model

```ts
type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}
```

- `id`: trimmed, 1–32 characters, unique.
- `content`: trimmed, 1–200 characters.
- Board size: 0–20 items.
- Ids are never renumbered.

### Invariants

- At most one item may be `in_progress`.
- If any item is `pending`, exactly one must be `in_progress`.
- With no `pending` items, there may be zero or one `in_progress`.
- `completed` and `cancelled` are resolved states.
- An empty `propose` clears the board.

`parseTodoParams()` checks the schema then validates semantics.
`applyTodoParams()` validates every patch before exposing the resulting list, so
a rejected update leaves the board untouched.

## Tool schema compatibility

`sideroom_todo` registers `TodoToolParametersSchema` with Pi: a flat, top-level
object with `action`, optional `items`, and optional `patches`. The strict
discriminated union (`TodoParamsSchema` → `anyOf`) is still the validator inside
`parseTodoParams()`, so `{ action: 'propose' }` without `items` passes the
registered schema but is rejected at runtime.

This split is a workaround for Claude Code. It silently discards **every** tool
from an MCP server when a single tool's `inputSchema` has a non-object top level
(`anyOf`/`oneOf`/`allOf`), reporting the server as connected while ingesting
zero tools. That makes `pi-claude-code-provider` fail initialization with
`observed: none`. References:

- anthropics/claude-code#88049 — one non-object top-level inputSchema drops all
  tools of an HTTP MCP server.
- anthropics/claude-code#92900 — stdio twin: one invalid property schema drops
  all tools of the server.

When to revert: once Claude Code (or the provider) stops discarding the whole
server — or normalizes the schema — register `TodoParamsSchema` in
`extensions/todo/index.ts` again and delete `TodoToolParametersSchema`,
`TodoToolParameters`, and the flat-schema guard test in `model.test.ts`.

## Board block

Before every turn, `before_agent_start` sends the compact board as a session
message (`customType: 'sideroom-todo-board'`, `display: false`) and only when it
differs from the last block it sent:

```text
sideroom_todo (live board; do not recap in prose)
> auth   in_progress  Add login route
- tests  pending      Cover login
✓ schema completed    Item types
~ extra  cancelled    Optional telemetry

Call sideroom_todo update before the next item. While any item is pending,
exactly one must be in_progress. Complete the current item and start the next in
the same update. propose replaces the list; update patches by id.
```

Marks: `>` in progress, `-` pending, `✓` completed, `~` cancelled.
`formatBoardBlock()` is shared by the board block and the widget.

Sending the block as a message keeps the system prompt byte-identical while the
agent works, which is what prompt caching needs: a system prompt that changes
invalidates the cached prefix of the whole request. An unchanged board sends
nothing. `session_start` and `session_tree` forget the last sent block because
a restore can drop it from the model's context. `session_compact` does the same;
when automatic compaction retries the interrupted turn, it also queues the
current block immediately so the retry cannot run without the board.

## Widget

`ctx.ui.setWidget('sideroom-todo', …)` renders a header
(`Sideroom board (N active, M queued)`) plus **at most five** item rows colored
by status, and a dim `…+N more · F9: view all` line when rows are hidden.

- *Open items* (`in_progress` and `pending`) survive the cap first; resolved
  items (`completed` and `cancelled`) are hidden before them.
- Visible rows keep their board order, and the single `in_progress` item always
  gets a row even when it falls outside the first five.
- The cap is display-only: `formatBoardBlock()` still sends every item to the
  agent.

`F9` opens a read-only overlay with 12 visible rows, `↑`/`↓` and `PgUp`/`PgDn`
scrolling, and `Esc`/`F9` to close. It mutates nothing; `propose` and `update`
stay the only writers. The overlay is only offered in TUI mode and when the
terminal is at least 60 columns wide.

An empty board removes the widget. It refreshes on `session_start`,
`session_tree`, `session_compact`, and after each successful tool call. After
each refresh, todo emits `sideroom:todo-widget-refreshed` so `modified-files`
can reapply its widget below the board.

## Persistence

Every successful `propose`/`update` writes:

```ts
pi.appendEntry('sideroom-todo', { items });
```

and returns the items in the result `details` for history fallback.

Reconstruction:

1. Walk `ctx.sessionManager.getBranch()` from the end for the latest custom
   entry with `customType: 'sideroom-todo'`.
2. A stored empty list is valid and final — do not fall back.
3. Only if no snapshot exists, use the latest `sideroom_todo` tool-result
   `details` on the branch.

A forked session inherits the board visible at its fork point and then evolves
independently.

## Board reminders

After the first successful `write` or `edit` of a user turn, append one hidden
`sideroom-todo-reminder` with `{ triggerTurn: false, deliverAs: 'steer' }`.
Pi appends it at the end of the current turn without scheduling another model
response. The next natural response can act on it.

With an empty board, suggest `propose` only in the TUI and only for a multi-step
implementation. With an open board, remind the agent to update at task
milestones, combining completion and the next task in one call. A closed board,
`bash`, reads, and failed mutations do not trigger a reminder. The reminder
never treats a tool call as proof that a task finished.

The allowance resets on idle interactive/RPC input and `session_start`, not on
each model turn or a message typed while the run is active. There is no
`turn_end` watchdog and no forced continuation for board bookkeeping.

## Files

| File | Role |
| --- | --- |
| `extensions/todo/index.ts` | Registers the tool and composes collaborators. |
| `extensions/todo/model.ts` | Schemas, parsing, normalization, invariants, board formatting. |
| `extensions/todo/execute.ts` | Builds propose/update results without mutating the store. |
| `extensions/todo/session.ts` | Snapshot reconstruction, widget refresh, board-block message, refresh event. |
| `extensions/todo/guards.ts` | Non-triggering board reminders. |
| `extensions/todo/ui.ts` | Read-only widget, row cap, hidden-row hint, and `F9` overlay. |

## Tests

`model.test.ts` covers limits, normalization, patches, duplicates, unknown ids,
and invariants. `execute.test.ts` covers TUI vs. non-TUI. `session.test.ts`
covers snapshot reconstruction, including the canonical empty list, and the
board-block message on change and after a restore.
`ui.test.ts` covers the row cap, the hidden-row hint, and the overlay.
`index.test.ts` covers persistence, injection, refresh, shortcut registration,
and guard behavior.
