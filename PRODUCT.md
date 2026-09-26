# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro, chosen by the user. The site lives in `site/` with its own
`package.json` and its own build; the root `package.json` stays the Pi package
that npm publishes. Static output, no client framework islands, plain CSS with
custom properties instead of a CSS framework.

## Users

Primary: people who run Pi every day and watch the agent guess instead of
asking, bury its progress in chat scroll, or call the work done while the
project's own checks are still red. They install a package rather than sign up
for a service, and they judge the tool from inside a terminal session.

## Product Purpose

Sideroom Pi is a global Pi package that adds a side room next to the code: a
place to ask sharp questions, show live progress, track the files that changed,
and hold the agent to the project's own checks. Success means the agent asks
before it guesses, the plan stays visible while it works, and the run does not
end while the checks are red.

## Positioning

Ask, show, enforce, verify. The room lives in the Pi session branch, so nothing
it produces is written into the user's repository: no config file, no task
graph, no leftover plan committed next to real code.

## Operating Context

- Installed with `pi install npm:@rmrdeveloper/sideroom-pi`.
- Used inside a Pi session: a questionnaire, a work board above the editor, a
  list of edited files, and quality gates around `write` and `edit` calls.
- Version 8.11.0 on npm, MIT license.
- The repository is the package. Its `npm run check` runs the type check, the
  if-block check, Biome, and the test suite.

## Capabilities and Constraints

- Eleven extension folders under `extensions/`: ask, todo, modified-files,
  guidelines, monorepo-skills, jev, rules, persona, done, explain, plus
  `shared/` which has no entry point. Six skills under `skills/`.
- Constraint: the site must stay out of the published package. The root
  `package.json` `files` list and the CI workflow are not part of this change.
- Constraint: the site is bilingual. English at the root, Spanish under `/es/`,
  and every word on the page is translated. The changelog is not part of the
  site: both languages link to `CHANGELOG.md` in the repository.
- Hosting: GitHub Pages, published from `site/dist` as a project page under
  `/sideroom-pi/` by `.github/workflows/site.yml`. The origin and the base path
  live in `site/astro.config.mjs`; nothing else in the site hardcodes them.
- Local development serves the same base path as production: `npm run dev`
  prints the address, and it always ends in `/sideroom-pi/`. The root is not a
  page.

## Brand Commitments

- The name is written "Sideroom Pi".
- The page carries no mark: its identity is typography, space, and the real
  terminal captures. The project has a mark for the surfaces the page does not
  own — the tab and app icons and link cards — drawn on its own light ground
  from `media/logo-square.png`. `media/logo-transparent.png` is the exception,
  for a surface that has to show it without a plate.
- The mark is the one place a colour outside the verdict palette appears, and it
  is never applied to the page around it. Identity still comes from typography,
  space, and the real terminal captures.

## Evidence on Hand

- `README.md` — the five failure modes, the answer table, and usage.
- `media/preview.png` — a real terminal capture of a question batch and the
  board.
- `media/preview.mp4` — a short real capture.
- `media/logo.png` — the mark as the README shows it: 640 × 336 with a
  128-colour palette, derived from `media/logo-square.png` with `npx sharp-cli`.
- `CHANGELOG.md`, `docs/architecture.md`, `CONTEXT.md`, `docs/adr/`.
- The npm version and download badges used by the README.

Absent, and not to be fabricated: testimonials, customers, benchmarks, adoption
figures beyond the public npm and GitHub badges, pricing, and partnerships.

## Product Principles

1. Ask before guessing.
2. Nothing lands in the user's repository.
3. The board is the plan, and exactly one step is active at a time.
4. The project's own checks decide when work is done.
5. The rules are read before the code is written, not after.

## Accessibility & Inclusion

The site targets WCAG 2.2 AA: keyboard reachable, visible focus, AA contrast,
and reduced motion respected.
