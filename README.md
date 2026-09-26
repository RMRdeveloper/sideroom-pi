# Sideroom Pi — the side room your agent was missing

[![npm version](https://img.shields.io/npm/v/@rmrdeveloper/sideroom-pi?label=npm&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm monthly downloads](https://img.shields.io/npm/dm/@rmrdeveloper/sideroom-pi?label=downloads&logo=npm)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)
[![npm license](https://img.shields.io/npm/l/@rmrdeveloper/sideroom-pi?label=license)](https://www.npmjs.com/package/@rmrdeveloper/sideroom-pi)

**Asks before it guesses. Shows the plan. Enforces the style. Refuses to
call it done in red.**

```bash
pi install npm:@rmrdeveloper/sideroom-pi
```

![Sideroom asking a multi-question batch and keeping the live board below it](https://raw.githubusercontent.com/RMRdeveloper/sideroom-pi/main/media/preview.png)

> Coding agents fail in predictable ways: they guess instead of asking, they
> bury progress in chat scroll, they litter your repo with `TODO.md` files,
> every session writes code in a slightly different style, and they declare
> victory while the project checks are still red.
>
> **Sideroom fixes all of it — without touching your repository.**

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
5. **Unapplied guidelines.** The contract is read, then ignored: a braceless
   `if`, a swallowed error, `console.log`, and `TODO` land in the diff anyway.
6. **Premature completion.** The agent announces it is done while the
   formatter, linter, type checks, or tests were never run.

Sideroom answers each one with a small, opinionated surface:

| Failure | Sideroom answer |
| --- | --- |
| Silent guessing | `sideroom_ask` — questions with an opinion, one batch at a time |
| Invisible work | `sideroom_todo` — a live board above the editor, always one step in focus |
| Repo pollution | Session-branch state — the board and history die with the session, never with a commit |
| Style drift | A pre-edit gate + the on-demand `sideroom-guidelines` skill + an end-of-turn review steer |
| Invisible monorepo skills | `monorepo-skills` — trusted child folders join Pi's available skill list |
| Vague plans | `sideroom-grill` — an interview that settles the words before the work |
| Unapplied guidelines | `sideroom_rules` — mechanical checks that block or flag the lines you add |
| Unchecked judgment rules | `jev` — asks a decision model about the six rules no check can decide |
| Unclear answers | `sideroom_persona` — one voice: direct, plain, and free of jargon it invented |
| Premature completion | `sideroom_done` — steers back to the project's check command before finishing |
| Work left unexplained | `explain` — offers a walkthrough and how to test it once the work settles |

## What it feels like

You ask the agent for something non-trivial. Instead of vanishing into a
wall of tool calls, it:

- **Asks like a senior would.** A clean TUI questionnaire appears — tabs for
  several questions, a simple list for one. Every question carries a
  recommendation, and a plural one lets you tick several answers at once. You
  can always answer *Out of scope* or write your own, and everything is written
  in your language. Escape cancels the whole batch. No guessing, no twenty
  follow-up clarifications in chat.
- **Works in the open.** A compact board sits above the editor:
  `pending → in_progress → completed`. Exactly one step is active at a
  time; the agent completes the current step and starts the next one in the
  same move, so skipped steps become structurally hard. The widget shows at
  most five rows, keeps the active step visible, and `F9` opens the full
  read-only board. The board survives reload, tree navigation, and
  compaction.
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
- **Finds the skills below the working directory.** In a trusted monorepo, Pi
  normally ignores project skills stored under child folders. Sideroom scans
  three levels down, adds their `.pi/skills` and `.agents/skills`, and leaves
  duplicate-name warnings to Pi.
- **Cannot sneak sloppy lines past the gate.** Each write and edit is checked
  against the mechanical rules on the added lines only: braceless
  conditionals and swallowed errors block the mutation; vague names, stale
  `TODO`s, commented-out code, and debug output are appended as notes to the
  result. A rule that keeps firing degrades instead of trapping the agent.
- **Does not call it done in red.** When files changed and the project's own
  check command has not passed, the agent is steered back to run it before
  finishing. If no check command is detectable, the gate stays out of the way.

## What's inside

### `sideroom_ask` — decisions, not interrogations

One call is one 1–N question batch. Each question needs an `id`, a `prompt`,
at least two `{ value, label }` options, and a recommendation:
`recommendationIndex` for the default single answer, or
`selectionMode: "multiple"` with `recommendedIndices` when the question accepts
several. The UI adds the rest: the recommended mark, the always-on *Out of
scope* row, and a custom answer.

TUI-only by design. In print, JSON, or RPC modes it fails fast with
`UI not available` instead of hanging.

### `sideroom_todo` — a board, not a bureaucracy

A display-only, ordered work board. The agent maintains it; you steer through
chat. It never creates a repository task file or a `/todos` command.

- `propose` replaces the full board (interactive TUI only).
- `update` patches `{ id, status?, content? }` items and works everywhere,
  including headless modes.
- Invariant: while anything is pending, exactly one item is `in_progress`.
- Widget: at most five rows — open items before resolved ones, the
  `in_progress` row always visible — plus a `…+N more · F9: view all` hint.
  `F9` opens the full board as a read-only overlay, so the widget stays small
  without hiding work from you; the agent still gets every item in its context.

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
system prompt. After any successful mutation, one hidden review steer fires when
the turn settles and asks the agent to re-check every changed file against the
loaded guide and run the relevant formatter, linter, type checks, and tests —
so the contract is applied, not just read.

### Monorepo skills — child skills are still project skills

Pi discovers `.pi/skills` only from its working directory and
`.agents/skills` from that directory and its ancestors. `monorepo-skills`
closes the downward gap: in a trusted project it scans at most three child
levels, respects `.gitignore`, `.ignore`, and `.fdignore`, and contributes the
same skill locations without writing project configuration. Skill bodies stay
on demand; only names, descriptions, and locations enter the system prompt.

Duplicate names keep Pi's precedence and diagnostics. Root and global skills
load before extension paths, so use `pi config -l` to disable one that shadows
a needed child-folder skill.

### Rules — enforcement, not advice

The guidelines gate makes the agent read the rules; `sideroom_rules` makes it
follow them. On every `write`/`edit`, only the added lines are checked against
the mechanical rules from the canonical seed. Braceless conditionals and
swallowed errors block the mutation with an actionable reason; banned
identifiers, stale comments, commented-out code, and debug artifacts are
appended as notes to the tool result. A per-rule circuit breaker degrades a
repeatedly firing block to a note so the agent never dead-locks. No files
written, no config read: the catalog ships with the package.

### Jev — judgment where no check reaches

Reading the guide covers the mechanical rules. `jev` covers the other kind: one
optional call to TypeSafe's Jev decision model about the six guide rules a
single file can answer (guard clauses, fail fast, command/query separation,
null handling, immutability, validate once) on the file a `write` or `edit` just
changed. The answer arrives as a probability, and when it clears the cutoff the
note travels with the guidelines review at the end of the run instead of
interrupting each edit. READMEs, JSON, lockfiles, deletion-only edits, and files
outside the project are never sent.

It never blocks and never enters the system prompt. The state is the file and
the added lines and nothing else — no conversation, no session, no neighbours.
The footer counts the calls the session made, and `F10` shows the same count
beside the key source. Without a key nothing is called, and when Jev runs out of
quota, rejects the key,
or stops answering, the extension goes quiet without touching the turn. A rate
limit only pauses it until your next prompt, and Escape cuts a request in
flight. The key
lives in `TYPESAFE_API_KEY` or in your agent directory, and `F10` captures it
without ever writing it to the session.

### Persona — one voice, not a costume

`sideroom_persona` is the agent's voice, and there is exactly one of it. A
short reminder rides the system prompt on every turn, so it survives
compaction; the full guide lives in the on-demand `sideroom-persona` skill.
The voice is direct and dry, free of filler, and plain enough to leave no
doubt about what is being discussed — while calling things by the names the
user already uses. Emojis and decorative symbols in the lines a `write`/`edit`
adds block the mutation; flattering openers, hedging, automatic apologies, and
AI meta-commentary are answered with a capped steer. No profiles to switch and
no profile selection to store.

### Done — done means green

`sideroom_done` detects the project's check command — `package.json` scripts
(`check` → `test` → `lint` → `typecheck` → `types`) with the right
package manager, `pytest`, `go test ./...`, `cargo test`, or a `make check`
target — and watches for it to pass. If files changed without a green run, the
agent is steered once per turn, up to a cap, to run it before finishing. When
nothing is detectable, the gate does nothing.

### Explain — the walkthrough offer

When an implementation settles, `explain` steers the agent to offer a
walkthrough through `sideroom_ask`: explain the changes only, how to test them
only, both, or nothing. It fires on `agent_before_settle`, after every retry
and compaction recovery, so the offer never lands on work that is about to be
redone, and it stays inside the same run. It waits one boundary so the
guidelines review runs first; both use the same event, and Pi would otherwise
order them by extension load. It stays quiet after Escape, after an error, and
while a message you typed is waiting. Once per turn, only when the turn touched at least five distinct
files, and only in the TUI, because `sideroom_ask` cannot run anywhere else. No
tool, no widget, no persisted state.

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
options per question. A question takes one answer unless it declares
`selectionMode: "multiple"`, which requires `recommendedIndices` and at least
one selection. Tab labels accept at most 16 characters and option labels at
most 60. Inputs that exceed a limit are rejected rather than truncated.

Write prompts, tab labels, and option copy in the language the user is
speaking; keep ids, option values, and TUI chrome in English. Do not send
*Out of scope* or custom-answer rows yourself — the UI always adds them.

### Board contract

Items have stable string ids, short content, and one of `pending`,
`in_progress`, `completed`, or `cancelled`. Complete the current item and
start the next one in the same `update` call. Snapshots live in the active
session branch and are rebuilt after navigation and compaction.

- Widget: max five rows. Open items win the cap over resolved ones, the
  `in_progress` row is always shown, and a `…+N more · F9: view all` line
  appears when rows are hidden.
- Extended view: `F9` toggles a read-only overlay. `↑`/`↓` and `PgUp`/`PgDn`
  scroll; `Esc` or `F9` closes. It never mutates the board.
- The cap is display-only: every item still reaches the system prompt.

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
the gate through Bash or another file-mutation path. After any successful
`write`/`edit`, one hidden review steer fires on `agent_before_settle` (at most
once per turn) asking the agent to re-check every changed file against the
loaded guide and run the relevant project checks. It is skipped after Escape,
after an error, and while a user message is pending. Interactive input sent
while the agent is idle clears the steer flags; a message typed during a run
and `before_agent_start` do not, so a steer continuation never re-triggers
itself.

### Monorepo-skills contract

- Trigger: `resources_discover` after project trust resolves, in every mode.
- Scope: `.pi/skills` and `.agents/skills` in child folders at most three
  levels below Pi's working directory.
- Traversal: ignore-aware, no directory symlinks, deterministic child-folder
  order, `.pi/skills` before `.agents/skills` inside one folder.
- Safety: untrusted projects and CLI `--no-skills`/`-ns` contribute no paths.
- Collisions: Pi keeps the first name and reports skipped paths. Child-folder
  skills cannot override root or user skills added earlier.
- Prompt: one static, idempotent note prefers the skill whose location matches
  the folder being edited.

### Rules contract

- Trigger: every `write`/`edit` call, in every mode.
- Scope: only lines added by the call. For `edit`, each `oldText → newText`
  pair; for `write`, the new content against the existing file.
- Blocking rules: braced conditionals (rule 1) and explicit error handling
  (rule 5). Warning rules: clear names (6), comments (19), and debug artifacts.
- Blocked calls return the rule id, the reason, and the fix. Warnings are
  appended to the tool result.
- A rule that blocks three times in a run degrades to a warning until five
  clean checks or a new interactive prompt reset it.

### Jev contract

- Off without a key: no request, and behavior identical to a package without
  this extension.
- Warn only. A finding goes to the guidelines review on `sideroom:review-note`
  and rides its end-of-run steer, with one follow-up per turn for notes that
  arrive after the review fired; nothing blocks and nothing reaches the system
  prompt.
- One request per successful `write`/`edit` of a project file in a supported
  language that added lines, with six `noul` questions on one shared state of
  the project-relative path, the file body, and the added lines.
- A serialized state over 60k characters is skipped rather than truncated. An
  answer at or above `0.8` probability becomes a note.
- The request follows the run's abort signal; a cancelled request is not a
  failure.
- Quota (`402`) and a rejected key (`401`, `403`) stop the calls immediately. A
  rate limit (`429`) pauses them until the next idle prompt. Network errors and
  other `4xx`/`5xx` stop after three consecutive failures. A success rearms the
  breaker, and `F10` rearms it by hand.
- Every request increments a session call counter, shown in the footer and on
  `F10`; it resets on `session_start` and is never persisted.
- The key comes from `TYPESAFE_API_KEY` or from
  `getAgentDir()/sideroom.json` at mode `0600`, and never enters the session.

### Persona contract

- One built-in voice. No profiles, no switching, and no persisted profile
  state; runtime guard counters stay in memory. The footer shows the run's block
  and steer counts (`persona: direct · 2 blocks · 1 steer`) and drops back to
  `persona: direct` on the next run.
- Injection: a short reminder appended in `before_agent_start`, chained after
  the other extensions and idempotent by heading, so it returns after
  compaction.
- Blocking: decorative symbols in the lines a `write`/`edit` adds. Full rewrites
  resolve Pi path aliases before comparing existing content; semantic copyright,
  trademark, and registration symbols remain valid. Three fires degrade the
  prohibition to a steer; five clean mutations reset the counters.
- Steering: one corrective message per violating assistant message, at most
  three per run.
- `sideroom_persona` takes no arguments and returns every rule and every
  prohibition with its enforcement mode.

### Done contract

- Detected command: `package.json` scripts in priority order with the
  lockfile's package manager, then `pytest -q` for Python, `go test ./...`,
  `cargo test`, or `make check`. Detection is cached per working directory.
- Green means that command ran with a zero exit in this run. A later
  successful `write`/`edit` clears green again.
- Steering: once per turn, at most twice per run, then it stops.

### Explain contract

- Trigger: `agent_before_settle` with at least five distinct files mutated
  since the last idle user prompt, in TUI mode, on a completed run with no user
  message pending. File identity follows Pi's path aliases and canonicalizes
  existing paths.
- One boundary of delay: the guidelines review steers on the same event, and Pi
  runs both handlers in extension load order, so `explain` offers at the next
  boundary.
- The steer names the intent; the agent writes the question in the user's
  language with four options, one of them a decline, and one recommendation.
  `sideroom_ask` still adds *Out of scope* and the custom answer.
- At most one offer per turn. The flag is set before the steer, so the turn the
  offer triggers cannot re-trigger it.
- No green-check requirement: red checks still produce the offer.

### Grill contract

Load the skill at the start of a change with a fuzzy plan.
Single-session scope only. Files are created lazily: nothing exists until
the first term or decision crystallises. A session with a sharper glossary
and zero ADRs is working as designed.

### Coexisting with other grilling skills

Pi routes skills by description, not by name, so several grilling skills can
be installed at once. `sideroom-grill` claims non-trivial plans before
implementation and states precedence over other grilling, interview, and spec
skills. If a third-party skill still wins, remove it from routing by adding
`disable-model-invocation: true` to its frontmatter, or exclude its path with
`-path` in `settings.skills`. A literal name collision keeps the first skill
found: project `.pi/skills`, then project `.agents/skills`, then
`~/.pi/agent/skills`, then `~/.agents/skills`, then packages. Child-folder
paths contributed by `monorepo-skills` come later and cannot override any of
them.

## Documentation

Maintainer reference lives in [`docs/`](docs/README.md): the
[architecture](docs/architecture.md) and one page per
[extension](docs/extensions/ask.md).

## Contributing

Contributions are welcome: bug reports, feature requests, language guides, and
pull requests. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, the
commands, the design rules, and the branch and release flow — pull requests
target `develop`, and `main` only carries releases.

- [Report a bug](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=bug_report.yml) or [request a feature](https://github.com/RMRdeveloper/sideroom-pi/issues/new?template=feature_request.yml).
- Report vulnerabilities privately through [`SECURITY.md`](SECURITY.md).
- Participation is covered by the [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## License

MIT.
