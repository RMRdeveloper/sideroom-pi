# 0001. Multiple-selection questions in `sideroom_ask`

- **Status:** Accepted
- **Date:** 2026-09-11

## Context

Every `sideroom_ask` question is currently a *single-selection question*: 2–4
options, exactly one `recommendationIndex`, exactly one answer. Some questions
are genuinely plural (which concerns to include, which files to touch), and
forcing them into one answer either loses information or burns a whole question
slot per option.

Pi does not hand us a multi-select control, so the interaction has to be built
from `ctx.ui.custom()`: in `pi-tui` 0.84.4 `SelectList` is single-select,
`SettingsList` cycles per-item values, there is no checkbox component, and no
`tui.select.toggle` keybinding id is published. `ctx.ui.custom()` also returns
`undefined` in RPC mode, so the feature cannot escape the TUI.

The contract is a published tool schema that parent agents already emit, so the
shape we pick is hard to walk back.

## Decision

1. A question declares `selectionMode: "single" | "multiple"`, defaulting to
   `single`. The mode is per question, not per batch.
2. In multiple mode the recommendation field is `recommendedIndices: number[]`
   with at least one entry; `recommendationIndex` stays the single-mode field.
   The schema requires exactly the field that matches the declared mode.
3. Recommended options are highlighted but never pre-checked. The user still
   chooses, as in single mode.
4. At least one selection is required. Out of scope remains the only way to
   decline a multiple-selection question.
5. The answer contract grows additively: `AskAnswer.selections` exists only for
   multiple-selection questions, and `value`/`label`/`index` mirror the first
   selection. Consumers that read only the single-mode fields keep working.
6. Out of scope and the custom answer stay exclusive with selections, matching
   single mode.
7. Selection state is a pure reducer in `extensions/ask/selection.ts`;
   `ui.ts` renders it. `Space` toggles, `Enter` confirms the question, and
   digits toggle instead of confirming.
8. Non-TUI behaviour is unchanged: multiple-selection questions are still
   unavailable outside the TUI.

## Consequences

- The tool schema gains a field and a union of recommendation fields, and its
  validation errors grow a mode-specific message. `docs/extensions/ask.md`,
  `AGENTS.md`, and `docs/architecture.md` must name the new module.
- Agents that only speak single mode are unaffected, and every existing
  single-selection fixture keeps its meaning.
- Two ways to express a recommendation mean the parser must reject the wrong
  field for the mode rather than guessing.
- The UI gains a second interaction model over the same tab/list shell, which
  is why the reducer is extracted and unit-tested instead of living in `ui.ts`.

## Alternatives considered

- **One `recommendationIndex` for both modes** (multi answers are a subset of
  one recommendation). Rejected: it hides the caller's intent and forces an
  arbitrary primary choice.
- **Always-array answers** (`values`, `labels`, `indices` for every mode).
  Rejected: uniform and tempting, but it breaks every existing reader of
  `value`/`index` for a gain nobody asked for.
- **Building multi on `SettingsList` on/off rows.** Rejected: it reads as a
  settings panel, drops the recommended marker and the Out of scope row, and
  makes "at least one" awkward.
- **One `AskAnswer` entry per selected option.** Rejected: it breaks the
  one-answer-per-question invariant and the `id` uniqueness rule.

## References

- `CONTEXT.md` — *Single-selection question*, *Multiple-selection question*,
  *Recommended option*, *Selection*.
- `docs/extensions/ask.md` — the contract this decision amends.
- `docs/tui.md` — `ctx.ui.custom()`, `SelectList`, and keybinding ids.
