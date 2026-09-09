# TypeScript

Delta only. Keep the shared table.

- Braces on every `if` / `else`, including one-line guards.
- Pick one meaning for `undefined` vs `null` and keep it. Do not use either as a stand-in for a named business state.
- Name domain literals once (`const` / enum / const object). Do not scatter magic strings.

```ts
// Bad
function getDiscount(user?: { plan?: { discount: number } }) {
  if (!user) {
    return null;
  }
  if (!user.plan) {
    return null;
  }
  if (user.plan.discount === 0) {
    return null;
  }
}

// Good
function getDiscount(user: { plan?: { discount: number } } | undefined): number {
  if (user === undefined || user.plan === undefined) {
    return 0;
  }
  return user.plan.discount;
}
```
