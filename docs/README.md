# Sideroom Pi documentation

Maintainable documentation for the Sideroom Pi package. Start here.

## Contents

| Document | Covers |
| --- | --- |
| [architecture.md](./architecture.md) | How the package loads in Pi, the lifecycle events each extension uses, session persistence, widget ordering, steering, and quality gates. |
| [extensions/ask.md](./extensions/ask.md) | `sideroom_ask` questionnaire contract and TUI. |
| [extensions/todo.md](./extensions/todo.md) | `sideroom_todo` work board, persistence, and skip prevention. |
| [extensions/modified-files.md](./extensions/modified-files.md) | Session edited-file tracking, compact widget, and `F8` overlay. |
| [extensions/guidelines.md](./extensions/guidelines.md) | Pre-edit read gate and the packaged coding skill. |
| [extensions/rules.md](./extensions/rules.md) | Added-line rule checks, blocking, warnings, and the circuit breaker. |
| [extensions/done.md](./extensions/done.md) | Check-command detection and the green-before-finish steer. |

## Design contracts (historical)

These two documents predate the implementation and are kept as the maintenance
contracts they describe. They are more granular than the reference above.

- [modified-files-plan.md](./modified-files-plan.md)
- [sideroom-todo-plan.md](./sideroom-todo-plan.md)

## Related top-level documents

- [`README.md`](../README.md) — product overview and install instructions.
- [`AGENTS.md`](../AGENTS.md) — source of truth for tools, paths, and commands.
- [`CONTEXT.md`](../CONTEXT.md) — domain glossary.
- [`CHANGELOG.md`](../CHANGELOG.md) — released changes.
