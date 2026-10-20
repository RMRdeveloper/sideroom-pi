# Story review

Apply this review to each story, including stories proposed in a split.
Report findings against specific wording, with a correction or a question
that would resolve the issue.

## Title, actor, and value

- The title names a recognizable result and business object.
- The actor receives the value; an implementation team is not a substitute.
- The capability uses a precise action such as consult, assign, cancel, or
  configure. Replace “improve” or “manage” with what actually changes.
- The value explains why the actor needs the capability without promising
  metrics or benefits unsupported by the agreed scope.
- One main need has clear boundaries. Split independent outcomes rather
  than mechanically separating implementation layers.

## Scope and rules

Scope states what can be done or seen and which state changes. Business
rules state the conditions governing that behavior: permissions, restrictions,
precedence, ownership, or a source of truth when relevant.

A rule should survive a different implementation. “A reservation has at most
one active holder” is a rule; a proposed database index is a design choice
unless that index is itself the technical deliverable.

Include agreed behavior, not guesses. An unresolved permission or conflict
policy is a question, not a criterion. Link decisions with enough behavioral
detail that QA can understand the expected outcome without reading the code.

## Acceptance criteria

Each criterion needs a relevant precondition, an action or event, and an
observable result. Use Given/When/Then for conditional behavior; a direct
bullet is sufficient when it still carries all three parts.

Each criterion must be:

- Observable through a public interface or a business result.
- Specific enough that two reviewers agree whether it passes.
- Focused on one main rule rather than a chain of unrelated behaviors.
- Traceable to scope or an agreed business rule, without introducing new work.
- Neutral to implementation, except for an agreed technical contract.

Cover the successful path. Add only cases that can change the outcome:
authorization and visibility, invalid input and recovery, empty data,
persistence on a later consultation, retries and duplicate requests,
concurrent changes, dates and limits, dependency failure, or agreed legacy
compatibility. Ask about unknown behavior instead of completing this list
by assumption. Measurable performance requirements need an agreed threshold
and conditions; never invent them.

| Weak wording | Correction |
| --- | --- |
| “Works correctly” | Name the initial state, event, and final result. |
| “The interface is intuitive” | State the action the actor can complete and the feedback received. |
| “Handle errors” | Name the relevant failure and the observable state afterward. |
| “According to the design” | State the rule and link the specific approved design if needed. |
| “Create an endpoint, table, and tests” | State the observable contract or move implementation steps out. |
| “Pass lint and update documentation” | Keep routine delivery checks in the project's Definition of Done, not functional acceptance. |

Acceptance describes behavior. Tests demonstrate it; PR checks record the
tools and commands used. Do not turn those records into user requirements.

## Readiness check

Before calling a story ready for review, confirm:

- The actor, capability, and useful result are explicit.
- Scope and acceptance describe the same single need.
- Relevant business rules and outcome-changing edge cases are settled.
- Every criterion can objectively pass or fail.
- Optional sections clarify something real and do not repeat other sections.
- Dependencies have real references and an explanation when known.
- Open questions are outside the promised requirements; unresolved behavior
  that changes acceptance keeps the story marked as a draft.
- Technical detail defines an agreed contract or remains outside the story.
- Tracker conventions and metadata come from the project or user.
- Duplicate search and publication status are reported honestly.

This is a semantic review, not proof of product approval, implementation,
or QA completion. Do not mark a remote workflow state merely because this
checklist passes.
