# Go

Delta only. Keep the shared table.

- Braces on every `if`. Keep `err` checks as flat guard clauses; do not nest the happy path.
- Return errors with context. Do not `panic` for expected business failure, and do not ignore `err`.
- Do not mutate slices or maps passed in as input; return a new value.

```go
// Bad
func loadUser(id string) (*User, error) {
    user, err := repo.Get(id)
    if err == nil {
        return user, nil
    }
    return nil, nil
}

// Good
func loadUser(id string) (*User, error) {
    user, err := repo.Get(id)
    if err != nil {
        return nil, fmt.Errorf("load user %s: %w", id, err)
    }
    return user, nil
}
```
