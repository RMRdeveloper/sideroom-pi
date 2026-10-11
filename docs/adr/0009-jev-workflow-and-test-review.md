# 0009. Extend Jev to tests and bounded workflow judgments

- **Status:** Accepted
- **Date:** 2026-10-11

## Context

The existing semantic review cannot assess changed behavior against tests or
consumers consistently when imports occupy every context slot. Questionnaires
and task completion also contain judgments that mechanical schema checks cannot
resolve. The requested improvement includes these workflows, which expands the
external-data contract accepted in ADR 0006.

## Decision

1. Keep code review advisory and evidence-based. Add testability, redundant
   abstractions, visible consumer compatibility and relevant test quality.
   Prioritize related tests, then production consumers, then imports within
   the existing four-file and byte limits. Direct references or sibling test
   naming conventions establish relations; an arbitrary basename match does not.
2. Review successful non-cancelled questionnaires after their result. Send
   validated question text, options and recommendation indexes, never answers
   or conversation history. Findings go to the end-of-run review.
3. Review targeted new or reworded completed tasks with bounded observed evidence:
   at most four latest whole changed files and added lines, without neighbours,
   plus the status of the detected project check. Never send commands, logs or
   the whole board. Reset evidence each user turn and session; invalidate old
   file snapshots after deletion-only or oversized edits. Mark omissions partial.
4. Share all request limits, cancellation, key resolution, failure policy and
   call counting. No request or workflow evidence processing without a key.
   Never block or silently change a user answer or task status.
5. Allow semantic notes alone to arm one end-of-run review. Without code changes,
   review the question/task contract and require checks only if code changes.

## Consequences

Question and task wording can now leave the machine when Jev is enabled. This
supersedes ADR 0006's prohibition on sending any board content, and its imports-first
selection order. External calls increase for eligible workflow results. Whole
source snapshots remain bounded and in memory; no conversation history travels.
Observed checks do not prove the filesystem stayed unchanged after arbitrary
shell commands. Partial context is never evidence of absent tests or unfinished
work. The model remains probabilistic: mocked tests verify wiring and policy,
not real-model accuracy. Measure false positives on labeled examples before
changing cutoffs or allowing findings to control behavior automatically.
