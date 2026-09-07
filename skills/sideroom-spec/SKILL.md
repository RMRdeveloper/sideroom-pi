---
name: sideroom-spec
description: "Trigger: standalone specification, feature spec, implementation-ready requirements. Draft a settled specification without creating Sideroom project state."
license: MIT
metadata:
  author: rmrdeveloper
  version: "1.0"
---

# Specification writer

## Activation Contract

Use this skill when the user requests a standalone, implementation-ready feature specification instead of implementation. Read repository instructions and relevant domain context before drafting.

## Hard Rules

- Produce one English Markdown specification; do not implement code or create Sideroom project-local state, task state, or other files as a side effect.
- Do not invent unresolved product or scope decisions; record them under `Open Questions`.
- Do not invoke, assign work to, or hand the document to a pipeline role.
- Write a file only after the user names its destination and confirms the write.

## Decision Gates

| Situation | Action |
| --- | --- |
| A required scope or product decision is unresolved | Ask focused questions in the current conversation; do not finalize the specification until it is settled or recorded as an open question. |
| The user requests a draft only | Show the complete draft; do not write a file. |
| The user names a destination and confirms the write | Write the settled document to that destination. |
| The user requests implementation | Do not implement under this skill; return the specification result only. |

## Execution Steps

1. Read the applicable repository instructions and domain evidence.
2. Identify the goal, constraints, non-goals, requirements, acceptance criteria, and unresolved decisions.
3. Draft the document using the required section order.
4. Make requirements concise bullets and acceptance criteria observable Given/When/Then scenarios.
5. Show the complete draft, then write it only when the confirmed-destination gate passes.

## Output Contract

Return the complete Markdown document with these sections in order:

```md
# <Title>

## Context
## Goal
## Non-goals
## Requirements
## Acceptance Criteria
## Constraints
## Open Questions
```

State whether a file was written and, if not, that the draft was shown only in the conversation.

## References

None.
