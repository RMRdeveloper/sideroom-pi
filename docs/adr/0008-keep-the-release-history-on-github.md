# 0008. Keep the release history on GitHub, not in the site

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

The site published its own changelog page, generated at build time from
`CHANGELOG.md`, with `CHANGELOG.es.md` as a hand-written companion and a build
check that failed whenever a released version was missing from the Spanish file
(ADR 0007). Every release therefore carried a translation pass over about 33 KB
of technical text, and the page duplicated a document the repository already
owns and GitHub already renders. The user asked for the page to go and for both
languages to link to the changelog on GitHub.

## Decision

1. The site keeps one page per language and no release history of its own. The
   changelog route, the component that rendered it, the parsing and rendering
   code, their tests and the drift check are deleted.
2. Both languages link to `CHANGELOG.md` at the repository root on GitHub. One
   destination, the same document the repository owns, including the section for
   changes that are not released yet.
3. `CHANGELOG.es.md` is deleted with the page that consumed it. The released
   changelog is English only, and `CHANGELOG.md` stays owned by changesets,
   never hand-edited for translation.
4. `CHANGELOG.md` remains the single source of truth for what shipped, and the
   GitHub releases the publish workflow already creates remain the per-version
   view.

## Consequences

- The Spanish reader who follows the link lands on an English document. The page
  no longer promises a translated changelog.
- A release costs no translation pass, and the site build loses a step that
  could fail for a reason unrelated to the page.
- The drift that the check existed to catch disappears with the document that
  could drift: there is no second copy left to fall behind.
- Removing a published route is permanent for anything that links to it. Nothing
  published points at the site's changelog route yet, which is what makes the
  removal cheap now and expensive later.

## Alternatives considered

- **Keep `CHANGELOG.es.md` and its check, and send the Spanish page to the
  Spanish file on GitHub:** rejected because the translation earned its cost
  while a page published it; without that page it is a maintenance pass with no
  reader, and the check would need a new home outside the site build.
- **Keep the file and drop the check:** rejected because a translation that
  falls behind in silence is the exact failure ADR 0007 was written to prevent.
- **Keep the route and its code, unused:** rejected because a route that renders
  nothing is dead weight on a site the user asked to simplify.
- **Link to the GitHub releases page instead of the file:** rejected because the
  file also carries the unreleased section, and one stable URL is easier to keep
  correct in two languages.

## Revisit when

A translated changelog is wanted again, the site starts publishing its own
version history, or hosting is decided and the site grows documentation pages
beside the front page.
