---
name: sideroom-guidelines
description: "Apply Sideroom's mandatory coding workflow before implementing, refactoring, or fixing Java, Laravel/PHP, TypeScript/TSX, Python, Go, or Rust code. Load this skill and the exact language guide before mutation. Do not use for unrelated prose or domain-only discussions."
license: MIT
metadata:
  author: RMRdeveloper
  version: "1.0"
---

# Sideroom guidelines

## Activation Contract

Load this whole skill with `read`, without `offset` or `limit`, before the first `write` or `edit` in each agent run. Use the absolute skill path shown in Available Skills. For each supported target language, also fully load its exact guide from `references/languages/`.

## Hard Rules

- Treat every rule in the loaded language guide as mandatory for changed code.
- Do not write or edit until exact full-file reads of the required packaged paths succeed; partial reads and same-named files do not count.
- Do not bypass the gate with Bash, a subprocess, or another mutation tool.
- Do not load language guides unrelated to files being changed.
- Fail fast, keep control flow flat, and validate once at the boundary.

## Decision Gates

| Path | Read |
| ------ | ------ |
| `.java` | `references/languages/java.md` |
| `.php` | `references/languages/php-laravel.md` |
| `.ts` `.tsx` | `references/languages/typescript.md` |
| `.py` | `references/languages/python.md` |
| `.go` | `references/languages/go.md` |
| `.rs` | `references/languages/rust.md` |
| other | shared table only |

## Execution Steps

1. Read this complete file from its packaged path before any mutation.
2. Fully read the matching packaged language guide, if the target has a supported extension.
3. Implement the smallest change that satisfies the current requirement.
4. Review every changed unit against the loaded guide.
5. Run the relevant formatter, linter, type checks, and tests before finishing.

## Do / Don't

| Do | Don't |
| --- | --- |
| Braces around every `if` body (Python: a full indented suite) | Unbraced or one-line conditional bodies |
| Early return on bad input | Pyramid `if/else` nesting |
| Explicit error, fail now | Fallbacks that hide the real failure |
| One responsibility per unit | Validate + transform + persist + notify together |
| Extract when duplication repeats | Abstract before a second real use |
| Simplest solution for the current problem | Layers, hooks, or config "just in case" |
| Build only what is needed today | Fields or branches for a future case |
| Compose small focused units | Deep inheritance for unrelated behavior |
| Talk only to immediate collaborators | Reach through another object's internals |
| A function either does or returns, not both | Side effects inside a getter |
| Validate once at the edge | Re-check the same invariant inward |
| One validator per input | Two validators for the same body/query |
| Let errors surface with context | Empty `catch` or catch-and-continue |
| Return new values instead of mutating input | Mutate parameters |
| One meaning per null/undefined | Overload null for several business states |
| Inject dependencies | Hardcode infra that blocks tests |
| Inner layers depend on nothing outward | Domain imports of DB/HTTP/framework types |
| Names that reveal role or domain meaning | `data`, `info`, `temp`, `result`, `obj` |
| Named const/enum/contract for domain literals | Magic strings |
| Depend on ports where variation is real | Couple a use case to a concrete implementation |
| Comments only for non-obvious intent | Narration, noise, or stale TODOs |

## Output Contract

Changed code follows every applicable rule in the loaded complete guide. The final response names the validation run and any check that could not run. No extra files, layers, comments, or bypass mutations unless the requirement needs them.

## References

- `references/languages/java.md`
- `references/languages/php-laravel.md`
- `references/languages/typescript.md`
- `references/languages/python.md`
- `references/languages/go.md`
- `references/languages/rust.md`
