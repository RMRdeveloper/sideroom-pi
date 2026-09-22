# `sideroom_persona`

One built-in voice, always active. Its voice rules govern user-facing prose;
the decorative-symbol prohibition also checks artifacts. No files are written
and no project config is read; the persona ships with the package.

## Scope

There are no profiles and nothing to switch. No profile state is persisted and
`appendEntry` is not used. Block and steer counters exist only in memory. The
footer shows the current run's counts, or `persona: direct` while the run is
clean.

## Voice rules

Array order sets how the rules read in the reminder; `plain-language` comes first.

| Rule id | Instruction |
| --- | --- |
| `plain-language` | Plain words: subject and goal before the detail; everyday terms over concept jargon unless the user used them; define a necessary term in one line; explicit without repetition; no tangled chains such as "the registry resolves the provider through the auth resolver". |
| `direct` | Direct and dry. Short sentences. No preamble, no closing summary. |
| `no-filler` | No filler. |
| `no-invented-terms` | Name things as they are. Coin no intermediate term, abbreviation, codename, or technical concept word the user did not ask for. |
| `short-prose` | Default to short prose. Lists or tables only to compare options or list more than three items. |
| `user-language` | Answer in the user's language and variant. |

## Hard prohibitions

| Prohibition id | Scope |
| --- | --- |
| `decorative-symbols` | prose + artifact |
| `flattery-and-filler` | prose |
| `hedging-and-apology` | prose |
| `ai-meta-commentary` | prose |

A prohibition only fires where its scope applies: `findViolations(text, scope)`
skips every prohibition that does not list the scope. The catalog rule text
stays authoritative; the detectors in `checks.ts` are heuristics, so a
prohibition may be stated without being detected. The decorative-symbol
detector targets default emoji presentation, emoji variation selectors, and
explicit check or cross marks. Semantic text symbols used for copyright,
trademark, or registration stay valid.

## Injection

`before_agent_start` appends `PERSONA_REMINDER` to the system prompt, chained
after the other extensions and skipped when the heading is already present.
Because it runs on every user prompt, the reminder comes back after compaction
with no extra hook. The reminder restates the catalog instead of duplicating
it, so catalog edits propagate. It also carries two static Do/Don't example
pairs (`PERSONA_EXAMPLES` in `prompt.ts`): one against tangled technical
chains, one against concept jargon. The pairs are module-level literals with
no per-turn data, so the reminder stays byte-identical across turns and the
provider prompt cache holds; only a package release changes the prefix. The
tool deliberately has no `promptGuidelines`: they repeated the same rules in
another system-prompt section without changing the result.

`sideroom_persona` takes no arguments and returns the full detail: every voice
rule and every prohibition with its enforcement mode. With one voice there is
nothing to select, so the tool has no action parameter.

## Enforcement

- **Artifacts.** `tool_call` inspects only the lines a `write` or `edit` adds.
  For `write`, the shared file-path resolver follows Pi's built-in aliases and
  canonicalizes an existing file before comparing its content. For `edit`, each
  `oldText → newText` pair is compared. `addedLinesMissingFrom` trims each line
  and subtracts a multiset of the previous lines, so pre-existing content is
  never re-flagged. A hit rejects the call with `{ block: true, reason }`;
  after degradation the mutation passes and a steer asks for a corrective edit.
- **Prose.** `message_end` inspects the finished assistant message through
  `assistantMessageText` and sends one corrective steer per violating message.
  Steers pass `{ triggerTurn: true, deliverAs: 'steer' }` so a correction still
  reaches the model when the run is already idle.

### Circuit breaker

- Each block increments a per-prohibition fire count.
- At `BLOCK_DEGRADE_AFTER = 3` fires the prohibition degrades to a steer.
- `CLEAN_RESET_AFTER = 5` clean mutations clear all counters; degraded
  violations do not count as clean.
- Steers stop after `STEER_LIMIT_PER_RUN = 3` per agent run; the counter resets
  on `before_agent_start`.
- The footer shows `blocksThisRun` and `steersThisRun`, and both reset on
  `before_agent_start`.

## Files

| File | Role |
| --- | --- |
| `extensions/persona/index.ts` | Composes the extension, registers the tool and the footer status. |
| `extensions/persona/catalog.ts` | Voice rules, prohibitions, scopes, and packaged paths. |
| `extensions/persona/checks.ts` | Detectors and added-line extraction. |
| `extensions/persona/model.ts` | Tool detail, block reason, steer, and message text. |
| `extensions/persona/execute.ts` | Builds the tool result. |
| `extensions/persona/guard.ts` | Artifact blocking, prose steering, and the circuit breaker. |
| `extensions/shared/file-path.ts` | Pi-compatible path aliases and canonical file identity. |
| `skills/sideroom-persona/SKILL.md` | Complete guide with Do/Don't examples. |

## Tests

`checks.test.ts` covers hits, semantic text symbols, misses, and scope
filtering. `prompt.test.ts` covers the idempotent append, both example pairs,
and the reminder length budget. `model.test.ts` covers the formatters and
message extraction. `index.test.ts` covers blocking, path aliases, degradation,
the steer cap and its `triggerTurn` options, the per-run footer counts, and the
status.
