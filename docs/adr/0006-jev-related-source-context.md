# 0006. Send bounded related source to Jev

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

Jev previously received only the changed file and its added lines. That makes checks about a validation boundary or dependency direction unreliable when the evidence is in another file. Sending additional project files to a third party cannot be undone after the request, so the scope and omissions must be explicit.

## Decision

1. Keep one request per successful, reviewable mutation. Send the complete changed file and at most four directly related source files: files it imports and direct consumers detected from source references. Prefer imports over consumers. Never send the conversation, session, configuration, documentation, or a repository-wide dump.
2. Discover neighbours only inside the working directory. Respect `.gitignore`, `.ignore`, and `.fdignore`; skip hidden, build, dependency and sensitive-named paths, and do not follow symlinks. Bound the scan. This is path filtering, not a guarantee that ordinary source files contain no secrets; projects must keep secrets out of source.
3. Use TypeSafe's documented 32k-token state-plus-longest-question and 64k-token request limits. Conservatively budget at most 32,000 UTF-8 bytes for the serialized state plus its longest question, and 64,000 bytes for the serialized request. Do not add a tokenizer dependency or send partial files. If the changed file cannot fit, skip Jev; otherwise omit oversized neighbours and mark incomplete context.
4. Ask only questions supported by the supplied evidence. Add guide rules 11 (responsibility), 17 (dependency direction), and 19 (comments), and make rule 10 require visible evidence of both checks. Findings remain non-blocking and subject to the existing probability cutoff, deduplication, cancellation, and fail-open policy.

## Consequences

- More project source leaves the machine on qualifying edits. The optional Jev key still controls whether any request is made.
- An ignored, unreadable, too large, or unrecognized relation is not evidence that no relation exists. Cross-file findings must not be inferred from it. Static source references will not resolve every language's dynamic imports or project-specific aliases.
- The byte bound may send substantially less than the official token budget permits. Four files is a ceiling, not a target. Scanning and reading files adds local work before the existing network call.

## Alternatives considered

- **Keep the single-file state:** rejected because it cannot establish cross-file boundaries.
- **Send the whole project or up to 1,280,000 characters in one request:** rejected because irrelevant material lowers accuracy and one request must obey the official token limits.
- **Split the project across multiple requests:** rejected because it raises cost and latency and creates conflicting partial judgments.
- **Use a local tokenizer:** rejected because no tokenizer supplied by the service guarantees the served model's token count; it adds maintenance without guaranteeing compliance.
- **Skip all review when a neighbour is absent:** rejected because local rules can still be checked without that neighbour.

## Revisit when

TypeSafe offers an official token-counting method, per-project consent is required for additional source, or measured false findings show that the selected neighbours are insufficient. Reconsider the four-file ceiling and selection order against real review cases before increasing external data exposure.
