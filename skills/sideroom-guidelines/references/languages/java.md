# Java

Delta only. Keep the shared table.

- Braces on every `if` / `else`, including one-line guards.
- Fail fast with a clear exception. Do not hide a missing value behind a silent default.
- Domain code depends on ports, not `new` of infrastructure types.

```java
// Bad
public int shippingCost(Order order) {
    Zone zone = zones.getOrDefault(order.zoneId(), Zone.DEFAULT);
    return zone.baseCost();
}

// Good
public int shippingCost(Order order) {
    Zone zone = zones.get(order.zoneId());
    if (zone == null) {
        throw new IllegalArgumentException("Unknown zoneId: " + order.zoneId());
    }
    return zone.baseCost();
}
```
