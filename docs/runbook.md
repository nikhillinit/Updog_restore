---
status: ACTIVE
last_updated: 2026-01-19
---

# Resilience Runbook

## Symptoms
- Latency spikes, fallback rate rising, breaker OPEN / flapping

## Quick Triage
1) Check dashboards → is dependency down? error rate? time-to-half-open?
2) Inspect logs for `stateChange`, `probeDenied`, `circuitOpen`

## Actions
- Force HALF_OPEN via admin endpoint if upstream is healthy
- If flapping: increase `successesToClose` or loosen HALF_OPEN rate/concurrency caps
- Reduce client retries or increase `operationTimeout` within SLO budgets

## Tuning Presets
See `shared/config/env.circuit.ts` for knobs: `failureThreshold`, `successesToClose`,
`operationTimeout`, `maxHalfOpenRequests`, `halfOpenRateLimit`, `adaptiveThreshold`.

## Rollback
Disable feature flag `CB_<NAME>_ENABLED` and redeploy.
