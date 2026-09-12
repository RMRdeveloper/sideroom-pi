# Sideroom Pi documentation

Maintainable documentation for the Sideroom Pi package. Start here.

## Contents

| Document | Covers |
| --- | --- |
| [architecture.md](./architecture.md) | How the package loads in Pi, the lifecycle events each extension uses, session persistence, widget ordering, steering, and quality gates. |
| [extensions/ask.md](./extensions/ask.md) | `sideroom_ask` questionnaire contract and TUI. |
| [extensions/todo.md](./extensions/todo.md) | `sideroom_todo` work board, capped widget, `F9` overlay, persistence, and skip prevention. |
| [extensions/modified-files.md](./extensions/modified-files.md) | Session edited-file tracking, compact widget, and `F8` overlay. |
| [extensions/guidelines.md](./extensions/guidelines.md) | Pre-edit read gate and the packaged coding skill. |
| [extensions/rules.md](./extensions/rules.md) | Added-line rule checks, blocking, warnings, and the circuit breaker. |
| [extensions/done.md](./extensions/done.md) | Check-command detection and the green-before-finish steer. |

## Decisions

Hard choices that passed the ADR gates, kept under `docs/adr/`.

- [adr/0001-ask-multiple-selection-contract.md](./adr/0001-ask-multiple-selection-contract.md) — multiple-selection questions in `sideroom_ask`.
- [adr/0002-capped-board-widget.md](./adr/0002-capped-board-widget.md) — row cap, `F9` overlay, and the uncapped injected board.
- [adr/0003-contribution-and-release-flow.md](./adr/0003-contribution-and-release-flow.md) — `develop` as the integration branch and release-only `main`.

## Related top-level documents

- [`README.md`](../README.md) — product overview and install instructions.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, commands, design rules, and the pull request flow.
- [`AGENTS.md`](../AGENTS.md) — source of truth for tools, paths, and commands.
- [`CONTEXT.md`](../CONTEXT.md) — domain glossary.
- [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) — community standards and enforcement.
- [`SECURITY.md`](../SECURITY.md) — supported versions and private vulnerability reporting.
- [`CHANGELOG.md`](../CHANGELOG.md) — released changes.
