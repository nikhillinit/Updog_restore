---
name: 'Phase 1 Issue #1: Evaluator + Optimizer'
about: Evaluator with IRR/TVPI/reserve metrics + Optimizer with Excel parity
labels: enhancement, ai-agents, phase-1
milestone: Agent Foundation Phase 1
---

## Summary

Implement a **deterministic, Excel-parity** Evaluator and Optimizer for fund
modeling scenarios. Metrics align with Construction vs Current flows and
integrate with `DeterministicReserveEngine`.

**Estimate:** 5 points

## Acceptance Criteria

### Core Implementation

- [ ] `ai/eval/types.ts` exports Zod schemas: `EvaluationSchema`,
      `RunRecordSchema`, `OptimizationSuggestionSchema`
- [ ] `ai/eval/Evaluator.ts` computes:
  - `irrDelta`, `tvpiDelta`, `dpiDelta`, `navDelta`
  - `exitMoicOnPlannedReserves` (consistent with reserve engine's ranking
    inputs)
  - `reserveUtilization`, `diversificationScore`
  - `tokenCostUsd`, `ttfbMs`, `latencyMs`, `success`
- [ ] `ai/eval/Optimizer.ts`:
  - Accepts scenario params (allocation %, follow-on policy, graduation priors)
  - Returns constrained suggestions + signed diff for UI preview
  - Includes `rationale[]` (what knob moved, why) and `constraints_applied[]`

### Determinism Contract

- [ ] All evaluations are deterministic: fixed Decimal precision (28 digits,
      ROUND_HALF_UP), seeded RNG (or none), frozen clock (injected), sorted
      inputs, no ambient `Date.now()` or `Math.random()` calls
- [ ] Evaluator accepts injected clock; no ambient time calls in core evaluation
      paths
- [ ] Golden tests pass with identical output across runs (byte-for-byte
      reproducibility)

### Excel/Sheets Parity

- [ ] Given canonical cash-flow fixtures (5-10 quarterly scenarios), Evaluator
      IRR/TVPI equals Excel/Sheets within 1e-6 absolute error
- [ ] Quarterly cash-flow timing convention documented (end-of-quarter)
- [ ] Sign convention: LP view (investments negative, distributions positive)
- [ ] Day-count basis documented (Actual/365 or 30/360)
- [ ] Annualized IRR computed from quarterly XIRR (compounding formula
      documented)
- [ ] Test suite includes Excel parity golden fixtures; CI fails on drift > 1e-6

### Reserve Metric Alignment

- [ ] `exitMoicOnPlannedReserves` metric definition matches
      `DeterministicReserveEngine` ranking logic
- [ ] Evaluator consumes reserve engine output (does not re-implement)
- [ ] Evaluator exposes `exitMoicOnPlannedReserves` consistent with reserve
      engine's ranking inputs

### Testing & Quality

- [ ] Unit tests ≥ 90% coverage
- [ ] Property-based tests (fast-check): fuzz with random valid inputs, assert
      invariants (TVPI ≥ DPI, reserves ≤ total)
- [ ] Golden snapshot locks results given seed + inputs (no nondeterminism)
- [ ] Prometheus counters/histograms under `ai_evaluator_*` with low-cardinality
      labels

## Tasks

- [ ] Create canonical cash-flow fixtures (CSV) with Excel-computed IRR/TVPI
      answers
- [ ] Implement `Evaluator.ts` with injected clock dependency
- [ ] Implement `Optimizer.ts` with rationale + constraints tracking
- [ ] Add
      `ai/eval/__tests__/{Evaluator.test.ts,Optimizer.test.ts,parity.test.ts}`
- [ ] Integrate with `@/core/reserves/DeterministicReserveEngine`
- [ ] Export Prometheus metrics with proper cardinality control
- [ ] Document XIRR/TVPI conventions
- [ ] Add JSDoc to all public methods

## Files to Create

- `ai/eval/Optimizer.ts`
- `ai/eval/__tests__/Evaluator.test.ts`
- `ai/eval/__tests__/Optimizer.test.ts`
- `ai/eval/__tests__/parity.test.ts`
- `ai/eval/fixtures/canonical-cashflows.csv`
- `ai/eval/README.md`

## Metrics

```typescript
ai_evaluator_runs_total{scenario_bucket,success}
ai_evaluator_success_ratio
ai_evaluator_latency_milliseconds{scenario_bucket}
ai_evaluator_token_cost_usd{scenario_bucket}
ai_evaluator_irr_delta{scenario_bucket}
ai_evaluator_tvpi_delta{scenario_bucket}
```

## Related ADRs

- [ADR-0001: Evaluator Metrics](../docs/adr/0001-evaluator-metrics.md)
