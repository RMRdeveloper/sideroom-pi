# Python

Delta only. Keep the shared table.

- Use a complete indented suite for every `if` / `else`. Never a one-line conditional body.
- Treat `None` as "not set" or "explicitly empty" — pick one meaning and keep it. Do not use `None` for a real business state that deserves its own value.
- Prefer returning new collections over mutating a caller's list or dict.

```python
# Bad
def get_discount(user):
    if user: return 0.2 if user.is_active else 0

# Good
def get_discount(user):
    if user is None:
        return 0
    if not user.is_active:
        return 0
    return 0.2
```
