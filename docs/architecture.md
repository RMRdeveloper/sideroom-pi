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
holds the file-tool path rules and the missing-file read that guards share with
Pi's built-in file tools, the end-of-run steer rules the review and the offer
share, the `sideroom:review-note` event Jev emits for the review, plus the
prompt-cache contract test that loads every extension. Tests never sit directly
in `extensions/`, because Pi loads every top-level `.ts` file there.

```text
extensions/
  ask/            sideroom_ask
  todo/           sideroom_todo
  modified-files/ edited-file tracking
  visual-context/ F7 browser pairing, local source candidates and pending input context
  guidelines/     sideroom_guidelines, pre-edit gate and review steer
  monorepo-skills/ trusted child-folder skill discovery
  rules/          added-line rule checks
  done/           passive check observation and coverage supplements
  persona/        single built-in voice
  jev/            optional Jev semantic review
  explain/        final-response walkthrough invitation
  shared/         file-tool paths, end-of-run steer rules, the review-note event, prompt-cache test
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
`guidelines` registers `sideroom_guidelines`: `execute.ts` loads complete
packaged documents selected by `catalog.ts`. `guard.ts` accepts successful
complete tool deliveries or full `read` calls, and `review.ts` owns the one-shot
review steer. Pending tool receipts and loaded-document state stay in memory
and reset on session start, a new run, or compaction. `jev` has no tool and no persisted state: `client.ts` owns the
single HTTP call, `workflow.ts` bounded questionnaire/completion requests and
observed evidence, `key.ts` the owner-only key file, and `ui.ts` the masked `F10`
screen.

## Lifecycle events

Extensions subscribe through `pi.on(event, handler)`. The events Sideroom uses:

| Event | Used by | Purpose |
| --- | --- | --- |
| `input` | todo, rules, done, guidelines, jev | Reset per-turn state on a real user prompt (`source: 'interactive'` or `'rpc'`). `todo`, `guidelines`, and `jev` reset only when the prompt arrives while the agent is idle, so a message typed during a run does not re-arm them; `jev` clears its per-turn dedup set and its rate-limit pause; a steer or `session_start` does not re-arm. |
| `tool_call` | guidelines, rules, done, persona, jev | Inspect a call before it runs. Return `{ block: true, reason }` to reject it. `jev` records the added lines here, because a `write` erases the previous content, for project files in a supported language; deletion-only results invalidate cached completion evidence without requesting a code review. |
| `tool_result` | todo, modified-files, guidelines, rules, done, jev | Observe results. May append content for `rules` warnings, record reads, arm the `guidelines` review steer, note a successful mutation, or ask `jev` for a semantic review, whose findings go to the `guidelines` review on `sideroom:review-note` instead of the tool result. |
| `turn_end` | jev | Inspect the finished turn; `jev` drops calls another extension blocked, which never reach `tool_result`. |
| `message_end` | persona | Retain a correction only for the latest successful final assistant response; clear superseded corrections. |
| `agent_before_settle` | guidelines, persona | Quiet completed boundary after retries and compaction recovery. Priority is review, then final-response style. One necessary stage requests continuation, preserving earlier entries; pending style and coverage notices can join it through `sideroom:settle-supplement`. Done never requests continuation. Aborts, errors, pending messages and earlier continuations postpone work without consuming it. |
| `resources_discover` | monorepo-skills | Returns trusted child-folder skill paths before Pi rebuilds the system prompt. |
| `before_agent_start` | todo, guidelines, monorepo-skills, persona, explain | `todo` returns `{ message }` with the board block; the others return `{ systemPrompt }` with static reminders. |
| `session_start`, `session_tree`, `session_compact` | todo, modified-files, guidelines, persona, jev | Rebuild and redraw state after load, branch navigation, or compaction; `persona` publishes its footer status; `jev` resets its session call count, drops recorded calls and its dedup set, and republishes its status; `guidelines` clears its read state and its review-steer flags on `session_start`. |

`before_agent_start` appends a reminder to `systemPrompt` for `guidelines`,
`persona`, and `explain`, plus a location-preference note when `monorepo-skills`
found child skills, and returns a session message for the board block. The board changes
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

`visual-context` also persists pending DOM selections, local source candidates
and page-origin-to-project associations on the active branch. Compiler metadata
is validated against native markup positions; selections without metadata use
inferred matching. `sideroom_visual_setup` discovers children and prepares opt-in
development compiler edits and installation commands; the parent applies them
through ordinary Pi tools so all mutation guards still run. Its authenticated loopback server starts only
from the initial `F7` authorization. Its global installation identity is
reused by later trusted interactive sessions. Pi processes share a stable local
broker, with takeover on host shutdown. Conversation and tree changes publish
a new destination revision; old selections are rejected without requiring
another browser authorization. Windows and WSL identities are remembered
independently by the companion, which merges their destination lists.
Source hashes are checked before attachment, once per distinct file in each
restore or attachment operation. Source search keeps only the best eight
candidates and shares ignore rules only within that synchronous search; there
is no validation cache between operations. `dialogs.ts` owns F7 menus without
changing session state, and the browser's `destinations.js` owns destination
choice independently of connection handling. The next idle interactive `input`
is transformed to include bounded, explicitly untrusted browser context;
images and user text are preserved and the system prompt stays unchanged.
See [browser context](extensions/visual-context.md) for the browser companion,
WSL networking, matching limits and the distinction between a real source range
and an inferred DOM origin.

**Snapshot keys**

| Extension | `customType` / widget key |
| --- | --- |
| todo | `sideroom-todo` |
| modified-files | `sideroom-modified-files` |
| visual-context | `sideroom-visual-context` |
| visual project associations | `sideroom-visual-projects` |
| todo reminder type | `sideroom-todo-reminder` |
| coverage supplement type | `sideroom-missing-test-notice` |
| persona steer type and status key | `sideroom-persona-steer`, `sideroom-persona` |
| jev status key | `sideroom-jev` |
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

`modified-files` subscribes and reapplies its widget in response; that channel
lives in `extensions/todo/session.ts` as `TODO_WIDGET_REFRESH_EVENT`.

`jev` emits a note on a second channel after a request returns a finding:

```ts
pi.events.emit('sideroom:review-note', { text });
```

`guidelines` subscribes and carries the turn's notes in its review steer. That
channel lives in `extensions/shared/review-note.ts`, which owns the event name
and the payload check. The shared settle guard also queries pending finish stages through
`sideroom:settle-priority`; the request stays in memory and is never persisted
or sent to the model.

## Steering the agent

Board reminders never block or request a model response. After a successful
file mutation, at most once per idle user turn:

```ts
pi.sendMessage(
  { customType: 'sideroom-todo-reminder', content: '...', display: false },
  { triggerTurn: false, deliverAs: 'steer' },
);
```

Explicit `false` matters: while Pi is streaming, omitting `triggerTurn` queues
an active steer that can extend the loop. With `false`, Pi appends the message
at the end of the turn; the next natural response can see it. `bash`, reads,
failed edits and closed boards do not trigger board reminders.

Necessary end-of-run work appends hidden `custom_message` entries on
`agent_before_settle` with `continue: true`. The shared settle guard accepts
only completed runs with no queued messages or earlier continuation, waits
for registered background reviews in every load order, then preserves
earlier entries, and uses `sideroom:settle-priority` to select review, then
pending final-response style. Done never selects a continuation. Review queries
its observed check through `sideroom:check-status` and reuses green results
unless a later mutation makes them stale. Late semantic notes still
receive their bounded review follow-up.

Once a necessary continuation is selected, `sideroom:settle-supplement`
collects pending style corrections and test-coverage notices into that same
continuation; coverage notices never open one on their own. The event bus handles
every extension loading order and isolates Pi sessions. Turn state resets only
on idle user input.

Explain uses a fixed system-prompt reminder instead of the settle mechanism.
After meaningful work, review and checks, the agent may append a short invitation
to its final response. There is no file threshold, automatic questionnaire or
extra continuation. Only explicit user acceptance permits scope clarification.

## Interactivity

`ask` and `todo propose` need a terminal. They check `ctx.mode === 'tui'` and
otherwise return the explicit error `Error: UI not available (running in
non-interactive mode)`. `todo update`, `guidelines`, `monorepo-skills`,
`rules`, `done`, `persona`, and `jev` work in every mode. Persona blocking and
steering stay active where there is no UI, and only the footer status is
skipped; `jev` reviews in every mode, and only its `F10` key screen needs the
terminal.

`explain` works in every mode. Its optional invitation is ordinary final-response
text. After explicit acceptance, scope clarification uses `sideroom_ask` only
in the TUI; otherwise the agent clarifies in ordinary conversation.

Tool parameters arrive as decoded JSON. `prepareArguments` runs before schema
validation and unwraps nested arrays that some hosts serialise as JSON strings
(the OpenCode wire-format fix shared by `ask` and `todo`).

## Testing and quality

Pure modules (`model.ts`, `selection.ts`, `execute.ts`, `session.ts`) are written
to be unit testable with injected dependencies. Tests use the built-in
`node:test` runner.

```bash
npm run types          # tsc --noEmit
npm run lint           # ESLint
npm run format:check   # ESLint style checks
npm test               # node --test extensions/**/*.test.ts
npm run check          # types + check:if-blocks + ESLint + tests
```

`scripts/check-if-blocks.mjs` parses every `extensions/**/*.ts` file and
requires braced, multiline conditional bodies — the same rule `sideroom_rules`
enforces on agent edits. ESLint checks JavaScript/TypeScript and JSON; TypeScript ESLint supplies typed
syntax rules and ESLint Stylistic supplies formatting rules. `curly` requires
braces, and `no-comments/disallowComments` rejects code comments. Root and
site configs share `scripts/lint/config.mjs` while installing dependencies
independently. Releases ship through Changesets on protected `main`; never publish
locally.

## Skills

Skills are on-demand instructions under `skills/`, not extensions. `guidelines`
gates mutations on loading `skills/sideroom-guidelines/SKILL.md` and the matching
language guide through `sideroom_guidelines` or full `read` calls; those files
are also part of the published package.

| Skill | Role |
| --- | --- |
| `sideroom-guidelines` | The 20-rule contract and per-language guides. |
| `sideroom-persona` | The single voice contract: Do/Don't table, plain-language bar, and enforcement boundaries. |
| `sideroom-grill` | Interviews a fuzzy plan in `sideroom_ask` rounds. |
| `sideroom-architecture` | Surfaces the architectural decisions a change forces so they are asked, not assumed. |
| `sideroom-codebase-design` | Surveys codebase friction, designs module improvements, and plans growth and migration in text. |
| `sideroom-domain-modeling` | Resolves language conflicts; writes `CONTEXT.md` and offers ADRs. |
| `sideroom-domain-scaffold` | Code-first repository scan that builds or completes `CONTEXT.md`. |
| `sideroom-visual-setup` | Configure and verify compiler locations using setup plans, including Docker paths. |

The canonical rule seed is `assets/artifacts/GUIDELINES_TEMPLATE.md`. It seeds
the skill and guides; it is never pasted into the system prompt.
