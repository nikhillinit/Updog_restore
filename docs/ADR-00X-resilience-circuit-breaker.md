---
status: ACTIVE
last_updated: 2026-01-19
---

# ADR-00X: Application-Level Circuit Breaker & Resilience Program

## Status
Accepted

## Context
Key dependencies (cache, HTTP partners, read replicas) can fail or degrade. We need graceful
degradation and guardrails to keep p95 latency ≤ 400 ms under normal load while preventing
cascading failures.

## Decision
Introduce an application-level Circuit Breaker with:
- **Serialized transitions** (mutex-protected), **N-successes to close**
- **Exponential backoff with jitter** from OPEN → HALF_OPEN
- **Timeout-bounded operations** and **fallbacks**
- Optional **adaptive thresholds**
- **Observability-first**: metrics, logs, traces, admin endpoints, readiness checks
- **Progressive delivery**: flags, shadow mode, canaries, rollback runbook

## Consequences
+ Faster recovery and safer failure handling
+ Clear operating signals for on-call
− Slight code complexity; small overhead from instrumentation

## Alternatives Considered
Infra-only breakers (Envoy/NGINX) — still valuable but lack business-aware fallbacks.
Retries alone — risk amplifying load on unhealthy services.

## Links
- `docs/SLO.md`
- `server/infra/circuit-breaker/CircuitBreaker.ts`
- `perf/k6-regression-guard.js`
