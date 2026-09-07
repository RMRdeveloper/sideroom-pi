---
name: sideroom-grilling
description: Clarify a non-trivial feature, plan, or decision through dependency-aware question rounds before implementation.
license: MIT
---
# Grilling

Reach shared understanding before planning or building a non-trivial change.
Model the work as a **design tree**: each decision can unlock further decisions.
Never silently decide scope, product behavior, or trade-offs for the user —
those are theirs: desired outcome, scope, compatibility, user-visible
behavior, priorities, accepted trade-offs.

## Read facts; ask for decisions

Before the first round, read repo instructions, source, tests, package
scripts, and any `CONTEXT.md`/`CONTEXT-MAP.md`. Never ask the user for a fact
you can inspect yourself.

If a context file exists, use its vocabulary exactly — one canonical term per
concept, with `Avoid:` terms preventing synonym drift. With multiple contexts,
use the map to find the relevant one and ask only if the relationship is
unclear. Don't create context files or other project-local Sideroom state.

## Rounds and frontier

The **frontier** is the set of decisions whose prerequisites are already
settled. Ask up to three independent frontier questions per round; a question
depending on an unanswered one waits for a later round. Number questions
continuously across rounds.

For each question, all five parts are required — never ask a question missing one:

- `title`: the concrete decision to make.
- `question`: its observable consequence, with mutually exclusive alternatives and relevant facts.
- `recommendation`: one recommended answer justified from known facts, with its trade-off.
- `options`: two or three mutually exclusive alternatives as short strings, one of them the recommendation.
- `recommendationIndex`: the index into `options` pointing at the recommendation.
Never disguise a fact lookup as a question.

After each answer, update the design tree, record the decision, and recompute
the frontier — if the user accepts a recommendation, record that as the
decision. If a fact lookup is still pending, ask every question that doesn't
depend on it rather than blocking the round. Keep going until the frontier is
empty; there's no round limit.

In a conversational interface without a native question UI, use this fallback
and wait for the answer — never proceed on silence:

```md
**Q1 — <short decision title>**

<question, alternatives, and relevant facts>

Recommended: <one answer and its trade-off>
```

## Completion and handoff

Grilling ends only when every branch is settled or explicitly out of scope.
Produce a compact **Settled understanding**: decisions, non-goals, repo
constraints, accepted risks. Hand it to the planner as a constraint, not an
implementation task — don't implement or plan before it's confirmed.

## Sideroom pipeline mode

When Sideroom invokes with a requested JSON schema, run exactly one round and
return only the requested JSON:

- `status: "questions"` — one to three frontier questions, each with `id`,
  `title` (concrete decision), `question` (observable consequence with
  alternatives and facts), `recommendation` (justified answer with trade-off),
  `options` (two or three short mutually exclusive alternatives), and
  `recommendationIndex` (index into `options`).
  `options[recommendationIndex]` must equal `recommendation` verbatim.
- `status: "settled"` — a concise `summary` for the planner.

The caller supplies prior answers in the task context. Don't repeat settled
questions or touch the working tree. An answer of exactly `Out of scope`
means the user explicitly excluded that question: record it as a non-goal,
never as a decision.
