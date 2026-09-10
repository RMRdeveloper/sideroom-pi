# Rust Coding Guidelines

Rules every Rust change must follow.

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

RULE: Rust requires braces for every `if`/`else` body. Keep even a one-line guard as a full, formatted block rather than compressing it onto one line.

```rust
// bad
if user.is_none() { return 0; }
// good
if user.is_none() {
    return 0;
}
```

### 2. No magic strings

RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning may stay inline.

```rust
// bad
if order.status == "pending_payment" { charge(order); }
// good
if order.status == OrderStatus::PendingPayment { charge(order); }
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```rust
// bad
if let Some(user) = user { if user.active { return 20; } } 0
// good
let Some(user) = user else { return 0; }; if !user.active { return 0; } 20
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency returns an error immediately with a clear message. No fallback chains, silent defaults, or production `unwrap`/`expect`.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```rust
// bad
let zone = zones.get(&order.zone_id).unwrap_or(&default_zone);
// good
let zone = zones.get(&order.zone_id).ok_or_else(|| ZoneError::Unknown(order.zone_id.clone()))?;
```

### 5. Explicit error handling

RULE: Never swallow an error. Return it with context using `Result`, or let it propagate with `?`.

```rust
// bad
let user = api.get_user(id).ok();
// good
let user = api.get_user(id).map_err(|error| LoadUserError::new(id, error))?;
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```rust
// bad
fn process(data: &[Subscription]) -> Vec<&Subscription> { data.iter().filter(|x| x.days > 0).collect() }
// good
fn active_subscriptions(subscriptions: &[Subscription]) -> Vec<&Subscription> { subscriptions.iter().filter(|subscription| subscription.remaining_days > 0).collect() }
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```rust
// bad
fn next_id(counter: &mut Counter) -> u64 { counter.value += 1; counter.value }
// good
fn peek_next_id(counter: &Counter) -> u64 { counter.value + 1 }
fn increment_counter(counter: &mut Counter) { counter.value += 1; }
```

### 8. Null/undefined handling

RULE: Use `Option` only for genuine absence and never overload `None` for several business states. Give each state its own enum variant or value.

```rust
// bad
fn discount(user: Option<&User>) -> Option<u8> { user.and_then(|u| u.plan.as_ref()).and_then(|p| (p.discount > 0).then_some(p.discount)) }
// good
fn discount(user: Option<&User>) -> u8 { user.and_then(|u| u.plan.as_ref()).map_or(0, |plan| plan.discount) }
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```rust
// bad
fn add_item(cart: &mut Cart, item: Item) { cart.items.push(item); }
// good
fn add_item(mut cart: Cart, item: Item) -> Cart { cart.items.push(item); cart }
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (deserializer, validated type, DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule further in.

```rust
// bad
fn update(profile: ValidatedProfile, repo: &impl Repo) -> Result<()> { if profile.email.is_empty() { bail!("email required"); } repo.update(profile) }
// good
fn update(profile: ValidatedProfile, repo: &impl Repo) -> Result<()> { repo.update(profile) }
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```rust
// bad
fn save(input: Input) -> Result<()> { validate(&input)?; let user = normalize(input); repo().save(&user)?; mailer().welcome(&user) }
// good
fn create(input: ValidatedInput, repo: &impl Repo) -> Result<User> { let user = normalize(input); repo.save(&user)?; Ok(user) }
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, or extract look-alike code from different concepts.

```rust
// bad — extracted after one use
fn format_name(value: &str) -> String { value.trim().to_uppercase() }
// good — third occurrence confirms one domain concept
fn normalize_ticket_status(status: &str) -> Result<TicketStatus> { status.trim().parse() }
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```rust
// bad
fn format_price(value: f64, options: FormatOptions) -> String { Formatter::new(options).format(value) }
// good
fn format_price(value: f64) -> String { format!("${value:.2}") }
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```rust
// bad
fn create_invoice(order: Order, recurring: bool, multi_currency: bool) -> Invoice { build(order, recurring, multi_currency) }
// good
fn create_invoice(order: Order) -> Invoice { Invoice { total: order.total, items: order.items } }
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```rust
// bad
fn city_name(user: &User) -> &str { &user.address.city.name }
// good
fn city_name(user: &User) -> &str { user.city_name() }
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subtype.

```rust
// bad
trait Animal { fn sound(&self) -> &str; fn fly(&self); }
// good
struct Dog<S: SoundBehavior> { sound: S }
struct Bird<S: SoundBehavior, F: FlightBehavior> { sound: S, flight: F }
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```rust
// bad
fn total(id: InvoiceId) -> Money { MysqlInvoiceRepository::new().get(id).total() }
// good
fn total(invoice: &Invoice) -> Money { invoice.total() }
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```rust
// bad
fn expired(subscription: &Subscription) -> bool { subscription.expires_at < Utc::now() }
// good
fn expired(subscription: &Subscription, now: DateTime<Utc>) -> bool { subscription.expires_at < now }
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```rust
// bad
// Increment the counter.
counter += 1;
// good
// Poll because the provider cannot guarantee single webhook delivery.
schedule_poll(Duration::from_secs(5));
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by Rust formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
