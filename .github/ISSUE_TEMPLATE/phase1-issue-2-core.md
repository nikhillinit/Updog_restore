---
name: 'Phase 1 Issue #2: TokenManager + CircuitBreaker + DLQ'
about:
  Resilience layer with budgeting, errors, circuit breakers, and idempotent DLQ
labels: enhancement, ai-agents, phase-1, infrastructure
milestone: Agent Foundation Phase 1
---

## Summary

Add resilience layer for AI operations: per-run budgeting, typed errors, circuit
breakers with per-provider state, and Redis-based DLQ with idempotent replay.

**Estimate:** 8 points

## Acceptance Criteria

### TokenManager

- [ ] Per-operation AND per-run budget ceilings configurable
- [ ] `assertWithinBudget()` returns
      `{ allowed: boolean, remainingUsd: number }` for UI display
- [ ] `recordUsage()`, `suggestTruncation()` with PII redaction (no verbatim
      prompts in logs)
- [ ] Prometheus: `ai_token_budget_used_total{operation}`,
      `ai_token_budget_limit`, `ai_token_cost_usd_milliseconds`

### Error Taxonomy

- [ ] `RetryableExternalError`, `NonRetryableInputError`, `BudgetExceededError`,
      `CircuitBreakerOpenError`
- [ ] Errors include context (operation, runId, timestamp) without PII

### CircuitBreaker

- [ ] State machine: CLOSED → OPEN → HALF_OPEN (threshold=5 failures,
      cooldown=60s)
- [ ] Per-provider instances (not global); HALF_OPEN probes = N single-shot
      calls
- [ ] State transitions logged with reason + provider name
- [ ] Prometheus: `ai_circuit_breaker_state{provider}` (0=CLOSED, 1=OPEN,
      2=HALF_OPEN)

### Dead Letter Queue

- [ ] Redis Streams (`ai:dlq`), trim policy ~10k entries, 24h TTL
- [ ] **Idempotent replay:** Jobs include checksum/idempotency key; duplicate
      replays are no-ops
- [ ] **Poison handling:** Jobs with >3 retries auto-move to `ai:dead` stream
      with reason
- [ ] CLI `scripts/ai-dlq-replay.ts` with `--list`, `--stats`, and replay by
      jobId
- [ ] Prometheus: `ai_dlq_enqueued_total`, `ai_dlq_replayed_total`,
      `ai_dlq_poisoned_total`

### Integration Test

- [ ] Force provider failure → DLQ enqueue → verify Redis → replay → success →
      verify idempotency

## Tasks

- [ ] Wire `TokenManager` to Redis for budget persistence
- [ ] Enhance `TokenManager` to return remaining budget
- [ ] Add PII redaction to all logging paths
- [ ] Implement per-provider CircuitBreaker instances
- [ ] Wire `workers/dlq.ts` to actual Redis client
- [ ] Add job checksum/idempotency logic
- [ ] Implement poison message handling
- [ ] Complete `scripts/ai-dlq-replay.ts` with idempotency checks
- [ ] Add tests + operational runbooks

## Files to Create

- `ai/core/__tests__/TokenManager.test.ts`
- `ai/core/__tests__/CircuitBreaker.test.ts`
- `ai/core/__tests__/integration/dlq-replay.test.ts`
- `docs/runbooks/circuit-breaker-ops.md`
- `docs/runbooks/dlq-replay.md`

## Related ADRs

- [ADR-0002: Token Budgeting Strategy](../docs/adr/0002-token-budgeting.md)
