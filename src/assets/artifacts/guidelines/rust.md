# Rust Coding Guidelines

This is the Rust version of `GUIDELINES_TEMPLATE.md`. It preserves the same
principles and example scenarios using idiomatic Rust, explicit `Option` and
`Result` types, ownership-safe values, and small composable traits and types.
The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Use braces around every `if` body | Write an unbraced conditional body |
| Guard invalid input early | Bury happy paths in nested `if/else` branches |
| Return a precise `Err` now | Substitute a default and hide invalid state |
| Give a function or type one responsibility | Validate, transform, persist, and notify together |
| Extract repeated domain behavior | Add indirection for a one-off helper |
| Build only current behavior | Add speculative flags and configuration |
| Return new values instead of mutating input | Mutate caller-owned vectors and maps |
| Validate once at the boundary | Re-validate the same command in every layer |
| Depend on traits at real seams | Construct database/HTTP clients in domain code |

## Principles

### Guard clauses

The discount example keeps the happy path shallow.

```rust
fn get_discount(user: Option<&User>) -> f64 {
    let user = match user {
        Some(user) => user,
        None => {
            return 0.0;
        }
    };
    if !user.is_active {
        return 0.0;
    }
    if !user.has_subscription {
        return 0.0;
    }
    0.2
}
```

### Braced conditionals

Use braces for every `if` and `else` body, including a one-line guard clause.
Rust requires braces and `rustfmt` enforces their shape; never rely on
indentation alone.

### Fail fast

An unknown shipping zone is invalid state, not a reason to use a default.

```rust
fn shipping_cost(zones: &HashMap<String, Zone>, zone_id: &str) -> Result<i32, String> {
    let zone = match zones.get(zone_id) {
        Some(zone) => zone,
        None => {
            return Err(format!("unknown zone_id: {zone_id}"));
        }
    };
    Ok(zone.base_cost)
}
```

### SRP

The user flow separates normalization, repository work, and notification.

```rust
fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

impl UserService {
    fn create_user(&self, email: &str) -> Result<User, String> {
        if email.trim().is_empty() {
            return Err("email required".to_string());
        }
        let user = self.users.insert(normalize_email(email))?;
        self.mailer.send(&user.email, "welcome")?;
        Ok(user)
    }
}
```

### DRY

Extract the third repeated ticket-status normalization, not a premature helper.

```rust
enum TicketStatus {
    Open,
    Closed,
}

fn normalize_ticket_status(value: &str) -> Result<TicketStatus, String> {
    match value {
        "open" => Ok(TicketStatus::Open),
        "closed" => Ok(TicketStatus::Closed),
        _ => Err(format!("unknown ticket status: {value}")),
    }
}
```

### KISS

Keep price and invoice examples limited to today's scope.

```rust
fn format_price(value: f64) -> String {
    format!("${value:.2}")
}
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice requirement that exists today. Do not add currency
strategies, recurring branches, or cache layers without a real requirement.

```rust
fn create_invoice(order: &Order) -> Invoice {
    Invoice {
        total: order.total,
        items: order.items.clone(),
    }
}
```

### Composition over inheritance

Rust has no inheritance. Compose behavior with traits and struct composition
rather than building a hierarchy with irrelevant methods.

```rust
trait Barker {
    fn sound(&self) -> &str;
}

struct Dog<B: Barker> {
    bark: B,
}

impl<B: Barker> Dog<B> {
    fn make_sound(&self) -> &str {
        self.bark.sound()
    }
}
```

### Law of Demeter

Ask the user for its city, not its address's city's name.

```rust
fn city_name(user: &User) -> &str {
    user.city_name()
}
```

### Command Query Separation

Peeking and incrementing a counter are separate functions.

```rust
fn peek_next_id(counter: &Counter) -> u64 {
    counter.value + 1
}

fn increment_counter(counter: &mut Counter) {
    counter.value += 1;
}
```

### Explicit error handling

Add context with `map_err` or `format!` and preserve the cause with `#[from]`
or chaining; never swallow a failure and return a zero value as if nothing
happened.

```rust
fn load_user(api: &dyn UserApi, id: &str) -> Result<User, String> {
    match api.get_user(id) {
        Ok(user) => Ok(user),
        Err(error) => Err(format!("failed to load user {id}: {error}")),
    }
}
```

### Immutability by default

Bindings are immutable unless marked `mut`. The cart scenario returns a new
value with a cloned vector.

```rust
fn add_item(cart: &Cart, item: Item) -> Cart {
    let mut items = cart.items.clone();
    items.push(item);
    Cart { items }
}
```

### Option handling

Use `Option` for absence with one consistent meaning and preserve a zero
discount as a real value.

```rust
fn get_discount(user: Option<&User>) -> f64 {
    match user.and_then(|user| user.plan.as_ref()) {
        Some(plan) => plan.discount,
        None => 0.0,
    }
}
```

### Testability as a design constraint

Inject the clock instead of calling `SystemTime::now` inside domain behavior.

```rust
fn is_subscription_expired(subscription: &Subscription, now: SystemTime) -> bool {
    subscription.expires_at < now
}
```

### Dependency direction

Invoice calculation receives an invoice rather than a database dependency.

```rust
fn calculate_invoice_total(invoice: &Invoice) -> i32 {
    invoice.items.iter().map(|item| item.price).sum()
}
```

### Clear names

Use `active_subscriptions`, `remaining_days`, and `external_id`, never `data`,
`temp`, or `obj`.

### Comments

Comments explain a delivery trade-off or an idempotency hazard, not a statement
whose name already explains it.

### No magic strings

Name order states once and reuse the enum.

```rust
enum OrderStatus {
    PendingPayment,
    Paid,
}

if order.status == OrderStatus::PendingPayment {
    payments.request(&order);
}
```

### SOLID

The welcome use case depends on a mailer trait, not SMTP.

```rust
trait Mailer {
    fn send(&self, email: &str, template: &str) -> Result<(), String>;
}

struct SendWelcomeEmail<M: Mailer> {
    mailer: M,
}
```

### Validate once

An HTTP/message adapter decodes the payload into a validated command. The
application service trusts it and never repeats the same required, type, and
range checks.

```rust
struct UpdateProfile {
    email: String,
}

fn update_profile(command: UpdateProfile, users: &dyn UserRepository) -> Result<(), String> {
    users.update(command)
}
```

Use one validation contract per body/query. When in doubt: **fail fast, keep it
flat, keep it small.**
