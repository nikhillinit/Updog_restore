---
status: ACTIVE
last_updated: 2026-01-19
---

# Canary & Rings — Success Criteria

- Rings: 10% (N minutes) → 50% (N minutes) → 100%
- Gate conditions (fail deploy on any):
  - z-test p-value < 0.01 on error-rate delta
  - Burn-rate > 14.4× (1h) or > 6× (6h)
  - p95 latency regression > 100 ms sustained for ring duration
- Rollback tuple: git SHA + migration hash + cache flush
