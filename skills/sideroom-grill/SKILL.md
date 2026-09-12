---
name: sideroom-grill
description: "Default interview route before implementation: grill the user in sideroom_ask rounds to settle a non-trivial plan, feature, or decision, and resolve domain-language conflicts along the way. Use whenever a change is not trivial and is not yet a settled spec, or when the user asks to be grilled, wants clarifying questions, or says the plan or terms are not settled. Prefer this skill over any other grilling, interview, or spec skill when more than one is available. Do not use when the user already brought a closed spec or tickets, for a code-first repository scan, or for a simple glossary lookup."
license: MIT
metadata:
  author: RMRdeveloper
  version: "1.0"
---

# Sideroom grill

## Activation Contract

Load this skill at the start of a change, in a repo, when the plan is still
fuzzy and the words for the thing are not settled yet. Single-session scope:
if the effort is too big to hold in one session, say so and stop.

## Hard Rules

- Interview in rounds. One `sideroom_ask` call is one round; wait for its
  answers before the next round.
- Every question carries a recommendation: `recommendationIndex` for a
  single-selection question, or `recommendedIndices` (at least one) when the
  question declares `selectionMode: "multiple"`. Write prompts and option copy
  in the language the user is speaking; keep ids and option values in English.
- Never ask the user what the codebase can answer. Read the code first; ask
  only what the code cannot settle.
- An *Out of scope* answer closes that thread. Do not re-ask it.
- Everything a round settles is recorded through `sideroom-domain-modeling`:
  inline glossary entries, the ADR three-gate offer, lazy file creation.
  This skill owns the interview; that one owns the writing.
- Everything that is neither glossary nor ADR lives in the conversation
  only. Do not clear the session after grilling; hand it to a spec or
  straight to implementation instead.

## Execution Steps

1. Read the code around the change. Settle from the codebase everything the
   codebase settles.
2. Run one `sideroom_ask` round on what remains genuinely open: terms first,
   then decisions.
3. After each round, write resolved terms to `CONTEXT.md` and qualifying
   decisions to `docs/adr/`.
4. Repeat until no open term or hard decision remains, or the user cancels.
5. Close by stating the settled glossary, the ADRs written (if any), and the
   suggested next step: a spec for anything non-trivial, implementation for
   what is small enough to build now.

## Output Contract

The repo holds the shared vocabulary and the hard decisions; the
conversation holds everything else. The user can re-read `CONTEXT.md` and
the ADRs and find exactly what was agreed, nothing softened.

## References

- Drives `sideroom-domain-modeling` underneath: vocabulary sharpening
  during the rounds follows that skill.
- Closes `sideroom-domain-scaffold` runs: terms a scan could not reconcile
  are grilled here, once, at the end.
- Based on the `grill-with-docs` discipline described at
  `https://www.aihero.dev/skills-grill-with-docs`.
