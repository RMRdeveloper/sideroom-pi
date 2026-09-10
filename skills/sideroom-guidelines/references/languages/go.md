# Go Coding Guidelines

Rules every Go change must follow.

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

RULE: Go requires braces for every `if`/`else` body. Keep even a one-line guard as a full, formatted block rather than compressing it onto one line.

```go
// bad
if user == nil {
 return 0
}

// good
if user == nil {
 return 0
}
```

### 2. No magic strings

RULE: Name domain/protocol literals once (const, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning (a single log label) may stay inline.

```go
// bad
if order.Status == "pending_payment" {
 charge(order)
}

// good
const PendingPayment OrderStatus = "pending_payment"

if order.Status == PendingPayment {
 charge(order)
}
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```go
// bad
if user != nil {
 if user.Active {
  return 0.2
 }
}
return 0

// good
if user == nil || !user.Active || !user.HasSubscription {
 return 0
}
return 0.2
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency returns an error immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```go
// bad
zone, ok := zones[order.ZoneID]
if !ok {
 zone = zones["default"]
}

// good
zone, ok := zones[order.ZoneID]
if !ok {
 return Zone{}, fmt.Errorf("unknown zone ID: %s", order.ZoneID)
}
```

### 5. Explicit error handling

RULE: Never ignore an error. Return it with context, or let it propagate.

```go
// bad
user, _ := api.GetUser(id)

// good
user, err := api.GetUser(id)
if err != nil {
 return User{}, fmt.Errorf("load user %s: %w", id, err)
}
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```go
// bad
func process(data []Subscription) []Subscription {
 return filter(data, func(x Subscription) bool {
  return x.Days > 0
 })
}

// good
func activeSubscriptions(subscriptions []Subscription) []Subscription {
 return filter(subscriptions, func(subscription Subscription) bool {
  return subscription.RemainingDays > 0
 })
}
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```go
// bad
func nextID(counter *Counter) int {
 counter.Value++
 return counter.Value
}

// good
func peekNextID(counter Counter) int {
 return counter.Value + 1
}

func incrementCounter(counter *Counter) {
 counter.Value++
}
```

### 8. Null/undefined handling

RULE: Give `nil` one meaning for a type and never overload it for several business states. Use explicit values or the `(value, ok)` idiom for distinct states.

```go
// bad
func discount(user *User) *int {
 if user == nil || user.Plan == nil || user.Plan.Discount == 0 {
  return nil
 }
 return &user.Plan.Discount
}

// good
func discount(user *User) int {
 if user == nil || user.Plan == nil {
  return 0
 }
 return user.Plan.Discount
}
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```go
// bad
func addItem(items []Item, item Item) []Item {
 return append(items, item)
}

// good
func addItem(items []Item, item Item) []Item {
 updated := append([]Item(nil), items...)
 return append(updated, item)
}
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (decoder, schema, DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule in a helper, use case, or adapter further in.

```go
// bad
func update(profile ValidatedProfile) error {
 if profile.Email == "" {
  return errors.New("email required")
 }
 return repo.Update(profile)
}

// good
func update(profile ValidatedProfile) error {
 return repo.Update(profile)
}
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```go
// bad
func save(input Input) error {
 validate(input)
 user := normalize(input)
 repo.Save(user)
 return mailer.Welcome(user)
}

// good
func create(input ValidatedInput) (User, error) {
 user := normalize(input)
 return user, repo.Save(user)
}
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, and do not extract look-alike code that belongs to different concepts (a user's email validation vs a vendor's) — they will diverge.

```go
// bad — extracted after one use
func formatName(value string) string {
 return strings.ToUpper(strings.TrimSpace(value))
}

// good — third occurrence confirms one domain concept
func normalizeTicketStatus(status string) TicketStatus {
 return ParseTicketStatus(strings.TrimSpace(status))
}
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```go
// bad
func formatPrice(value float64, options FormatOptions) string {
 return formatter.Format(value, options)
}

// good
func formatPrice(value float64) string {
 return fmt.Sprintf("$%.2f", value)
}
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (Differs from KISS: KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```go
// bad
func createInvoice(order Order, recurring, multiCurrency bool) Invoice {
 return build(order, recurring, multiCurrency)
}

// good
func createInvoice(order Order) Invoice {
 return Invoice{
  Total: order.Total,
  Items: order.Items,
 }
}
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```go
// bad
func cityName(user User) string {
 return user.Address.City.Name
}

// good
func cityName(user User) string {
 return user.CityName()
}
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subtype.

```go
// bad
type Animal interface {
 Sound() string
 Fly()
}

// good
type Dog struct {
 Sound SoundBehavior
}

type Bird struct {
 Sound  SoundBehavior
 Flight FlightBehavior
}
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```go
// bad
func total(id string) Money {
 return mysql.NewInvoiceRepository().Get(id).Total()
}

// good
func total(invoice Invoice) Money {
 return invoice.Total()
}
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```go
// bad
func expired(subscription Subscription) bool {
 return subscription.ExpiresAt.Before(time.Now())
}

// good
func expired(subscription Subscription, now time.Time) bool {
 return subscription.ExpiresAt.Before(now)
}
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```go
// bad
// Increment the counter.
counter++

// good
// Poll because the provider cannot guarantee single webhook delivery.
ticker := time.NewTicker(5 * time.Second)
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by Go formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
