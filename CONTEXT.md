# Domain glossary

## Questionnaire batch

One `sideroom_ask` call containing one to four questions that are answered together, each with two to four caller-provided options. Every question has a recommended option, while Out of scope and a custom answer are system-provided choices rather than caller-provided options.

_Avoid: survey, form._

## Recommended option

The question option the caller considers the best default. It is highlighted and initially focused, but the user must still choose an answer.

_Avoid: default answer, automatic answer._

## Work board

The session-backed, user-visible list of work items maintained through `sideroom_todo`. A board with pending work has exactly one active item, and its state follows the current session branch.

_Avoid: todo list, project backlog._

## Edited-file history

The session-backed list of paths from successful Pi `write` and `edit` results. It records agent editing activity, not the repository working tree or Git diff.

_Avoid: changed files, Git changes._

## Forked session

A Pi session created from a point in an original session. It inherits the board visible at that point, then persists subsequent board changes independently from the original session.

_Avoid: child session, parent/child session._

## Added line

A line a `write` or `edit` introduces, computed from each `oldText → newText` pair or, for a full write, against the existing file. The rules extension checks only added lines, never the rest of the file.

_Avoid: changed line, new code._

## Detected check command

The single project command that the done extension watches to decide whether the session is green, chosen from package manager scripts and known ecosystem defaults. It is detected from the working directory, not configured.

_Avoid: test command, build command._
