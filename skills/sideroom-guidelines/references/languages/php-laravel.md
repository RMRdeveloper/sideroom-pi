# PHP / Laravel

Delta only. Keep the shared table.

- Braces on every `if` / `else`.
- `FormRequest` (or one equivalent boundary) is the single validator. Services trust that contract and do not re-check the same rules.
- Keep Eloquent/HTTP types out of domain logic.

```php
// Bad — Service repeats the FormRequest rule
class ProfileService {
    public function update(array $data) {
        if (empty($data['email'])) {
            throw new \InvalidArgumentException('email required');
        }
        $this->user->update($data);
    }
}

// Good — Service trusts validated input
class ProfileService {
    public function update(array $validated) {
        $this->user->update($validated);
    }
}
```
