# Java Coding Guidelines

Rules every Java change must follow.

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

```java
// bad
if (user == null) return 0;
// good
if (user == null) {
    return 0;
}
```

### 2. No magic strings

RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning (a single log label) may stay inline.

```java
// bad
if (order.status().equals("pending_payment")) { charge(order); }
// good
if (order.status() == OrderStatus.PENDING_PAYMENT) { charge(order); }
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```java
// bad
if (user != null) { if (user.isActive()) { return user.hasSubscription() ? .2 : 0; } }
return 0;
// good
if (user == null || !user.isActive() || !user.hasSubscription()) { return 0; }
return .2;
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency throws immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```java
// bad
Zone zone = zones.getOrDefault(order.zoneId(), Zone.DEFAULT);
// good
Zone zone = Optional.ofNullable(zones.get(order.zoneId()))
    .orElseThrow(() -> new IllegalArgumentException("Unknown zoneId: " + order.zoneId()));
```

### 5. Explicit error handling

RULE: Never swallow an error in an empty or generic `catch`. Re-throw with context, or let it propagate.

```java
// bad
try { return api.getUser(id); } catch (Exception error) { return null; }
// good
try { return api.getUser(id); }
catch (ApiException error) { throw new UserLoadException("Failed to load user " + id, error); }
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```java
// bad
List<Subscription> process(List<Subscription> data) { return data.stream().filter(x -> x.days() > 0).toList(); }
// good
List<Subscription> activeSubscriptions(List<Subscription> subscriptions) {
    return subscriptions.stream().filter(subscription -> subscription.remainingDays() > 0).toList();
}
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```java
// bad
int getNextId(Counter counter) { counter.increment(); return counter.value(); }
// good
int peekNextId(Counter counter) { return counter.value() + 1; }
void incrementCounter(Counter counter) { counter.increment(); }
```

### 8. Null/undefined handling

RULE: Pick one convention for `null` and never mix meanings. Never overload null to mean several business states — give each state its own explicit value, using `Optional` only for genuine absence.

```java
// bad
Integer discount(User user) { return user == null || user.plan() == null || user.plan().discount() == 0 ? null : user.plan().discount(); }
// good
int discount(User user) { return user == null || user.plan() == null ? 0 : user.plan().discount(); }
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```java
// bad
Cart addItem(Cart cart, Item item) { cart.items().add(item); return cart; }
// good
Cart addItem(Cart cart, Item item) { return cart.withItems(Stream.concat(cart.items().stream(), Stream.of(item)).toList()); }
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (schema, request DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule in a helper, use case, or adapter further in.

```java
// bad
void update(ValidatedProfile profile) { if (profile.email().isBlank()) { throw new IllegalArgumentException(); } repository.update(profile); }
// good
void update(ValidatedProfile profile) { repository.update(profile); }
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```java
// bad
void save(UserInput input) { validate(input); User user = normalize(input); repository.save(user); mailer.welcome(user); }
// good
User create(ValidatedUser input) { User user = normalizer.normalize(input); repository.save(user); return user; }
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, and do not extract look-alike code that belongs to different concepts (a user's email validation vs a vendor's) — they will diverge.

```java
// bad — extracted after one real use
String formatName(String value) { return value.trim().toUpperCase(); }
// good — same domain concept, third occurrence confirms the pattern
TicketStatus normalizeTicketStatus(String status) { return TicketStatus.parse(status.trim()); }
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```java
// bad
String formatPrice(BigDecimal value, Currency currency, Locale locale, boolean symbol) { return configurableFormatter.format(value); }
// good
String formatPrice(BigDecimal value) { return "$" + value.setScale(2); }
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (Differs from KISS: KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```java
// bad
Invoice createInvoice(Order order, boolean recurring, boolean multiCurrency) { return builder.build(order, recurring, multiCurrency); }
// good
Invoice createInvoice(Order order) { return new Invoice(order.total(), order.items()); }
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```java
// bad
String cityName(User user) { return user.address().city().name(); }
// good
String cityName(User user) { return user.cityName(); }
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subclass.

```java
// bad
abstract class Animal { abstract String sound(); abstract void fly(); }
final class Dog extends Animal { public void fly() { throw new UnsupportedOperationException(); } }
// good
final class Dog { private final SoundBehavior sound = new Bark(); }
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```java
// bad
Money total(UUID id) { return new MysqlInvoiceRepository().get(id).total(); }
// good
Money total(Invoice invoice) { return invoice.total(); }
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```java
// bad
boolean expired(Subscription subscription) { return subscription.expiresAt().isBefore(Instant.now()); }
// good
boolean expired(Subscription subscription, Clock clock) { return subscription.expiresAt().isBefore(clock.instant()); }
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```java
// bad
// Increment the counter.
counter.increment();
// good
// Poll because the provider cannot guarantee single webhook delivery.
scheduler.scheduleAtFixedRate(this::checkPaymentStatus, 0, 5, SECONDS);
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by Java formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
