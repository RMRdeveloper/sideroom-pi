# Architecture

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages) that
adds a side room to a parent agent: questions, a live work board, an edited-file
view, quality gates, and monorepo child-folder skill discovery. Nothing it
produces lives in the target repository — all state is held in the active Pi
session branch.

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
only `index.ts` is an entry point. `extensions/shared/` has no entry point and
holds the file-path rule and the missing-file read that guards share with Pi's
built-in file tools, plus the prompt-cache contract test that loads every
extension. Tests never sit directly in `extensions/`, because Pi loads every
top-level `.ts` file there.

```text
extensions/
  ask/            sideroom_ask
  todo/           sideroom_todo
  modified-files/ edited-file tracking
  guidelines/     pre-edit read gate and review steer
  monorepo-skills/ trusted child-folder skill discovery
  rules/          added-line rule checks
  done/           green-before-finish steer
  persona/        single built-in voice
  jev/            optional Jev semantic review
  explain/        end-of-work walkthrough offer
  shared/         built-in file-tool path resolution and reads, prompt-cache test
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
| `selection.ts` | Pure multiple-selection reducer: toggling, ordering, and building the answer. No Pi imports. |
| `guards.ts` | Steers the agent when it skips a required behavior. |
| `ui.ts` | TUI rendering: widgets, overlays, and custom screens. |

`ask` has no session state and therefore no `session.ts`/`guards.ts`; it adds
`selection.ts` for the multiple-selection reducer. `rules` and `done` are pure
guards without a tool. `persona` persists no profile state, so it ships
`catalog.ts`, `checks.ts`, and `guard.ts` instead of `session.ts` or `ui.ts`.
`monorepo-skills` has no tool or state: `scan.ts` owns discovery, `flags.ts`
owns the CLI disable check, and `prompt.ts` owns its static prompt note.
`guidelines` pairs `guard.ts` (the read gate) with `review.ts` (the one-shot
review steer). `jev` has no tool and no persisted state: `client.ts` owns the
single HTTP call, `key.ts` the owner-only key file, and `ui.ts` the masked `F10`
screen.

## Lifecycle events

Extensions subscribe through `pi.on(event, handler)`. The events Sideroom uses:

| Event | Used by | Purpose |
| --- | --- | --- |
| `input` | todo, rules, done, explain, guidelines, jev | Reset per-turn state on a real user prompt (`source: 'interactive'` or `'rpc'`). `guidelines` clears its review-turn flags here; `jev` clears its per-turn dedup set; a steer or `session_start` does not re-arm. |
| `turn_start` | todo, done | Reset per-turn state. |
| `tool_call` | guidelines, rules, done, persona, jev | Inspect a call before it runs. Return `{ block: true, reason }` to reject it. `jev` records the added lines here, because a `write` erases the previous content. |
| `tool_execution_start` | todo | Observe any tool starting; drives the propose nudge. |
| `tool_result` | modified-files, guidelines, rules, done, explain, jev | Observe results. May append content for `rules` warnings, record reads, arm the `guidelines` review steer, count a mutated file for `explain`, note a successful mutation, or ask `jev` for a semantic review. |
| `turn_end` | todo, done | Inspect the finished turn; drives watchdog and done steering. |
| `message_end` | persona | Inspect the finished assistant message and steer on a persona violation. |
| `agent_settled` | explain, guidelines | Fired once no retry, compaction, or queued continuation is left. `guidelines` sends its one-shot review steer here, at most once per turn; `explain` holds its offer back to the next settle so the review always runs first. |
| `resources_discover` | monorepo-skills | Returns trusted child-folder skill paths before Pi rebuilds the system prompt. |
| `before_agent_start` | todo, guidelines, monorepo-skills, persona | `todo` returns `{ message }` with the board block; the others return `{ systemPrompt }` with static reminders. |
| `session_start`, `session_tree`, `session_compact` | todo, modified-files, guidelines, persona, explain, jev | Rebuild and redraw state after load, branch navigation, or compaction; `persona` publishes its footer status; `jev` resets its session call count and republishes its status; `guidelines` clears its read state and its review-steer flags on `session_start`. |

`before_agent_start` appends a reminder to `systemPrompt` for `guidelines` and
`persona`, plus a location-preference note when `monorepo-skills` found child
skills, and returns a session message for the board block. The board changes
while the agent works, and a system prompt that changes invalidates the cached
prefix of the whole request, so `todo` sends the block as a `custom` message
and only when it differs from the last one it sent. The guidelines guard also
resets its read state on `session_compact` because a summary can drop the
loaded guides from context mid-run.

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
| persona steer type and status key | `sideroom-persona-steer`, `sideroom-persona` |
| jev status key | `sideroom-jev` |
| explain offer type | `sideroom-explain-offer` |
| guidelines review steer type | `sideroom-guidelines-review` |

## Widgets and ordering

Widgets are installed with `ctx.ui.setWidget(key, factory)`; passing `undefined`
removes one. Pi renders widgets in registration order, so the modified-files
compact widget must reapply *after* the todo board to stay below it.

Both compact widgets are capped and both offer a read-only overlay through
`ctx.ui.custom()`: the todo board shows five rows and opens with `F9`, the
edited-file list shows five paths and opens with `F8`. Neither overlay mutates
session state.

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

Guards tag their own messages (`steerFromUs`) so the turn the steer triggers does
not retrigger a nudge or watchdog, and the watchdog fires at most once per turn:
`steerFromUs` resets on `turn_start` with the other per-turn counters, so a run
that skips several updates is corrected more than once. `guidelines` and
`explain` gate their single steer with a flag set before the message is sent
(`steeredThisTurn`, `offeredThisTurn`) and cleared by interactive input.

## Interactivity

`ask` and `todo propose` need a terminal. They check `ctx.mode === 'tui'` and
otherwise return the explicit error `Error: UI not available (running in
non-interactive mode)`. `todo update`, `guidelines`, `monorepo-skills`,
`rules`, `done`, `persona`, and `jev` work in every mode. Persona blocking and
steering stay active where there is no UI, and only the footer status is
skipped; `jev` reviews in every mode, and only its `F10` key screen needs the
terminal.

`explain` also runs in every mode, but it only sends its offer in the TUI: it is
wrapped around `sideroom_ask`, which rejects every other mode.

Tool parameters arrive as decoded JSON. `prepareArguments` runs before schema
validation and unwraps nested arrays that some hosts serialise as JSON strings
(the OpenCode wire-format fix shared by `ask` and `todo`).

## Testing and quality

Pure modules (`model.ts`, `selection.ts`, `execute.ts`, `session.ts`) are written
to be unit testable with injected dependencies. Tests use the built-in
`node:test` runner.

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
| `sideroom-persona` | The single voice contract: Do/Don't table, plain-language bar, and enforcement boundaries. |
| `sideroom-grill` | Interviews a fuzzy plan in `sideroom_ask` rounds. |
| `sideroom-architecture` | Surfaces the architectural decisions a change forces so they are asked, not assumed. |
| `sideroom-domain-modeling` | Resolves language conflicts; writes `CONTEXT.md` and offers ADRs. |
| `sideroom-domain-scaffold` | Code-first repository scan that builds or completes `CONTEXT.md`. |

The canonical rule seed is `assets/artifacts/GUIDELINES_TEMPLATE.md`. It seeds
the skill and guides; it is never pasted into the system prompt.
