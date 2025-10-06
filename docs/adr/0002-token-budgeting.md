# ADR-0002: Token Budgeting Strategy

## Status
Accepted (2025-10-06)

## Context
AI costs must be controlled across long-running optimizations and LP-facing explainers. We need a deterministic, enforceable budgeting approach that integrates with Prometheus and gracefully degrades when limits are hit.

## Decision
- Implement a **TokenManager** with:
  - Hard USD/token limits per operation (workflow-level).
  - `assertWithinBudget()` gate before each provider call.
  - `recordUsage()` for post-call accounting and Prometheus export.
  - `suggestTruncation()` to reduce context size when approaching limits.
- Expose Prometheus metrics:
  - `ai_token_budget_used_total{operation}`
  - `ai_token_budget_limit`
  - `ai_token_cost_usd_bucket{operation}` histogram
- On budget exceed:
  - Return a structured **BudgetExceededError** with a user-safe fallback message.
  - Preserve partials if streaming; mark run `incomplete: budget_exceeded`.

## Consequences
- **Pros**: Predictable cost ceilings, better incidence response, operator clarity.
- **Cons**: Occasional truncation may reduce answer richness.
- **Mitigations**: Prefer tool/DB fetches over LLM generation for heavy data; cache baselines.

## Alternatives Considered
- Soft warnings only — rejected (no enforcement).
- Per-request token caps — rejected (workflow-level is the right granularity).

## Related
- [ADR-0001](0001-evaluator-metrics.md) (Evaluator metrics)
- [ADR-0003](0003-streaming-architecture.md) (Streaming)
