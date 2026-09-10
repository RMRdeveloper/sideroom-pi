# PHP / Laravel Coding Guidelines

Rules every PHP or Laravel change must follow.

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

```php
// bad
if ($user === null) return 0;
// good
if ($user === null) { return 0; }
```

### 2. No magic strings

RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning may stay inline.

```php
// bad
if ($order->status === 'pending_payment') { $this->charge($order); }
// good
if ($order->status === OrderStatus::PendingPayment) { $this->charge($order); }
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```php
// bad
if ($user !== null) { if ($user->isActive()) { return $user->hasSubscription() ? .2 : 0; } } return 0;
// good
if ($user === null || !$user->isActive() || !$user->hasSubscription()) { return 0; } return .2;
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency throws immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```php
// bad
$zone = $zones[$order->zoneId] ?? $zones['default'];
// good
$zone = $zones[$order->zoneId] ?? throw new DomainException("Unknown zoneId: {$order->zoneId}");
```

### 5. Explicit error handling

RULE: Never swallow an error in an empty or generic `catch`. Re-throw with context, or let it propagate.

```php
// bad
try { return $api->getUser($id); } catch (Throwable $error) { return null; }
// good
try { return $api->getUser($id); } catch (ApiException $error) { throw new UserLoadException("Failed to load user {$id}", previous: $error); }
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```php
// bad
function process(array $data): array { return array_filter($data, fn ($x) => $x->val > 0); }
// good
function activeSubscriptions(array $subscriptions): array { return array_filter($subscriptions, fn ($subscription) => $subscription->remainingDays > 0); }
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```php
// bad
function getNextId(Counter $counter): int { return ++$counter->value; }
// good
function peekNextId(Counter $counter): int { return $counter->value + 1; }
function incrementCounter(Counter $counter): void { ++$counter->value; }
```

### 8. Null/undefined handling

RULE: Pick one convention for `null` and never mix meanings. Never overload null to mean several business states — give each state its own explicit value.

```php
// bad
function discount(?User $user): ?int { return (!$user?->plan || $user->plan->discount === 0) ? null : $user->plan->discount; }
// good
function discount(?User $user): int { return $user?->plan?->discount ?? 0; }
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```php
// bad
function addItem(Cart $cart, Item $item): Cart { $cart->items[] = $item; return $cart; }
// good
function addItem(Cart $cart, Item $item): Cart { return $cart->withItems([...$cart->items, $item]); }
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (`FormRequest`, schema, DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule further in.

```php
// bad
function update(array $validated): void { if (empty($validated['email'])) { throw new InvalidArgumentException(); } $this->user->update($validated); }
// good
function update(array $validated): void { $this->user->update($validated); }
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```php
// bad
function save(array $input): void { $this->validate($input); $user = $this->normalize($input); $this->repo->save($user); $this->mailer->welcome($user); }
// good
function create(ValidatedUser $input): User { $user = $this->normalizer->normalize($input); $this->repo->save($user); return $user; }
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, or extract look-alike code from different concepts.

```php
// bad — extracted after one use
function formatName(string $value): string { return strtoupper(trim($value)); }
// good — third occurrence confirms one domain concept
function normalizeTicketStatus(string $status): TicketStatus { return TicketStatus::from(trim($status)); }
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```php
// bad
function formatPrice(float $value, array $options = []): string { return $this->formatter->format($value, $options); }
// good
function formatPrice(float $value): string { return '$'.number_format($value, 2); }
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```php
// bad
function createInvoice(Order $order, bool $recurring = false, bool $multiCurrency = false): Invoice { return $this->build($order, $recurring, $multiCurrency); }
// good
function createInvoice(Order $order): Invoice { return new Invoice($order->total, $order->items); }
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```php
// bad
function cityName(User $user): string { return $user->address->city->name; }
// good
function cityName(User $user): string { return $user->cityName(); }
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subclass.

```php
// bad
abstract class Animal { abstract public function sound(): string; abstract public function fly(): void; }
// good
final class Dog { public function __construct(private SoundBehavior $sound) {} }
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```php
// bad
function total(string $id): Money { return (new EloquentInvoiceRepository())->find($id)->total(); }
// good
function total(Invoice $invoice): Money { return $invoice->total(); }
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```php
// bad
function expired(Subscription $subscription): bool { return $subscription->expiresAt < new DateTimeImmutable(); }
// good
function expired(Subscription $subscription, Clock $clock): bool { return $subscription->expiresAt < $clock->now(); }
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```php
// bad
// Increment the counter.
++$counter;
// good
// Poll because the provider cannot guarantee single webhook delivery.
Schedule::call($checkPaymentStatus)->everyFiveSeconds();
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by PHP/Laravel formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
