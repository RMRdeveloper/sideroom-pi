# Rust

Delta only. Keep the shared table.

- Prefer `Result` and `?`. Do not `.unwrap()` / `.expect()` in library or production paths.
- Let errors surface with context (`map_err`, `anyhow`, or an equivalent). Do not swallow with `let _ =`.
- Do not mutate the caller's value when returning a new one is enough.

```rust
// Bad
fn load_user(id: &str) -> User {
    repo.get(id).unwrap()
}

// Good
fn load_user(id: &str) -> Result<User, LoadUserError> {
    repo.get(id).map_err(|err| LoadUserError::from_repo(id, err))
}
```
