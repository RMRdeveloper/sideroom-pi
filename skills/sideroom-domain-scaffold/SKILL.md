---
name: sideroom-domain-scaffold
description: "Trigger: document my repo, scaffold CONTEXT.md, brownfield glossary, survey domain. Read the central domain code as source of truth and build or complete CONTEXT.md without interviewing anyone; conflicting terms are collected and grilled once, at the end."
license: MIT
metadata:
  author: RMRdeveloper
  version: "1.0"
---

# Sideroom domain scaffold

## Activation Contract

Load this skill on explicit request ("document my repo", "scaffold the
glossary") over a codebase whose domain language is missing or thin. The
code is the source of truth. Nobody is interviewed while the modeling runs.

## Hard Rules

- Zero interviews during the scan. Every irreconcilable conflict goes onto
  a conflict list; modeling continues. The happy path is never interrupted.
- Scope is the central business domain: its modules, types, enums, and
  statuses. Ignore infrastructure, tooling, and utilities. Domain tests are
  witnesses of the language, never sources of new terms.
- Reconcile by prevalence and centrality: the dominant, core-module usage
  wins. Record each such call as an assumption for later review.
- Merge, never rebuild. An existing `CONTEXT.md` is curated truth: add and
  sharpen only. A contradiction between the code and an existing entry is
  not overwritten; it joins the conflict list.
- Entry format, glossary purity, lazy file creation, and multi-context
  routing all follow `sideroom-domain-modeling`. This skill owns the scan;
  that one owns the writing.
- No ADRs. Trade-offs cannot be validated without humans; hard choices found
  in the code are reported, not recorded.
- Grill once, at the end. When modeling is complete, launch
  `sideroom-grill` scoped exactly to the conflict list so a human bounds
  each confused term correctly. With an empty list there is no grill: close
  with the glossary and the assumptions.

## Decision Gates

| Situation | Move |
| --- | --- |
| Same term, two meanings, no dominant use | Conflict list; grilled at the end |
| Code contradicts an existing glossary entry | Conflict list; the entry stands until grilled |
| Term belongs to infra, tooling, or utils | Skip it; out of scope |
| Whole plan needs interrogating, not just terms | `sideroom-grill` instead of this skill |

## Execution Steps

1. Read `CONTEXT.md` (and `CONTEXT-MAP.md`, if any) before touching the
   model.
2. Survey the central domain code and collect candidate terms.
3. Group synonyms, split overloaded terms, reconcile by prevalence.
4. Write each settled term inline, merged with what exists.
5. Collect conflicts and assumptions without stopping.
6. Close: report the glossary and the assumptions, then either launch the
   end-of-run `sideroom-grill` on the conflict list or state that the model
   came out clean.

## Output Contract

A merged `CONTEXT.md` the code already agrees with, a reviewable list of
assumptions, and — only when the code disagreed with itself — one bounded
grilling at the end. No interview ever interrupts the scan.

## References

- Entry rules come from `sideroom-domain-modeling`.
- Conflicts are handed to `sideroom-grill`, once, at the end of the run.
