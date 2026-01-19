---
status: ACTIVE
last_updated: 2026-01-19
---

# Performance Baseline (Template)

Fill after running baseline/stress/soak against a prod-like env.

## Summary
- Max sustained RPS (steady): _____
- Saturation point (RPS): _____
- p50/p95/p99 (80% of saturation steady): __ / __ / __ ms
- Error rate (steady): __ %
- CPU / Memory (steady): __% / __ GB
- DB saturation (connections/waits/locks): _____

## Commands
```bash
BASE_URL=https://<env> k6 run tests/k6/baseline.js
BASE_URL=https://<env> k6 run tests/k6/stress.js
BASE_URL=https://<env> k6 run tests/k6/soak.js
```
