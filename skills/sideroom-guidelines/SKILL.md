---
name: sideroom-guidelines
description: "Trigger: write, edit, coding, Java, Laravel, TypeScript, Python, Go, Rust. Apply Sideroom coding principles before changing code."
license: MIT
metadata:
  author: RMRdeveloper
  version: "1.0"
---

# Sideroom guidelines

## Activation Contract

Load this skill before `write` or `edit`. Load at most one file from `references/languages/` for the path being changed.

## Hard Rules

- Follow the Do/Don't table. Language files override syntax and framework idiom only.
- Do not load language files you are not editing this turn.
- Fail fast, keep control flow flat, and validate once at the boundary.

## Decision Gates

| Path | Read |
|------|------|
| `.java` | `references/languages/java.md` |
| `.php` | `references/languages/php-laravel.md` |
| `.ts` `.tsx` | `references/languages/typescript.md` |
| `.py` | `references/languages/python.md` |
| `.go` | `references/languages/go.md` |
| `.rs` | `references/languages/rust.md` |
| other | shared table only |

## Execution Steps

1. Apply the table to the change.
2. Read the matching language file, if any.
3. Ship the smallest change that satisfies the current requirement.

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

Changed code follows the table and the loaded language delta. No extra files, layers, or comments unless the change requires them.

## References

- `references/languages/java.md`
- `references/languages/php-laravel.md`
- `references/languages/typescript.md`
- `references/languages/python.md`
- `references/languages/go.md`
- `references/languages/rust.md`
