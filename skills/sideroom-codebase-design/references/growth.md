# Assess long-term growth

Read when the request concerns scaling, growing teams, or future evolution.
Choose the dimensions the current code and requested outcome actually touch.
Do not make the user complete a generic capacity questionnaire.

## Establish the growth pressure

Distinguish three kinds of growth:

- **Behavior:** more features, business rules, integrations, and supported
  versions. Inspect whether each addition requires coordinated changes across
  unrelated files or duplicated decisions.
- **People:** more contributors, ownership boundaries, and concurrent changes.
  Inspect contracts, dependency cycles, shared state, release coupling, and
  whether a contributor can change one responsibility with bounded context.
- **Workload:** more requests, stored data, concurrency, or background jobs.
  Inspect resource bounds, work per operation, contention, and failure behavior.

Use existing requirements, code, tests, measurements, incident notes, and
available history. State the current baseline, expected direction or target,
and time horizon when known. Ask only for missing figures that would change
the design choice. A code review can improve changeability without inventing
traffic forecasts or blocking on production access.

## Check constraints, then choose mechanisms

| Evidence to inspect | Question to resolve |
| --- | --- |
| Unbounded lists, scans, buffers, or queries in a critical path | What bounds the work and memory as data grows? Is pagination, indexing, or batching justified by actual access patterns? |
| Shared mutable state, global locks, synchronous I/O, or long transactions | Where does concurrent work serialize, and which ownership or consistency guarantees must survive? |
| Retries, external calls, job queues, and duplicate events | What is bounded, cancellable, idempotent, or allowed to degrade? What happens when a dependency slows down? |
| Cross-module rules, coordinated edits, and shared releases | Which stable contract would let an ordinary feature change stay local? |
| Schema changes, public interfaces, and multiple deployed versions | How can old and new consumers coexist, and what makes migration or rollback safe? |
| Existing service boundaries and operations | Does distribution solve a measured constraint enough to pay for network failures, deployment, tracing, and coordination? |

Separate a code-level risk from a measured bottleneck. For example, an unbounded
query is observable in code, but its production latency impact needs a known
dataset and workload. A static review alone does not prove a capacity limit.

Do not default to microservices, queues, caches, plugin systems, or generic
repositories. Compare a simpler change inside the existing deployment first.
Prefer an evolution path with explicit contracts and small migrations over
building unused capabilities. A user's known growth requirement counts as a
real need, even before the traffic arrives.

## Make the recommendation falsifiable

For a proposed scale improvement, state:

- The observed constraint and the evidence supporting it.
- The workload, data shape, or development scenario that matters.
- The mechanism expected to help and its cost or new failure mode.
- The relevant check: behavioral regression, concurrency test, query plan,
  representative load measurement, or evidence that fewer callers must change.
- The success criterion supplied by requirements or established baseline.
  If missing, label it unresolved instead of inventing an improvement percentage.

Organize longer work as **now**, **next**, and **when triggered**. Each later
step names the growth event or measurement that would justify it. Include
dependency order, transition risks, and rollback for the proposed migration.
Do not turn hypothetical concerns into a backlog of mandatory refactors.
