# Go Coding Guidelines

This is the Go version of `GUIDELINES_TEMPLATE.md`. It preserves the same
principles and example scenarios using idiomatic Go, explicit error returns,
and small composable types. The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Use braces around every `if` body | Write an unbraced conditional body |
| Guard invalid input early | Bury happy paths in nested `if/else` branches |
| Return a precise error now | Substitute a default and hide invalid state |
| Give a function or type one responsibility | Validate, transform, persist, and notify together |
| Extract repeated domain behavior | Add indirection for a one-off helper |
| Build only current behavior | Add speculative flags and configuration |
| Return new values instead of mutating input | Mutate caller-owned slices and maps |
| Validate once at the boundary | Re-validate the same command in every layer |
| Depend on interfaces at real seams | Construct database/HTTP clients in domain code |

## Principles

### Guard clauses

The discount example keeps the happy path shallow.

```go
func GetDiscount(user *User) float64 {
	if user == nil {
		return 0
	}
	if !user.Active {
		return 0
	}
	if !user.HasSubscription {
		return 0
	}
	return 0.2
}
```

### Braced conditionals

Use braces for every `if` and `else` body, including a one-line guard clause.
`gofmt` enforces this; never rely on indentation alone.

### Fail fast

An unknown shipping zone is invalid state, not a reason to use a default.

```go
func ShippingCost(zoneID string, zones map[string]Zone) (int, error) {
	zone, ok := zones[zoneID]
	if !ok {
		return 0, fmt.Errorf("unknown zoneID: %s", zoneID)
	}
	return zone.BaseCost, nil
}
```

### SRP

The user flow separates normalization, repository work, and notification.

```go
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (s *UserService) CreateUser(ctx context.Context, email string) (User, error) {
	if strings.TrimSpace(email) == "" {
		return User{}, errors.New("email required")
	}
	user, err := s.Users.Insert(ctx, NormalizeEmail(email))
	if err != nil {
		return User{}, err
	}
	if err := s.Mailer.Send(ctx, user.Email, "welcome"); err != nil {
		return User{}, err
	}
	return user, nil
}
```

### DRY

Extract the third repeated ticket-status normalization, not a premature helper.

```go
type TicketStatus string

const (
	TicketStatusOpen   TicketStatus = "open"
	TicketStatusClosed TicketStatus = "closed"
)

func NormalizeTicketStatus(value string) (TicketStatus, error) {
	switch TicketStatus(value) {
	case TicketStatusOpen, TicketStatusClosed:
		return TicketStatus(value), nil
	default:
		return "", fmt.Errorf("unknown ticket status: %s", value)
	}
}
```

### KISS

Keep price and invoice examples limited to today's scope.

```go
func FormatPrice(value float64) string { return fmt.Sprintf("$%.2f", value) }
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice requirement that exists today. Do not add currency
strategies, recurring branches, or cache layers without a real requirement.

```go
func CreateInvoice(order Order) Invoice { return Invoice{Total: order.Total, Items: order.Items} }
```

### Composition over inheritance

Go has no inheritance. Compose behavior with struct embedding and interfaces
rather than building a hierarchy with irrelevant methods.

```go
type Barker interface{ Sound() string }

type Dog struct{ Bark Barker }

func (d Dog) MakeSound() string { return d.Bark.Sound() }
```

### Law of Demeter

Ask the user for its city, not its address's city's name.

```go
func CityName(user User) string { return user.CityName() }
```

### Command Query Separation

Peeking and incrementing a counter are separate functions.

```go
func PeekNextID(counter Counter) int { return counter.Value + 1 }
func IncrementCounter(counter *Counter) { counter.Value++ }
```

### Explicit error handling

Wrap errors with context using `%w`; never swallow a failure and return a
zero value as if nothing happened.

```go
func LoadUser(ctx context.Context, api UserAPI, id string) (User, error) {
	user, err := api.GetUser(ctx, id)
	if err != nil {
		return User{}, fmt.Errorf("failed to load user %s: %w", id, err)
	}
	return user, nil
}
```

### Immutability by default

The cart scenario returns a new value with a copied slice.

```go
func AddItem(cart Cart, item Item) Cart {
	items := make([]Item, len(cart.Items)+1)
	copy(items, cart.Items)
	items[len(cart.Items)] = item
	return Cart{Items: items}
}
```

### Nil handling

Use `nil` for absence with one consistent meaning and preserve a zero
discount as a real value.

```go
func GetDiscount(user *User) float64 {
	if user == nil || user.Plan == nil {
		return 0
	}
	return user.Plan.Discount
}
```

### Testability as a design constraint

Inject the clock instead of calling `time.Now` inside domain behavior.

```go
func IsSubscriptionExpired(sub Subscription, now time.Time) bool {
	return sub.ExpiresAt.Before(now)
}
```

### Dependency direction

Invoice calculation receives an invoice rather than a database dependency.

```go
func CalculateInvoiceTotal(invoice Invoice) int {
	total := 0
	for _, item := range invoice.Items {
		total += item.Price
	}
	return total
}
```

### Clear names

Use `activeSubscriptions`, `remainingDays`, and `externalID`, never `data`,
`temp`, or `obj`.

### Comments

Comments explain a delivery trade-off or an idempotency hazard, not a statement
whose name already explains it.

### No magic strings

Name order states once and reuse the constant.

```go
const (
	OrderStatusPendingPayment = "pending_payment"
	OrderStatusPaid           = "paid"
)

if order.Status == OrderStatusPendingPayment {
	payments.Request(order)
}
```

### SOLID

The welcome use case depends on a mailer interface, not SMTP.

```go
type Mailer interface {
	Send(ctx context.Context, email string, template string) error
}

type SendWelcomeEmail struct{ Mailer Mailer }
```

### Validate once

An HTTP/message adapter decodes the payload into a validated command. The
application service trusts it and never repeats the same required, type, and
range checks.

```go
type UpdateProfile struct{ Email string }

func UpdateProfileHandler(cmd UpdateProfile, users UserRepository) error {
	return users.Update(cmd)
}
```

Use one validation contract per body/query. When in doubt: **fail fast, keep it
flat, keep it small.**
