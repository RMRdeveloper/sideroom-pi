# `sideroom_ask`

Ask the user one to four questions in one batch, each with a recommended
option. The answer set drives requirement clarification, preferences, and
decision confirmation.

## Contract

- One call is one questionnaire batch of **1–4 questions**.
- Each question has an `id`, a `prompt`, **2–4** `{ value, label }` options, and
  a `recommendationIndex` into those options.
- `label` (the tab label) is at most **16** characters; each option `label` is at
  most **60**. Inputs over a limit are rejected with a specific error, never
  truncated.
- `id`s must be unique within the batch.
- Question `label` is optional; it defaults to `Q1`, `Q2`, and so on.

The UI always appends two rows the caller must **not** send:

- **Out of scope** — closes that thread.
- **Write a custom answer** — a free-text editor.

## Non-interactive behavior

`ask` is TUI-only. In print, JSON, or RPC mode it returns
`Error: UI not available (running in non-interactive mode)` instead of hanging.

## TUI behavior

- **One question:** a flat option list.
- **Multiple questions:** a tab per question plus a final **Submit** tab.
- The recommended option is marked and initially focused, but the user must
  still choose.
- `↑`/`↓` or a digit select; `Enter` confirms. `Tab`/`→` and
  `Shift+Tab`/`←` move between tabs. `Esc` cancels the whole batch.
- Selecting the custom answer opens an editor; empty input returns to the list.
- Submit is enabled only when every question is answered.

## Result

The tool returns a text summary and structured `details`:

```ts
interface AskResult {
  readonly questions: readonly AskQuestion[];
  readonly answers: readonly AskAnswer[];
  readonly cancelled: boolean;
}
```

`formatAnswerLines()` renders one line per answer (`user selected`,
`user wrote`, or `Out of scope`). When cancelled or unavailable, `details` has
empty `answers` and `cancelled: true`.

## Language

`ASK_PROMPT_GUIDELINES` tells the agent to write prompts, tab labels, and option
copy in the user's language while keeping ids, option values, and tool code in
English. TUI chrome stays English.

## Files

| File | Role |
| --- | --- |
| `extensions/ask/index.ts` | Registers the tool, prompt metadata, and call/result rendering. |
| `extensions/ask/model.ts` | TypeBox schemas, wire-format decoding, parsing, limits, and error messages. |
| `extensions/ask/execute.ts` | Validates, checks the UI mode, runs the UI, and builds the result. |
| `extensions/ask/ui.ts` | The tabbed/list questionnaire component. |

## Tests

`model.test.ts` covers limits, duplicate ids, recommendation range, and
normalization. `execute.test.ts` covers TUI and non-TUI modes. `index.test.ts`
covers registration and rendering.
