# Story templates

Use the user's language for headings and content; translate these English
examples when needed. Replace placeholders with agreed facts; omit optional
sections that add no information. Keep unresolved questions outside the
promised scope.

## Functional story

Title: `<Action verb + result and business object>`

```md
As a <person>, I want <capability>, so that <useful, verifiable result>.

## Context

<Why this is needed, or the contrast between current and expected behavior.>

## Scope

- <Included capability and its boundaries.>

## Business rules

- <Permission, restriction, or precedence that changes the outcome.>

## Acceptance criteria

- Given <initial state>, when <action or event>, then <observable result>.

## Dependencies

- <Actual reference> — <required capability and reason it blocks this work>.

## Out of scope

- <Nearby work that could be mistaken for part of this delivery>.
```

The story sentence, scope, and acceptance criteria are required. Context,
business rules, dependencies, and exclusions are conditional. A project may
require additional fields; use its conventions rather than inventing values.

Choose the most specific role whose workflow improves. Put secondary
beneficiaries in scope only when relevant. The capability describes what the
actor achieves, not a screen, table, or endpoint. The value explains a useful
consequence, not “so that I can use the feature” or an unsubstantiated benefit.

A title must distinguish the result in a list without opening the ticket.
Keep product vocabulary; include technology only when it defines the
deliverable. Prefer “View orders by delivery status” over
“Changes to Orders.vue”.

## Technical enablement

Use a developer or another technical consumer only when they receive the
value. Keep the functional template, but make the enabled capability explicit:

> As an integration developer, I want to query an order's status through a
> stable contract, so that I can report its progress without duplicating
> tracking rules.

Include agreed schemas, routes, constraints, or compatibility rules when those
are the deliverable. “Create a table, endpoint, and tests” is implementation
work, not an observable acceptance criterion. If the contract is undecided,
resolve it or return a draft; do not invent its fields.

## Bug

```md
## Observed behavior

<What happens and who is affected.>

## Expected behavior

<Correct result supported by a rule or decision.>

## Steps to reproduce

1. <Known initial state.>
2. <Action.>
3. <Observed result.>

## Impact

<Known affected users, frequency, and blockers; state what needs confirmation.>

## Acceptance criteria

- Given <condition that reproduces the defect>, when <action>,
  then <correct observable result>.
```

Use minimal anonymized reproduction data. Keep secrets and unnecessary
personal information out. If reproduction is unknown, state that explicitly
rather than supplying fictional steps.

## Complete functional example

The permissions and behavior here are illustrative, not defaults for a project.

**Title:** Allow cancellation of a pending reservation

As a reservation holder, I want to cancel my reservation before confirmation,
so that I can release the time slot I no longer need.

### Scope

- The holder can cancel their own reservation while it is pending.
- The holder can view the resulting status when reopening the reservation.

### Business rules

- Only the reservation holder can cancel the reservation.
- This flow does not allow cancellation of a confirmed reservation.

### Acceptance criteria

- Given a pending reservation, when its holder cancels it, then the reservation
  becomes cancelled.
- Given a cancelled reservation, when its holder views it again, then they see
  the cancelled status.
- Given another person's reservation, when someone attempts to cancel it,
  then the action is denied and the reservation retains its status.
- Given a confirmed reservation, when its holder attempts to cancel it through
  this flow, then cancellation is rejected and the reservation stays confirmed.

### Out of scope

- Cancelling confirmed reservations or processing refunds.
