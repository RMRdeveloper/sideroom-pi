# Coding Guidelines

Rules every change in this repo must follow. Ordered by how often they're violated and how cheap they are to check — mechanical rules first, judgment calls last.

**Adapting this template to a new language:** keep `RULE` and `WHY` text as-is unless the language genuinely doesn't support the concept (e.g. Python has no braces — see rule 1). Swap the code fence language tag and rewrite the bad/good snippet idiomatically. Do not add prose. Do not merge two rules into one section.

## Index

| # | Rule | Tier |
|---|------|------|
| 1 | [Braced conditionals](#1-braced-conditionals) | mechanical |
| 2 | [No magic strings](#2-no-magic-strings) | mechanical |
| 3 | [Guard clauses](#3-guard-clauses) | structural |
| 4 | [Fail fast](#4-fail-fast) | structural |
| 5 | [Explicit error handling](#5-explicit-error-handling) | structural |
| 6 | [Clear names](#6-clear-names) | structural |
| 7 | [Command Query Separation](#7-command-query-separation-cqs) | structural |
| 8 | [Null/undefined handling](#8-nullundefined-handling) | structural |
| 9 | [Immutability by default](#9-immutability-by-default) | structural |
| 10 | [Validate once](#10-validate-once) | structural |
| 11 | [Single Responsibility](#11-single-responsibility-srp) | architectural |
| 12 | [DRY (real duplication only)](#12-dry-real-duplication-only) | architectural |
| 13 | [KISS](#13-kiss) | architectural |
| 14 | [YAGNI](#14-yagni) | architectural |
| 15 | [Law of Demeter](#15-law-of-demeter) | architectural |
| 16 | [Composition over inheritance](#16-composition-over-inheritance) | architectural |
| 17 | [Dependency direction](#17-dependency-direction) | architectural |
| 18 | [Testability](#18-testability-as-a-design-constraint) | architectural |
| 19 | [Comments](#19-comments) | architectural |

---

### 1. Braced conditionals
RULE: Every `if`/`else` body uses braces, even a one-line guard. Never bind a statement to a conditional by indentation alone. (Python: no braces exist — use a full indented suite, never a one-liner.)
```js
// bad
if (!user) return 0;
// good
if (!user) {
  return 0;
}
```

### 2. No magic strings
RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning (a single log label) may stay inline.
```js
// bad
if (order.status === 'pending_payment') { /* ... */ }
// good
const ORDER_STATUS = { PENDING_PAYMENT: 'pending_payment' };
if (order.status === ORDER_STATUS.PENDING_PAYMENT) { /* ... */ }
```

### 3. Guard clauses
RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.
```js
// bad
function getDiscount(user) {
  if (user) {
    if (user.isActive) { return user.hasSubscription ? 0.2 : 0; }
  }
  return 0;
}
// good
function getDiscount(user) {
  if (!user || !user.isActive || !user.hasSubscription) {
    return 0;
  }
  return 0.2;
}
```

### 4. Fail fast
RULE: Invalid input, impossible state, or a broken dependency throws immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).
```js
// bad
const zone = ZONES[order.zoneId] || ZONES.default; // hides a bad zoneId
// good
const zone = ZONES[order.zoneId];
if (!zone) {
  throw new Error(`Unknown zoneId: ${order.zoneId}`);
}
```

### 5. Explicit error handling
RULE: Never swallow an error in an empty or generic `catch`. Re-throw with context, or let it propagate.
```js
// bad
async function loadUser(id) {
  try { return await api.getUser(id); }
  catch (e) { return null; } // caller has no idea it failed
}
// good
async function loadUser(id) {
  try { return await api.getUser(id); }
  catch (e) { throw new Error(`Failed to load user ${id}: ${e.message}`, { cause: e }); }
}
```

### 6. Clear names
RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.
```js
// bad
function process(data) { return data.filter((x) => x.val > 0); }
// good
function getActiveSubscriptions(subscriptions) {
  return subscriptions.filter((subscription) => subscription.remainingDays > 0);
}
```

### 7. Command Query Separation (CQS)
RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.
```js
// bad
function getNextId(counter) { counter.value++; return counter.value; }
// good
function peekNextId(counter) { return counter.value + 1; }
function incrementCounter(counter) { counter.value++; }
```

### 8. Null/undefined handling
RULE: Pick one convention (e.g. `undefined` = not set, `null` = explicitly empty) and never mix them for the same meaning. Never overload null to mean several business states — give each state its own explicit value.
```js
// bad — null means three different things
if (!user) return null;
if (!user.plan) return null;
if (user.plan.discount === 0) return null; // legit zero, but looks like "no discount"
// good — zero is a real value
function getDiscount(user) {
  if (!user || !user.plan) return 0;
  return user.plan.discount;
}
```

### 9. Immutability by default
RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.
```js
// bad
function addItem(cart, item) { cart.items.push(item); return cart; }
// good
function addItem(cart, item) { return { ...cart, items: [...cart.items, item] }; }
```

### 10. Validate once
RULE: Validate at the boundary that owns the input (schema, FormRequest, DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule in a helper, use case, or adapter further in.
```php
// bad — Service re-checks what the FormRequest already validated
class ProfileService {
    public function update(array $data) {
        if (empty($data['email'])) { throw new \InvalidArgumentException('email required'); }
        $this->user->update($data);
    }
}
// good — Service trusts the already-validated input
class ProfileService {
    public function update(array $validated) { $this->user->update($validated); }
}
```

### 11. Single Responsibility (SRP)
RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.
```js
// bad
async function saveUser(data) {
  if (!data.email) throw new Error('email required');
  const normalized = { ...data, email: data.email.trim().toLowerCase() };
  await db.users.insert(normalized);
  await mailer.send(normalized.email, 'welcome');
}
// good
function validateUser(data) { if (!data.email) throw new Error('email required'); }
function normalizeUser(data) { return { ...data, email: data.email.trim().toLowerCase() }; }
async function createUser(data) {
  validateUser(data);
  const user = normalizeUser(data);
  await db.users.insert(user);
  await notifyWelcome(user.email);
  return user;
}
```

### 12. DRY (real duplication only)
RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, and do not extract look-alike code that belongs to different concepts (a user's email validation vs a vendor's) — they will diverge.
```ts
// bad — extracted after one real use
function formatName(x: string) { return x.trim().toUpperCase(); }
// good — same domain concept, 3rd occurrence confirms the pattern
function normalizeTicketStatus(status: string): TicketStatus { /* ... */ }
```

### 13. KISS
RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."
```js
// bad
function formatPrice(value, { currency = 'USD', locale = 'en-US', showSymbol = true } = {}) { /* ... */ }
// good
function formatPrice(value) { return `$${value.toFixed(2)}`; }
```

### 14. YAGNI
RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (Differs from KISS: KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)
```js
// bad
function createInvoice(order, { supportsRecurring = false, supportsMultiCurrency = false } = {}) { /* ... */ }
// good
function createInvoice(order) { return { total: order.total, items: order.items }; }
```

### 15. Law of Demeter
RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.
```js
// bad
function getCityName(user) { return user.address.city.name; }
// good
function getCityName(user) { return user.getCityName(); }
```

### 16. Composition over inheritance
RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subclass.
```js
// bad
class Animal { makeSound() {} fly() {} }
class Dog extends Animal { makeSound() { return 'Woof'; } /* stuck with fly() */ }
// good
const canBark = { makeSound: () => 'Woof' };
const canFly = { fly: () => 'Flying' };
const dog = { ...canBark };
const bird = { ...canBark, ...canFly };
```

### 17. Dependency direction
RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.
```js
// bad
import { MysqlConnection } from '../infra/mysql';
function calculateInvoiceTotal(invoiceId) {
  const invoice = new MysqlConnection().query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}
// good
function calculateInvoiceTotal(invoice) {
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}
```

### 18. Testability as a design constraint
RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.
```js
// bad
function isSubscriptionExpired(subscription) { return subscription.expiresAt < new Date(); }
// good
function isSubscriptionExpired(subscription, now = new Date()) { return subscription.expiresAt < now; }
```

### 19. Comments
RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.
```ts
// bad
// increment the counter by 1
counter++;
// good
// We poll instead of using a webhook because the provider doesn't guarantee
// single delivery; downstream dedupe would cost more than polling.
setInterval(checkPaymentStatus, 5000);
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 (mechanical) should be backed by a linter/formatter in the target language, not left to this document alone — text-only compliance from an agent caps out well below what a lint rule enforces. Rules 3–10 (structural) are catchable by targeted lint rules or code review checklists in most languages. Rules 11–19 (architectural) require judgment and stay as review guidance.
