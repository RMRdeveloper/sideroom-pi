# 0007. Ship the site in two languages, with a checked changelog translation

- **Status:** Superseded by [0008](0008-keep-the-release-history-on-github.md)
- **Date:** 2026-09-27

## Context

The site is bilingual: English at the root, Spanish under `/es/`, and everything is translated, the released changelog included. The changelog is about 33 KB of English technical text that changesets rewrites on every release, and nothing in the repository would notice a Spanish changelog that fell several versions behind. A translation that drifts in silence is worse than none, because a visitor reads the Spanish page as if it were current.

## Decision

1. The English changelog stays the single source of truth. `CHANGELOG.md` is never hand-edited for translation; the tooling keeps owning it.
2. The translation lives in `CHANGELOG.es.md` at the repository root, with one heading per released version copied from the English version heading, so the two files can be compared by version rather than by text.
3. The site build compares the version headings of both files and fails with the exact versions that are present in English and missing in Spanish. A missing or empty translation is a build failure, not a warning.
4. Page text lives in one template set plus two text files, one per language, sharing their keys. A structure or layout change therefore touches one place and reaches both languages; the changelog is the one document that keeps its own parallel file.
5. The changelog page is generated from those two files at build time. No version heading is ever retyped into a template.

## Consequences

- Every release now costs a translation pass as well as the version bump. The build check turns that cost into a named failure instead of a silent gap.
- The Spanish page can never claim a version the English page does not have, and the reverse is caught by the same check.
- Both files must agree on the version heading format. A release that renames a heading breaks the check loudly, which is the intended failure.
- A page text change that adds a key requires both text files to gain it. The build fails on a key missing from either.
- The changelog page publishes the English technical wording of upstream links and commit references in both languages; only the prose around them is translated.

## Alternatives considered

- **Translate the page only and link the changelog to GitHub on the Spanish side:** rejected because the user asked for a fully translated site, and it would send the Spanish reader out of the site.
- **Translate everything by hand with no build check:** rejected because the drift is silent and the most likely failure is not noticing it for several releases.
- **Translate at build time with a machine translator:** rejected because nobody reviews the output, and the changelog carries named behaviour and security-relevant fixes.
- **Keep the Spanish changelog inside the page text files:** rejected because a 33 KB document inside interface strings has no completeness check and is painful to review.
- **Duplicate one page per language instead of one template plus two text files:** rejected because every layout change would then have to be repeated in two files that drift apart.

## Revisit when

The package stops releasing through changesets, the Spanish page's traffic stops justifying the translation pass, or a reviewed translation pipeline replaces the hand-written one. Any of those removes one half of this decision; the build check stays worth keeping either way.
