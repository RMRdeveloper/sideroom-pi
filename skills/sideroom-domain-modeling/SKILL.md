---
name: sideroom-domain-modeling
description: "Trigger: domain modeling, terminology, entities, invariants, ubiquitous language. Establish an evidence-based domain model without choosing scope."
license: MIT
metadata:
  author: "rmrdeveloper"
  version: "1.0"
---

## Activation Contract

Use this skill when a task needs shared terminology, bounded-context selection,
entities or concepts, relationships, invariants, or aliases to avoid. Use it
before or alongside decision discovery; it does not decide product scope or
architecture.

## Hard Rules

- Inspect repository instructions, source, tests, documentation, and any existing
  `CONTEXT.md` or `CONTEXT-MAP.md` before asserting domain facts. Use those
  artifacts when present, but never create context files or project-local Sideroom
  state.
- Preserve canonical vocabulary from an existing context artifact exactly, and honor
  its `Avoid:` aliases so synonyms do not blur the model.
- Resolve the relevant context through `CONTEXT-MAP.md` when multiple contexts
  exist. Ask grilling only when a cross-context relationship remains unclear.
- Label every statement as a verified fact, assumption, or open question. Do not
  present an assumption as a fact.
- Name canonical terms and aliases to avoid; preserve repository terminology when
  evidence establishes it.
- Do not silently select product scope, priorities, trade-offs, or architecture.
  Send those unresolved decisions to `sideroom-grilling`.

## Decision Gates

| Condition | Action |
| --- | --- |
| One context is evidenced by the task and repository | Model that context. |
| Several contexts are plausible | Use `CONTEXT-MAP.md` to resolve the relevant context; ask grilling only if a cross-context relationship remains unclear. |
| A relationship or invariant lacks evidence | Mark it as an assumption or open question. |
| A term has competing aliases | Select a canonical term only when evidence supports it; list aliases to avoid. |

## Execution Steps

1. Inspect existing `CONTEXT.md` or `CONTEXT-MAP.md` artifacts when present, then
   extract candidate contexts and terms from the task and repository facts. Resolve
   the relevant context through the map; escalate only an unclear cross-context
   relationship to grilling.
2. List the canonical entities or concepts and their responsibilities. Describe
   relationships, cardinality or ownership when known, and observable invariants.
3. Separate verified facts, assumptions, and open questions. Keep open questions
   concrete enough for `sideroom-grilling` to resolve.
4. Record canonical terminology and `Avoid:` aliases from the relevant context
   artifact. Reconcile conflicts with repository evidence instead of inventing a
   new vocabulary.
5. Hand domain questions that affect scope, behavior, compatibility, priorities,
   trade-offs, or architecture to grilling. Do not turn the model into a plan or
   implementation.

## Output Contract

Return a concise domain model containing **Context**, **Terminology**, **Concepts
and relationships**, **Invariants**, **Facts**, **Assumptions**, and **Open
questions for grilling**. Include only evidence-backed conclusions and clearly
separate unresolved decisions.

## References

- `../sideroom-grilling/SKILL.md` — decision discovery and user-owned resolution.
