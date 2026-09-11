# `sideroom_rules`

Mechanical enforcement of the coding guidelines on the lines a `write` or `edit`
adds. No files are written and no project config is read — the catalog ships
with the package.

## Scope

Only **added lines** are checked:

- For `edit`, each `oldText → newText` pair.
- For `write`, the new content diffed against the existing file (or all lines
  for a new file).

`addedLines()` trims each line and subtracts a multiset of the previous lines,
so reordered or reformatted existing lines are not re-flagged.

## Rules

| Rule id | Severity | Detects |
| --- | --- | --- |
| `braced-conditionals` | block | `if`/`else if`/`for`/`while` without a braced body; Python one-line suites. |
| `explicit-error-handling` | block | Empty catches, `return null/undefined` catches, Python `except: pass`. |
| `clear-names` | warn | Declarations, assignments, or parameters named `data`, `info`, `temp`, `tmp`, `result`, `obj`, `val`, `x`. |
| `comments` | warn | `TODO`/`FIXME`/`XXX`/`HACK`, commented-out code, code-like comments. |
| `debug-artifacts` | warn | `console.log`/`debug`, `debugger`, `print(`, `var_dump`, `dd`, `dump`, `dbg!`. |

Language is inferred from the path (`languageForPath`). Python replaces the
braces check with an indented-suite rule and its own error handling; `generic`
skips structural checks.

## Outcome

- **Blocking violations** reject the call with `{ block: true, reason }`
  containing the rule id, the reason, and the fix.
- **Warnings** are appended to the successful tool result via `formatWarnings`.
- A blocked call is returned by `formatBlockReason`.

## Circuit breaker

A guard must not dead-lock an agent that keeps tripping the same rule:

- Each block increments a per-rule fire count.
- At `BLOCK_DEGRADE_AFTER = 3` fires a rule degrades to a warning.
- `CLEAN_RESET_AFTER = 5` clean checks clear all counters.
- State also resets on a real user prompt (`input` from `interactive`/`rpc`) and
  on `session_compact`.

## Files

| File | Role |
| --- | --- |
| `extensions/rules/index.ts` | Creates state, registers the guard, resets on input/compaction. |
| `extensions/rules/catalog.ts` | Rule ids, severities, language detection. |
| `extensions/rules/checks.ts` | Added-line detectors. |
| `extensions/rules/model.ts` | Added-line diffing and result formatting. |
| `extensions/rules/guard.ts` | Evaluation, blocking, warnings, and the circuit breaker. |

## Tests

`model.test.ts` covers diffing and formatting. `index.test.ts` covers blocking,
warnings, degradation, and reset.
