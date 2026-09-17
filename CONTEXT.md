# Domain glossary

## Questionnaire batch

One `sideroom_ask` call containing one to four questions that are answered together, each with two to four caller-provided options. Every question carries at least one recommended option, while Out of scope and a custom answer are system-provided choices rather than caller-provided options.

_Avoid: survey, form._

## Single-selection question

A questionnaire question whose answer is exactly one caller-provided option. Its one recommended option is highlighted and initially focused.

_Avoid: radio question, single-choice question._

## Multiple-selection question

A questionnaire question whose answer may be several caller-provided options at once. Its recommended options are all highlighted but none checked, and at least one selection is required; Out of scope remains the way to decline.

_Avoid: multi-select question, multi-answer question._

## Recommended option

The question option the caller considers the best default. A single-selection question has exactly one, highlighted and initially focused; a multiple-selection question has one or more, all highlighted and none checked. Either way the user must still choose.

_Avoid: default answer, automatic answer._

## Selection

One option a user picks in a multiple-selection question. A single-selection answer is itself one selection; a multiple-selection answer carries one or more.

_Avoid: choice, pick._

## Work board

The session-backed, user-visible list of work items maintained through `sideroom_todo`. A board with pending work has exactly one active item, and its state follows the current session branch.

_Avoid: todo list, project backlog._

## Open item

A work-board item whose status is `in_progress` or `pending`, as opposed to a _resolved item_ (`completed` or `cancelled`). The compact board widget hides resolved items before open ones when the board exceeds its row cap.

_Avoid: active item, unfinished item._

## Board block

The `sideroom_todo` text the agent reads: a header, one row per item, and the board instructions. It travels as a session message on `before_agent_start`, sent only when it differs from the previous block and re-sent after a restore. An automatic compaction retry queues it immediately so the retry keeps the current board.

_Avoid: system prompt block, injected prompt._

## Edited-file history

The session-backed list of paths from successful Pi `write` and `edit` results. It records agent editing activity, not the repository working tree or Git diff.

_Avoid: changed files, Git changes._

## Forked session

A Pi session created from a point in an original session. It inherits the board visible at that point, then persists subsequent board changes independently from the original session.

_Avoid: child session, parent/child session._

## Turn

The stretch of agent work between two user prompts, from the prompt until the agent settles. The `explain` offer and its mutated-file count belong to one turn and reset when the next user prompt arrives.

_Avoid: run, prompt window._

## Added line

A line a `write` or `edit` introduces, computed from each `oldText → newText` pair or, for a full write, against the existing file. The rules extension checks only added lines, never the rest of the file.

_Avoid: changed line, new code._

## Project fact

Something the repository already settles consistently. It is discovered from the code and reused, so the user is never asked about it.

_Avoid: established practice, existing pattern._

## Minor decision

A choice with low impact that is reversible without touching architecture, external dependencies, public contracts, or persistence. The agent takes it and does not interrupt the user.

_Avoid: small decision, implementation detail._

## Architectural decision

A choice that materially affects architecture, external dependencies, cost, security, operations, persistence, public contracts, or the difficulty of changing course later. It is exposed to the user through `sideroom_ask`, with the practical consequences of each alternative and one recommendation, before the agent commits to it; an accepted one becomes an ADR when it also clears the three gates of `sideroom-domain-modeling`.

_Avoid: technical decision, design decision._

## Detected check command

The single project command that the done extension watches to decide whether the session is green, chosen from package manager scripts and known ecosystem defaults. It is detected from the working directory, not configured.

_Avoid: test command, build command._

## Monorepo child folder

A descendant of Pi's working directory that carries its own `.pi/skills` or `.agents/skills`. It remains part of the same Pi project; it is not a separate trusted project.

_Avoid: nested project, subproject._

## Monorepo skill

A skill stored in a monorepo child folder and added to the session by the `monorepo-skills` extension. Pi's normal project-skill discovery does not walk down to find it.

_Avoid: child skill, nested skill, workspace skill._
