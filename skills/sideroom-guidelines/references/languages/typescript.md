# TypeScript Coding Guidelines

Rules every TypeScript change must follow.

## Index

| # | Rule | Tier |
| --- | ------ | ------ |
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

RULE: Every `if`/`else` body uses braces, even a one-line guard. Never bind a statement to a conditional by indentation alone.

```ts
// bad
if (!user) return 0;
// good
if (!user) { return 0; }
```

### 2. No magic strings

RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning may stay inline.

```ts
// bad
if (order.status === 'pending_payment') { charge(order); }
// good
const ORDER_STATUS = { PENDING_PAYMENT: 'pending_payment' } as const;
if (order.status === ORDER_STATUS.PENDING_PAYMENT) { charge(order); }
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```ts
// bad
function discount(user?: User): number { if (user) { if (user.active) { return user.subscribed ? .2 : 0; } } return 0; }
// good
function discount(user?: User): number { if (!user || !user.active || !user.subscribed) { return 0; } return .2; }
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency throws immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```ts
// bad
const zone = zones[order.zoneId] ?? zones.default;
// good
const zone = zones[order.zoneId]; if (!zone) { throw new Error(`Unknown zoneId: ${order.zoneId}`); }
```

### 5. Explicit error handling

RULE: Never swallow an error in an empty or generic `catch`. Re-throw with context, or let it propagate.

```ts
// bad
async function loadUser(id: string): Promise<User | null> { try { return await api.getUser(id); } catch { return null; } }
// good
async function loadUser(id: string): Promise<User> { try { return await api.getUser(id); } catch (error) { throw new Error(`Failed to load user ${id}`, { cause: error }); } }
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```ts
// bad
const process = (data: Subscription[]) => data.filter((x) => x.val > 0);
// good
const activeSubscriptions = (subscriptions: Subscription[]) => subscriptions.filter((subscription) => subscription.remainingDays > 0);
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```ts
// bad
function nextId(counter: Counter): number { counter.value++; return counter.value; }
// good
function peekNextId(counter: Counter): number { return counter.value + 1; }
function incrementCounter(counter: Counter): void { counter.value++; }
```

### 8. Null/undefined handling

RULE: Pick one convention (e.g. `undefined` = not set, `null` = explicitly empty) and never mix them for the same meaning. Never overload null to mean several business states — give each state its own explicit value.

```ts
// bad
function discount(user?: User): number | null { return !user?.plan || user.plan.discount === 0 ? null : user.plan.discount; }
// good
function discount(user?: User): number { return user?.plan?.discount ?? 0; }
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```ts
// bad
function addItem(cart: Cart, item: Item): Cart { cart.items.push(item); return cart; }
// good
function addItem(cart: Cart, item: Item): Cart { return { ...cart, items: [...cart.items, item] }; }
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (schema, request DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule further in.

```ts
// bad
function update(profile: ValidatedProfile): void { if (!profile.email) { throw new Error('email required'); } repository.update(profile); }
// good
function update(profile: ValidatedProfile): void { repository.update(profile); }
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```ts
// bad
async function save(input: UserInput): Promise<void> { validate(input); const user = normalize(input); await repository.save(user); await mailer.welcome(user); }
// good
async function create(input: ValidatedUser): Promise<User> { const user = normalize(input); await repository.save(user); return user; }
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, or extract look-alike code from different concepts.

```ts
// bad — extracted after one use
const formatName = (value: string): string => value.trim().toUpperCase();
// good — third occurrence confirms one domain concept
const normalizeTicketStatus = (status: string): TicketStatus => parseTicketStatus(status.trim());
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```ts
// bad
function formatPrice(value: number, options: FormatOptions = defaults): string { return formatter.format(value, options); }
// good
function formatPrice(value: number): string { return `$${value.toFixed(2)}`; }
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```ts
// bad
function createInvoice(order: Order, recurring = false, multiCurrency = false): Invoice { return build(order, recurring, multiCurrency); }
// good
function createInvoice(order: Order): Invoice { return { total: order.total, items: order.items }; }
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```ts
// bad
const cityName = (user: User): string => user.address.city.name;
// good
const cityName = (user: User): string => user.getCityName();
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subclass.

```ts
// bad
abstract class Animal { abstract sound(): string; abstract fly(): void; }
// good
type Dog = { sound: SoundBehavior }; type Bird = { sound: SoundBehavior; flight: FlightBehavior };
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```ts
// bad
function total(id: string): Money { return new MysqlInvoiceRepository().get(id).total; }
// good
function total(invoice: Invoice): Money { return invoice.total; }
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```ts
// bad
const expired = (subscription: Subscription): boolean => subscription.expiresAt < new Date();
// good
const expired = (subscription: Subscription, now: Date): boolean => subscription.expiresAt < now;
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```ts
// bad
// Increment the counter.
counter++;
// good
// Poll because the provider cannot guarantee single webhook delivery.
setInterval(checkPaymentStatus, 5_000);
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by TypeScript formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
