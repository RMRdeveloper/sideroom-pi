# Architecture

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages) that
adds a side room to a parent agent: questions, a live work board, an edited-file
view, and quality gates. Nothing it produces lives in the target repository —
all state is held in the active Pi session branch.

## Package layout

Pi discovers every `extensions/*/index.ts` and calls its `export default`
registration function with an `ExtensionAPI`. The manifest wires this up:

```json
"pi": {
  "extensions": ["./extensions"],
  "skills": ["./skills"]
}
```

Helper files inside an extension folder (`.ts` modules) are not extensions;
only `index.ts` is an entry point.

```
extensions/
  ask/            sideroom_ask
  todo/           sideroom_todo
  modified-files/ edited-file tracking
  guidelines/     pre-edit read gate
  rules/          added-line rule checks
  done/           green-before-finish steer
assets/artifacts/GUIDELINES_TEMPLATE.md   canonical rule seed
skills/           packaged agent skills and language guides
scripts/          repository-only tooling (not shipped)
```

## Extension anatomy

Each tool follows the same split so pure logic can be tested without Pi:

| File | Responsibility |
| --- | --- |
| `index.ts` | Registration and composition only. Registers the tool and wires collaborators to events. |
| `model.ts` | Schemas (TypeBox), types, parsing, normalization, invariants, and pure decisions. No Pi imports. |
| `execute.ts` | Turns tool parameters into a result object. Prepares changes but does not mutate the store. |
| `session.ts` | Reconstructs state from the session branch and persists snapshots. |
| `guards.ts` | Steers the agent when it skips a required behavior. |
| `ui.ts` | TUI rendering: widgets, overlays, and custom screens. |

`ask` has no session state and therefore no `session.ts`/`guards.ts`; `rules`
and `done` are pure guards without a tool.

## Lifecycle events

Extensions subscribe through `pi.on(event, handler)`. The events Sideroom uses:

| Event | Used by | Purpose |
| --- | --- | --- |
| `input` | todo, rules, done | Reset per-run state on a real user prompt (`source: 'interactive'` or `'rpc'`). |
| `turn_start` | todo, done | Reset per-turn state. |
| `tool_call` | guidelines, rules, done | Inspect a call before it runs. Return `{ block: true, reason }` to reject it. |
| `tool_execution_start` | todo | Observe any tool starting; drives the propose nudge. |
| `tool_result` | modified-files, guidelines, rules, done | Observe results. May append content for `rules` warnings or record reads. |
| `turn_end` | todo, done | Inspect the finished turn; drives watchdog and done steering. |
| `before_agent_start` | todo, guidelines | Return `{ systemPrompt }` to inject the board block or the guidelines reminder. |
| `session_start`, `session_tree`, `session_compact` | todo, modified-files, guidelines | Rebuild and redraw state after load, branch navigation, or compaction. |

`before_agent_start` returns `systemPrompt` (not `message`) for injected
context. The guidelines guard also resets its read state on `session_compact`
because a summary can drop the loaded guides from context mid-run.

## Session persistence

State survives navigation and compaction by writing custom entries to the
active branch:

```ts
pi.appendEntry('sideroom-todo', { items });
```

Reconstruction walks `ctx.sessionManager.getBranch()` from the end for the
latest custom entry of the expected `customType`. An intentionally empty
snapshot is final; only when no snapshot exists does the code fall back to the
latest tool-result `details` on the branch. Custom entries never reach the LLM,
which is why `todo` re-injects its block before every turn.

Extensions never call `buildContextEntries()`/`getEntries()` and never write
state files into the target project.

**Snapshot keys**

| Extension | `customType` / widget key |
| --- | --- |
| todo | `sideroom-todo` |
| modified-files | `sideroom-modified-files` |
| todo steer types | `sideroom-todo-nudge`, `sideroom-todo-watchdog` |
| done steer type | `sideroom-done-gate` |

## Widgets and ordering

Widgets are installed with `ctx.ui.setWidget(key, factory)`; passing `undefined`
removes one. Pi renders widgets in registration order, so the modified-files
compact widget must reapply *after* the todo board to stay below it.

`todo` emits a cross-extension event after every board refresh:

```ts
pi.events.emit('sideroom:todo-widget-refreshed', ctx);
```

`modified-files` subscribes and reapplies its widget in response. This is the
only cross-extension coupling; it lives in `extensions/todo/session.ts` as
`TODO_WIDGET_REFRESH_EVENT` and is imported by `modified-files/index.ts`.

## Steering the agent

Guards do not block mutations; they send private, hidden messages that nudge
the agent back on track:

```ts
pi.sendMessage(
  { customType: 'sideroom-todo-nudge', content: '...', display: false },
  { triggerTurn: true, deliverAs: 'steer' },
);
```

Guards tag their own messages (`steerFromUs`) so the resulting continuation does
not retrigger a nudge or watchdog, and they cap how often they fire per run.

## Interactivity

`ask` and `todo propose` need a terminal. They check `ctx.mode === 'tui'` and
otherwise return the explicit error `Error: UI not available (running in
non-interactive mode)`. `todo update`, `guidelines`, `rules`, and `done` work in
every mode.

Tool parameters arrive as decoded JSON. `prepareArguments` runs before schema
validation and unwraps nested arrays that some hosts serialise as JSON strings
(the OpenCode wire-format fix shared by `ask` and `todo`).

## Testing and quality

Pure modules (`model.ts`, `execute.ts`, `session.ts`) are written to be unit
testable with injected dependencies. Tests use the built-in `node:test` runner.

```bash
npm run types          # tsc --noEmit
npm run lint           # biome lint
npm run format:check   # biome format
npm test               # node --test extensions/**/*.test.ts
npm run check          # types + check:if-blocks + biome check + tests
```

`scripts/check-if-blocks.mjs` parses every `extensions/**/*.ts` file and
requires braced, multiline conditional bodies — the same rule `sideroom_rules`
enforces on agent edits. Biome is the only linter and formatter; `style/useBlockStatements`
is an error. Releases ship through Changesets on protected `main`; never publish
locally.

## Skills

Skills are on-demand instructions under `skills/`, not extensions. `guidelines`
gates mutations on reading `skills/sideroom-guidelines/SKILL.md` and the matching
language guide; those files are also part of the published package.

| Skill | Role |
| --- | --- |
| `sideroom-guidelines` | The 19-rule contract and per-language guides. |
| `sideroom-grill` | Interviews a fuzzy plan in `sideroom_ask` rounds. |
| `sideroom-domain-modeling` | Resolves language conflicts; writes `CONTEXT.md` and offers ADRs. |
| `sideroom-domain-scaffold` | Code-first repository scan that builds or completes `CONTEXT.md`. |

The canonical rule seed is `assets/artifacts/GUIDELINES_TEMPLATE.md`. It seeds
the skill and guides; it is never pasted into the system prompt.
