# Python Coding Guidelines

Rules every Python change must follow.

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

RULE: Python has no braces: every `if`/`else` body uses a full indented suite, never a one-line body.

```python
# bad
if user is None: return 0
# good
if user is None:
    return 0
```

### 2. No magic strings

RULE: Name domain/protocol literals once (constant, enum, shared contract) and reuse the name. One-off strings with no reuse and no domain meaning (a single log label) may stay inline.

```python
# bad
if order.status == "pending_payment":
    charge(order)
# good
PENDING_PAYMENT = "pending_payment"
if order.status == PENDING_PAYMENT:
    charge(order)
```

### 3. Guard clauses

RULE: Validate and exit early. Keep the happy path last, at the shallowest indent. No pyramid nesting.

```python
# bad
def get_discount(user):
    if user is not None:
        if user.is_active:
            return 0.2 if user.has_subscription else 0
    return 0
# good
def get_discount(user):
    if user is None or not user.is_active or not user.has_subscription:
        return 0
    return 0.2
```

### 4. Fail fast

RULE: Invalid input, impossible state, or a broken dependency raises immediately with a clear message. No fallback chains or silent defaults.
WHY: This is for invariants that should never happen if upstream contracts hold — not license to re-check business rules a boundary already validated (see rule 10).

```python
# bad
zone = zones.get(order.zone_id, zones["default"])
# good
try:
    zone = zones[order.zone_id]
except KeyError as error:
    raise ValueError(f"Unknown zone_id: {order.zone_id}") from error
```

### 5. Explicit error handling

RULE: Never swallow an error in an empty or generic `except`. Re-raise with context, or let it propagate.

```python
# bad
def load_user(user_id):
    try:
        return api.get_user(user_id)
    except Exception:
        return None
# good
def load_user(user_id):
    try:
        return api.get_user(user_id)
    except ApiError as error:
        raise UserLoadError(f"Failed to load user {user_id}") from error
```

### 6. Clear names

RULE: Names reveal role or domain meaning. No `data`, `info`, `temp`, `result`, `obj`, `val`, `x`. A long honest name beats a short vague one.

```python
# bad
def process(data):
    return [x for x in data if x.val > 0]
# good
def get_active_subscriptions(subscriptions):
    return [subscription for subscription in subscriptions if subscription.remaining_days > 0]
```

### 7. Command Query Separation (CQS)

RULE: A function either does something (side effect) or returns something (query) — never both. A "getter" must never mutate.

```python
# bad
def get_next_id(counter):
    counter.value += 1
    return counter.value
# good
def peek_next_id(counter):
    return counter.value + 1

def increment_counter(counter):
    counter.value += 1
```

### 8. Null/undefined handling

RULE: Give `None` one convention (for example, not set or explicitly empty) and never use it for several meanings. Give each business state its own explicit value.

```python
# bad
def get_discount(user):
    if user is None or user.plan is None or user.plan.discount == 0:
        return None
# good
def get_discount(user):
    if user is None or user.plan is None:
        return 0
    return user.plan.discount
```

### 9. Immutability by default

RULE: Return new values instead of mutating parameters. Never hide a side effect inside what looks like a pure transform.

```python
# bad
def add_item(cart, item):
    cart["items"].append(item)
    return cart
# good
def add_item(cart, item):
    return {**cart, "items": [*cart["items"], item]}
```

### 10. Validate once

RULE: Validate at the boundary that owns the input (schema, request model, DTO). Downstream code trusts that contract — no re-checking the same required/type/range rule in a helper, use case, or adapter further in.

```python
# bad
def update_profile(validated_profile, repository):
    if not validated_profile.email:
        raise ValueError("email required")
    repository.update(validated_profile)
# good
def update_profile(validated_profile, repository):
    repository.update(validated_profile)
```

### 11. Single Responsibility (SRP)

RULE: A function, class, or module has one reason to change. If it validates AND transforms AND persists AND notifies, split it.

```python
# bad
def save_user(payload, repository, mailer):
    if not payload["email"]:
        raise ValueError("email required")
    user = {**payload, "email": payload["email"].strip().lower()}
    repository.insert(user)
    mailer.send(user["email"], "welcome")
# good
def normalize_user(payload):
    return {**payload, "email": payload["email"].strip().lower()}

def create_user(validated_payload, repository):
    user = normalize_user(validated_payload)
    repository.insert(user)
    return user
```

### 12. DRY (real duplication only)

RULE: Extract when at least 2 of 3 hold: (a) the logic appears 3+ times, (b) a future rule change would need to touch all occurrences at once, (c) the copies represent the same domain concept. Do not extract on the first or second occurrence, and do not extract look-alike code that belongs to different concepts (a user's email validation vs a vendor's) — they will diverge.

```python
# bad — extracted after one real use
def format_name(value):
    return value.strip().upper()
# good — same domain concept, third occurrence confirms the pattern
def normalize_ticket_status(status):
    return TicketStatus(status.strip().lower())
```

### 13. KISS

RULE: Ship the simplest solution for the current, real requirement. No configurability, hooks, or layers added "just in case."

```python
# bad
def format_price(value, currency="USD", locale="en-US", show_symbol=True):
    return price_formatter(value, currency, locale, show_symbol)
# good
def format_price(value):
    return f"${value:.2f}"
```

### 14. YAGNI

RULE: Don't add fields, params, or branches for a use case that hasn't arrived. (Differs from KISS: KISS simplifies the chosen solution; YAGNI stops you building the unrequested one.)

```python
# bad
def create_invoice(order, supports_recurring=False, supports_multi_currency=False):
    return build_invoice(order, supports_recurring, supports_multi_currency)
# good
def create_invoice(order):
    return {"total": order.total, "items": order.items}
```

### 15. Law of Demeter

RULE: Talk only to immediate collaborators. Never reach through an object to grab something several levels deep inside its internal structure.

```python
# bad
def get_city_name(user):
    return user.address.city.name
# good
def get_city_name(user):
    return user.get_city_name()
```

### 16. Composition over inheritance

RULE: Compose small, focused behaviors instead of building inheritance chains that force unrelated methods onto every subclass.

```python
# bad
class Animal:
    def fly(self): ...
class Dog(Animal):
    pass
# good
class Bark:
    def make_sound(self):
        return "Woof"
class Dog:
    def __init__(self, sound=Bark()):
        self.sound = sound
```

### 17. Dependency direction

RULE: Inner layers (domain/business logic) never import outer layers (framework, DB, HTTP). Outer layers depend inward, never the reverse.

```python
# bad
def calculate_invoice_total(invoice_id):
    invoice = MysqlInvoiceRepository().get(invoice_id)
    return sum(item.price for item in invoice.items)
# good
def calculate_invoice_total(invoice):
    return sum(item.price for item in invoice.items)
```

### 18. Testability as a design constraint

RULE: Inject dependencies (clock, network, random) instead of hardcoding them. If a function is hard to test, redesign it — don't skip the test.

```python
# bad
def is_subscription_expired(subscription):
    return subscription.expires_at < datetime.now(timezone.utc)
# good
def is_subscription_expired(subscription, now):
    return subscription.expires_at < now
```

### 19. Comments

RULE: Comment only non-obvious intent — a trade-off, a constraint, a hazard names can't carry. Delete narration, restated logic, and stale TODOs. Test: if deleting the comment leaves the code equally clear, delete it.

```python
# bad
# Increment the counter by one.
counter += 1
# good
# Polling avoids duplicate webhook delivery that the provider cannot prevent.
scheduler.every(5).seconds.do(check_payment_status)
```

---

**When in doubt:** fail fast, keep it flat, keep it small.

**Enforcement note:** rules 1–2 are mechanical and should be backed by Python formatting or linting. Rules 3–10 are structural checks. Rules 11–19 require review judgment.
