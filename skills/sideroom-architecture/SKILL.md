---
name: sideroom-architecture
description: "Surface the architectural decisions a change forces so they are asked, not silently assumed. Use when a feature or change touches module boundaries, data ownership, integration contracts, failure behavior, quality attributes, operations, cost, lock-in, or reversibility, or when the user says the architecture is not settled. Do not use for a trivial or reversible change, a pure glossary lookup, or an already-closed spec."
license: MIT
metadata:
  author: RMRdeveloper
  version: "1.0"
---

# Sideroom architecture

## Purpose

An LLM's default failure is to assume the architecture and start typing. This
skill forces the opposite: name the architectural decisions a change forces and
ask the ones that matter, instead of picking them silently. It does not turn
every change into an interrogation.

## Activation Contract

Load this skill when a change is about to commit an architectural decision:
something that materially affects module boundaries, data ownership,
integration contracts, failure behavior, quality attributes (latency,
throughput, availability), operations, cost, lock-in, or the difficulty of
changing course later. It runs under `sideroom-grill` for the architectural
part of an interview, and on its own when only the architecture is open.

Do not load it for a minor decision (reversible, no boundary or contract
impact), or for a word conflict — that is `sideroom-domain-modeling`.

## Hard Rules

- Assume nothing architectural. When a change forces an architectural decision
  the code does not already settle, expose it through `sideroom_ask` before
  writing the code. Silent selection of an architectural default is the failure
  this skill exists to prevent.
- Pick the dimensions this decision actually touches; do not march the whole
  catalog. Two sharp questions beat nine shallow ones. A dimension the change
  does not touch is not asked.
- Read the code first. A decision the repository already settles consistently
  is a project fact: reuse it, never ask it. When the repository shows two
  inconclusive patterns for the same kind of decision, name that inconsistency
  in the prompt instead of picking one.
- Quantify or decline. An architectural dimension does not close without a
  number, a range, or an explicit `Out of scope` from the user. A decision
  without a figure is a preference in disguise.
- Every option of an architectural question carries a `description`: its
  practical consequence, its cost, and the obligation it imposes. The label
  names the choice; the description carries the trade-off. Never a one-word
  technology label.
- Present the decision as the current situation, the alternatives by their
  practical consequences, and one recommendation with a one-line justification.
  Never reduce it to technology names.
- One open architectural dimension blocks implementation. `Out of scope` closes
  a thread, is recorded, and is not re-asked.

## Dimension catalog

Reference, not a checklist. Pick only what the change touches; force a number or
an explicit `Out of scope` on each one you pick.

| Dimension | The question it forces |
| --- | --- |
| Boundaries | Which modules are in, which are out, which dependency direction is forbidden |
| Data | What is the source of truth, who owns it, how the schema evolves and migrates |
| Integration | Synchronous or asynchronous, backward compatibility, version window |
| Quality attributes | Expected latency and volume, availability target — in figures |
| Failure | What degrades, what retries, what must be idempotent |
| Operations | How it deploys, how it rolls back, which signal warns it is going wrong |
| Cost and lock-in | Operating cost, the cost of leaving the provider or dependency |
| Ownership | Who maintains it, who responds when it breaks |
| Reversibility | What reopens the decision, and how expensive undoing it is |

## Execution Steps

1. Read the code around the change. Settle every project fact from the
   codebase, and note any inconsistent pattern to name in a prompt.
2. List the architectural decisions the change forces. Drop the ones the code
   already settles.
3. For each remaining decision, pick the dimensions it touches and run one
   `sideroom_ask` round: situation, alternatives by consequence, one
   recommendation, each option with a `description`. Force a number or an
   explicit `Out of scope`.
4. Repeat rounds until no architectural dimension is open. Do not implement
   with one open.
5. Record an accepted decision as an ADR under `docs/adr/` only when it clears
   the three `sideroom-domain-modeling` gates: hard to reverse, surprising
   without context, the result of a real trade-off. The ADR names the rejected
   alternatives and what reopens the decision.

## Output Contract

Before the first round: a one-line statement of what is built, what it touches,
what is out. After the rounds: the architectural decisions closed with their
figures, the dimensions marked out of scope, and any ADR written with its
rejected alternatives and its revision trigger. No architectural default
reaches the code without having been asked or read from the repository.

## References

- Driven by `sideroom-grill` for the architectural part of an interview; that
  skill owns the interview, this one owns the architectural interrogation.
- Hands qualifying decisions to `sideroom-domain-modeling` for the ADR
  three-gate offer and records shared vocabulary through it.
