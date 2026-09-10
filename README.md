# Sideroom Pi — the side room your agent was missing

[![npm version](https://img.shields.io/npm/v/@rmrdeveloper/sideroom-pi?label=npm&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm monthly downloads](https://img.shields.io/npm/dm/@rmrdeveloper/sideroom-pi?label=downloads&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm license](https://img.shields.io/npm/l/@rmrdeveloper/sideroom-pi?label=license)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)

> Coding agents fail in predictable ways: they guess instead of asking, they
> bury progress in chat scroll, they litter your repo with `TODO.md` files,
> and every session writes code in a slightly different style.
>
> **Sideroom fixes all four — without touching your repository.**

Sideroom Pi is a global [Pi package](https://pi.dev/docs/latest/packages)
that gives the parent agent a *side room* next to your code: a place to ask
sharp questions, show live progress, track what changed, and stay honest
about code quality. The room lives in the Pi session, not in your repo. No
`.pi` config, no task graph, no Sideroom files left behind.

## Why Sideroom exists

Every long agent session drifts toward the same failure modes:

1. **Silent guessing.** The agent hits an ambiguous decision and picks
   something instead of asking — because asking in plain chat is awkward
   and easy to ignore.
2. **Invisible work.** "What is it doing? Which step is it on? Did it skip
   something?" Progress disappears into thousands of lines of transcript.
3. **Repo pollution.** Workarounds appear as `todos.json`, scratch notes,
   and half-abandoned plans committed next to real code.
4. **Style drift.** Each session reinvents conventions: nesting depth, error
   handling, naming, validation. Review becomes cleanup.

Sideroom answers each one with a small, opinionated surface:

| Failure | Sideroom answer |
| --- | --- |
| Silent guessing | `sideroom_ask` — questions with an opinion, one batch at a time |
| Invisible work | `sideroom_todo` — a live board above the editor, always one step in focus |
| Repo pollution | Session-branch state — the board and history die with the session, never with a commit |
| Style drift | A pre-edit gate + the on-demand `sideroom-guidelines` skill |
| Vague plans | `sideroom-grill` — an interview that settles the words before the work |

## What it feels like

You ask the agent for something non-trivial. Instead of vanishing into a
wall of tool calls, it:

- **Asks like a senior would.** A clean TUI questionnaire appears — tabs for
  several questions, a simple list for one. Every question carries a
  recommendation, you can always answer *Out of scope* or write your own,
  and everything is written in your language. Escape cancels the whole
  batch. No guessing, no twenty follow-up clarifications in chat.
- **Works in the open.** A compact board sits above the editor:
  `pending → in_progress → completed`. Exactly one step is active at a
  time; the agent completes the current step and starts the next one in the
  same move, so skipped steps become structurally hard. The board survives
  reload, tree navigation, and compaction.
- **Shows its traces.** Below the board, the last edited files appear as
  clickable `file://` links. `F8` opens the full session history; `R` clears
  it. Only successful Pi `write`/`edit` calls are tracked — no guesses from
  shell output, Git, or subagents.
- **Writes code that reads the same every time.** Before the first edit in
  each agent run, the agent must read the shared contract and the one complete
  guide matching the target language. Premature `write`/`edit` calls are
  blocked. The guides cover guard clauses, braced conditionals, fail-fast
  errors, focused units, and all 19 canonical rules without dumping them into
  the system prompt.

## What's inside

### `sideroom_ask` — decisions, not interrogations

One call is one 1–N question batch. Each question needs an `id`, a `prompt`,
at least two `{ value, label }` options, and a `recommendationIndex` pointing
at the recommended option. The UI adds the rest: the recommended mark, the
always-on *Out of scope* row, and a custom answer.

TUI-only by design. In print, JSON, or RPC modes it fails fast with
`UI not available` instead of hanging.

### `sideroom_todo` — a board, not a bureaucracy

A display-only, ordered work board. The agent maintains it; you steer through
chat. It never creates a repository task file or a `/todos` command.

- `propose` replaces the full board (interactive TUI only).
- `update` patches `{ id, status?, content? }` items and works everywhere,
  including headless modes.
- Invariant: while anything is pending, exactly one item is `in_progress`.

### Edited files — proof, not promises

Automatic tracking of successful `write` and `edit` results for the active
session. The compact view shows at most five recent paths below an active
board; the extended `F8` view scrolls through everything. Paths outside the
project are labelled `external`. A new session starts clean.

### Grill — settle the words first

An on-demand skill for fuzzy plans. It interviews you in `sideroom_ask`
rounds — reading the codebase first so it never asks what the code already
says — until you share one understanding. Resolved terms land in
`CONTEXT.md` the moment they resolve; hard decisions land as ADRs under
`docs/adr/`. Everything else stays in the conversation, ready to become a
spec or an implementation. Vocabulary sharpening during the rounds follows
the companion `sideroom-domain-modeling` skill, which also runs on its own
whenever the words — not the plan — are the problem. And when there is no
one to interview at all, `sideroom-domain-scaffold` reads the central
domain code as source of truth, builds or completes `CONTEXT.md` on its
own, and grills the conflicting terms once, at the end.

### Guidelines — a gate, not a novel

A short system-prompt contract points at the packaged
`sideroom-guidelines` skill. Before `write` or `edit`, a guard requires a
full read of the packaged skill and, for supported targets, the one complete
language guide under `skills/sideroom-guidelines/references/languages/`.
Each guide mirrors all 19 rules in the canonical seed with idiomatic examples.
The seed, `assets/artifacts/GUIDELINES_TEMPLATE.md`, is never pasted into the
system prompt.

## Quick path

1. Install globally from npm. Pi records this in your user settings, so do
   not use `-l`.

   ```bash
   pi install npm:@rmrdeveloper/sideroom-pi
   ```

2. Start Pi in the repository you want to work in.
3. Ask the parent agent something that needs a decision or a visible plan.
   It calls `sideroom_ask` or `sideroom_todo` in the TUI.

Pin for reproducibility — a pinned version does not move on Pi's package
update:

```bash
pi install npm:@rmrdeveloper/sideroom-pi@7.0.0
```

Update an unpinned installation with:

```bash
pi update --extension npm:@rmrdeveloper/sideroom-pi
```

## Reference

### Questionnaire contract

Each batch accepts one to four questions, with two to four caller-provided
options per question. Tab labels accept at most 16 characters and option
labels at most 60. Inputs that exceed a limit are rejected rather than
truncated.

Write prompts, tab labels, and option copy in the language the user is
speaking; keep ids, option values, and TUI chrome in English. Do not send
*Out of scope* or custom-answer rows yourself — the UI always adds them.

### Board contract

Items have stable string ids, short content, and one of `pending`,
`in_progress`, `completed`, or `cancelled`. Complete the current item and
start the next one in the same `update` call. Snapshots live in the active
session branch and are rebuilt after navigation and compaction.

A forked session inherits the board visible at its fork point. Later board
updates are reconstructed from each session's active branch, so the fork and
the original session evolve independently.

### Edited-files contract

- Trigger: only successful Pi `write`/`edit` results.
- Compact widget: max five paths, reapplied below the board.
- Extended view: `F8` toggles, `R` clears session history.
- Links: OSC 8 `file://` — click behavior depends on your terminal.

### Guidelines contract

In each agent run, fully read the exact packaged skill path before the first
`write`/`edit`. For Java, PHP/Laravel, TypeScript/TSX, Python, Go, or Rust,
also fully read the packaged guide matching the target path. Reads with
`offset` or `limit`, failed reads, and same-named files elsewhere do not count.
The extension blocks the mutation until the required reads succeed; unsupported
languages use the shared table. Do not route around
the gate through Bash or another file-mutation path. Before finishing, review
the diff against the loaded guide and run the relevant project checks.

### Grill contract

Load the skill at the start of a change with a fuzzy plan.
Single-session scope only. Files are created lazily: nothing exists until
the first term or decision crystallises. A session with a sharper glossary
and zero ADRs is working as designed.

## License

MIT.
