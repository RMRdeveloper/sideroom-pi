---
name: Sideroom Pi
description: A dark page made of the pieces the tool itself prints — the board, the question batch, the command, the verdict — with colour kept for the verdicts.
colors:
  ground: "#131211"
  well: "#0b0a09"
  raised: "#1b1917"
  line: "rgba(242, 237, 227, 0.1)"
  line-strong: "rgba(242, 237, 227, 0.24)"
  ink: "#f2ede3"
  ink-dim: "#a49d8f"
  ink-mute: "#8b8477"
  block: "#ff6a50"
  warn: "#ffb340"
  lit: "#f2ede3"
  lit-ink: "#131211"
typography:
  display:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(2.25rem, 5.2vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(1.5rem, 2.6vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  subtitle:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.15
  lead:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  body:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
  small:
    fontFamily: "Archivo Variable, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.65
  code:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.65
  cell:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  none: "0"
spacing:
  s-1: "4px"
  s-2: "8px"
  s-3: "12px"
  s-4: "16px"
  s-5: "24px"
  s-6: "36px"
  s-7: "56px"
  s-8: "88px"
components:
  board:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
  board-row-active:
    backgroundColor: "{colors.lit}"
    textColor: "{colors.lit-ink}"
  board-row-completed:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink-mute}"
  batch-tab-current:
    backgroundColor: "{colors.lit}"
    textColor: "{colors.lit-ink}"
    padding: "9px 12px"
  batch-option:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 12px 12px 0"
  batch-option-selected:
    backgroundColor: "{colors.lit}"
    textColor: "{colors.lit-ink}"
  command:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "14px 16px"
  command-button-copied:
    backgroundColor: "{colors.lit}"
    textColor: "{colors.lit-ink}"
  outcome-output:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px"
  capture-frame:
    backgroundColor: "{colors.well}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 11px"
---

# Design System: Sideroom Pi

## Overview

**Creative North Star: "The session at full size"**

The page is built out of what the tool already prints. The board that sits above
the editor, the batch of questions, the command you type, the verdict a blocked
write comes back with — those are the page's parts, and the page invents none of
its own. There are no figure plates, no key letters, no numbered squares, no
turned-up corners dressed as an instrument. A device earns its place by being
something the product really produces.

That single rule decides the rest. Colour is a verdict, so red and amber appear
only where the rules tool would print them. Monospace is the machine's voice, so
it carries commands, paths, identifiers and board rows, and never a paragraph.
The lit face — ink turned into a background — is the product's own treatment for
the thing you have selected, so it marks the active board row, the tab in view
and the answer you chose, one at a time.

**Key Characteristics:**

- Every element is a real artifact: board row, batch tab, option, command, rule output.
- One text family for reading, one mono for the machine.
- Two verdict colours, red and amber, and no other hue on the page.
- Depth is a hairline; nothing is raised, nothing casts a shadow.
- Square corners everywhere except the controls the browser draws.
- Motion exists only as an answer to a click.

## Colors

A dark ground with ink for reading, and colour spent only on verdicts.

### Primary

- **Ink** (#f2ede3): text, and the lit face when it is turned into a background. There is no separate accent.
- **Ground** (#131211): the page. A warm near-black, kept deliberately away from both brown and blue-black.

### Secondary

- **Block Red** (#ff6a50): the `block` verdict only — the `Blocked` label, its example verdict, and the invalid state of the custom answer field.
- **Warn Amber** (#ffb340): the `warn` verdict, and the `not answered` line of the batch summary, which is the one state the terminal itself paints in warning colour.

### Neutral

- **Well** (#0b0a09): the recessed fill. The board, the command well, the rule output, the capture frame, the answer field.
- **Raised** (#1b1917): the second surface, used by the question batch alone, because the terminal draws it on a panel of its own.
- **Quiet Ink** (#a49d8f): descriptions, leads, captions, secondary columns. 7:1 on the ground.
- **Mute Ink** (#8b8477): hints, completed board rows, rule names, help lines. 5:1 on the ground.
- **Line** (rgba(242, 237, 227, 0.1)): the hairline between rows.
- **Strong Line** (rgba(242, 237, 227, 0.24)): the edge of a control, and the rule that opens a section.

### Named Rules

**The Verdict Colour Rule.** Red and amber are verdicts, not mood. They may colour a word that names a verdict, and nothing else — never a border, never a tint, never a heading.

**The One Lit Face Rule.** Ink used as a background marks the one thing you have selected in a group: the active board row, the tab you are reading, the answer you picked. Two lit faces side by side means the page is telling you two things at once.

## Typography

**Text:** Archivo Variable (with Helvetica Neue, Arial).
**Machine:** IBM Plex Mono (with ui-monospace, Menlo).

**Character:** one grotesque does the reading and the headings, at real weight
and full width, and it carries hierarchy through size alone. The mono is the
machine's voice: it is read character by character, so it is used for commands,
paths, identifiers, rule names and printed board rows, and never for prose.

### Hierarchy

- **Display** (700, clamp(2.25rem, 5.2vw, 3.75rem), 1.02, tracked -0.03em, sentence case): the one claim, at most 18 characters of measure.
- **Title** (700, clamp(1.5rem, 2.6vw, 2rem), 1.15, -0.02em): section headings, sentence case.
- **Subtitle** (700, 1.125rem): the heading of a block inside a section, and the batch prompt.
- **Lead** (400, 1.0625rem): the sentence under a section heading, in Quiet Ink. The same size as body, because a lead is a sentence and not a label.
- **Body** (400, 1.0625rem, 1.65): running text, 66 characters of measure.
- **Small** (400, 0.9375rem): row bodies, descriptions, captions, table cells.
- **Code** (mono 400, 0.8125rem): commands, paths, identifiers, board rows, summary lines.
- **Cell** (mono 400, 0.75rem): the board hint, the rule name beside an example, the help line.

### Named Rules

**The Machine Voice Rule.** Mono is for what a machine produced or will run. A sentence never wears it to look technical.

**The No Labels Rule.** A heading is a sentence in sentence case. Nothing sits above a heading to announce it, and nothing is set in uppercase with wide tracking.

## Layout

One reading column inside a 74rem sheet with a gutter of clamp(20px, 4vw, 48px).

The opening is a two-column grid (1.1fr / 1fr, 88px apart): the claim, the offer
and the command on the left, the running board on the right. It collapses to one
column at 1000px, where the words come first and the board follows.

Sections open with a 56px gap above, a 1px strong line, and the heading 16px
below it. A section's body starts 36px under its heading. Six section shapes
repeat:

- **Row list** (`.rows`): one fact per row, separated by a hairline, closing on a hairline. A tool row puts the tool name in a 9rem right column; a named row puts the name in a 12rem left column; everything else is one full-width column.
- **Split** (`.split`): two columns, 1.05fr / 0.95fr, for a list beside a capture or a glossary. Collapses at 1000px.
- **Outcomes**: three equal columns, each one verdict with its real output in a well. Collapses at 1000px.
- **Example lines**: three columns — code, verdict, rule name. Below 720px it becomes two columns with the rule name on its own line.
- **Board**: a well with a title row, monospace rows and a hint row. The rows are laid out in `ch` units so the columns line up exactly as the terminal aligns them: 1ch of mark, the id column padded to the longest id, an 11ch status column, then the content.
- **Capture**: a well-black frame with a strong hairline and the real recording inside.

Vertical rhythm is 4, 8, 12, 16, 24, 36, 56 and 88px.

## Elevation & Depth

There are no shadows and no inset shadows. A recess is a darker fill with a
hairline around it. The only two fills in the system are the well and the raised
panel, and both mean "this is a piece of the interface", not "this is a card".

### Named Rules

**The Hairline Rule.** A separation is a 1px line. Nothing is raised to sit above anything else.

## Shapes

Square corners on every box the page draws. The only rounded shapes are the ones
the browser draws inside a video's control bar. A frame nests one level deep at
most: the capture frame holds the recording, and nothing holds the capture frame.

## Components

### Brand mark

- **Where it appears:** nowhere on the page. Identity here is typography, space and the real captures; the mark belongs to the surfaces the page does not own — the tab and app icons, and link cards.
- **Source:** cropped and resized with `npx sharp-cli` from `media/logo-square.png` into `site/public/`: `favicon.png`, a 48px circle with the drawing inset to 36px so the round edge never clips it; `apple-touch-icon.png` (180) and `icon-512.png` (512), square with the drawing at 93% of the frame, because iOS and Android mask them themselves; and `og-card.jpg` (1200 × 630), the drawing at 440px high centred on the same ground.
- **Ground:** the mark is always shown with its own background, because a mark seen on somebody else's surface has to bring its own. `media/logo-transparent.png` is the exception, kept for the rare case that needs the mark without a plate; nothing uses it today.
- **Colour:** the mark keeps its own values — dark slate with a muted rose accent — and because it never appears on the page, the page keeps its two verdict colours and nothing else.

### Board

- **Shape:** a well, a 1px line, a title row, rows, and a hint row when some rows are hidden.
- **Title:** the widget prints `Sideroom board (1 active, 4 queued)`; the full view prints `Work board (8)`.
- **Rows:** `> rebuild in_progress Rebuild the page` — the mark, the id, the status, the content. `>` is in progress, `-` is queued, and U+2713 is resolved.
- **Active row:** the lit face, and it is the only lit row.
- **Queued row:** ink. **Resolved row:** mute ink.
- **Selection:** the widget shows five rows and prefers the active one, then the queued ones, then the resolved ones, which is the rule the terminal widget follows. The remainder is named in the hint: `…+3 more · F9: view all`.
- **Deviation:** the terminal paints the active row green. On this page colour means a verdict, so the active row takes the lit face instead — the same inverted treatment the terminal gives the row it has selected.

### Question batch

- **Shape:** the raised panel, a tab row, one panel, and a help line.
- **Tabs:** `● The idea` and `○ Showing it`, ending in `Submit`. The mark is answered or open, as the terminal prints it, and the tab you are reading takes the lit face.
- **Options:** a numbered list. The option under the cursor is marked with `>` in a 1ch column; the chosen option takes the lit face.
- **Recommended:** the word `recommended` in mute mono beside the label, never a fill.
- **Reserved options:** `Out of scope` closes the question, and `Your own answer` opens a well with a text field and a write control. An empty answer is refused with a red outline and focus moved to the field.
- **Submit tab:** one line per question, `The idea: 1. Real pieces of the product`, or `The idea: not answered` in amber.
- **Caption:** the sentence below the panel, in Quiet Ink.

### Command well

- **Shape:** well fill, strong hairline, the command in mono, and the copy control separated by a hairline.
- **Hover and copied:** the control takes the lit face; a drawn tick replaces the copy glyph and the label swaps inside a polite live region, returning to rest after 2.2 seconds.
- **Fallback:** a denied clipboard selects the command text instead of changing the label. The control never fails silently.

### Outcomes

- **Shape:** three columns, each opening on a strong hairline, with the verdict word coloured by its own state and the sentence below it in Quiet Ink.
- **Output:** the real string the tool returns, in a well, one printed line per row.
- **Steer:** no output, because a steer is a message the user never sees.

### Example lines

- **Shape:** the added line in mono, the verdict in its colour, and the rule name in mute mono.

### Language marks

- **Shape:** the mark of a language in a single ink, drawn at the size of the text it sits beside.
- **Meaning:** it identifies the language and nothing more. The name stays as text, and the mark is hidden from assistive technology.
- **Source:** the `simple-icons` set, which draws every mark with `currentColor`, so the ink comes from the page and not from the brand.

### Capture

- **Shape:** a well-black frame with a strong hairline. The recording is never tinted.

## Motion

There is no entrance animation and no scroll reveal. Motion exists in two places
only: the panel a click opens, and the highlight a click or a key press moves.
Smooth scrolling for in-page links is switched off under
`prefers-reduced-motion: reduce`.

## Do's and Don'ts

### Do:

- **Do** make every device on the page something the tool really produces, and delete anything that only looks like it.
- **Do** keep one text family for reading and one mono for the machine's own strings.
- **Do** let colour name a verdict: `Blocked`, `Flagged`, `not answered`.
- **Do** keep one lit face per group, and keep it on the thing the reader selected.
- **Do** reproduce the printed rows with `ch` units so the terminal's columns survive the page.
- **Do** open a section with a strong hairline and more space above the heading than below it.
- **Do** draw a language mark in the page's ink: the shape identifies the language, and the ink keeps the page quiet.

### Don't:

- **Don't** invent chrome: no figure plates, key letters, numbered squares, lenses or silkscreen labels.
- **Don't** set a sentence in uppercase with wide tracking, and don't put a label above a heading.
- **Don't** write prose in the mono face.
- **Don't** use red or amber outside a verdict: not on a heading, not as a border, not as a tint.
- **Don't** add a shadow, an inset shadow, or a radius to a box the page draws.
- **Don't** add a scroll reveal or an entrance animation.
- **Don't** turn a section into a card: sections are separated by hairlines, and only the two real interfaces get a fill.
- **Don't** paint a brand mark in its brand colours, and don't let a mark stand in for the name of the language.
