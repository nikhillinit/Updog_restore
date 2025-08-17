# Fail–Open–Close Policy Matrix (Per Route/Dependency)

| Route | Dependency | Policy | Fallback | Data Risk Notes |
|------|------------|--------|----------|-----------------|
| /api/cache-get | Redis | **Fail-OPEN** | In-memory LRU | TTL parity, eventual reconcile |
| /api/partner | Partner HTTP | **Fail-OPEN** | Stale cache snapshot | Mark response `X-Circuit-State` |
| /admin/report | DB RO | **Fail-CLOSED** | HTTP 503 | No stale admin data |

> Each entry must declare: breaker preset, timeouts, retries (<=1), and fallback semantics.
