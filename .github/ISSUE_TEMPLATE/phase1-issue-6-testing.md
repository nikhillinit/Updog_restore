---
name: 'Phase 1 Issue #6: Testing Framework'
about:
  Comprehensive testing with Excel parity, property-based tests, MSW, and k6
labels: testing, ai-agents, phase-1
milestone: Agent Foundation Phase 1
---

## Summary

Comprehensive testing framework with Excel parity golden fixtures,
property-based tests, MSW mocks, and k6 load scenarios.

**Estimate:** 5 points

## Acceptance Criteria

### Fixtures & Snapshots

- [ ] Conversation fixtures under `tests/agents/fixtures/conversations/*.json`
- [ ] **Golden parity set:** CSV of canonical cash-flows (5-10 scenarios) with
      Excel-computed IRR/TVPI
- [ ] Snapshot tests for Evaluator/Optimizer outputs; strip nondeterministic
      fields
- [ ] CI fails on snapshot drift

### Property-Based Tests

- [ ] Add fast-check to fuzz Evaluator with random valid inputs
- [ ] Assert invariants:
  - TVPI ≥ DPI
  - 0 ≤ reserves allocated ≤ reserves available
  - IRR ∈ [-1, ∞)
  - NAV ≥ 0

### MSW Mocks

- [ ] `msw/handlers/ai-providers.ts` for OpenAI/Claude endpoints
- [ ] Mock responses include realistic token counts, timing
- [ ] Error scenarios: rate limits, timeouts, malformed responses

### k6 Load Test

- [ ] 20 concurrent streams (VUs)
- [ ] **Explicit thresholds:**
  - `ai_stream_ttfb_ms` p95 < 2000ms
  - `ai_stream_duration_ms` p95 < 30000ms
  - `http_req_failed` < 1%
- [ ] Custom metrics emitted

### CI Integration

- [ ] Add to `.github/workflows/ci.yml`
- [ ] Upload failing snapshot diffs as artifacts
- [ ] Fail on Excel parity drift > 1e-6

## Tasks

- [ ] Create canonical cash-flow CSV with Excel IRR/TVPI
- [ ] Add conversation fixtures (reserve-sizing.json, qa-session.json)
- [ ] Add snapshot tests (optimizer-suggestions.test.ts)
- [ ] Add property-based tests with fast-check
- [ ] Expand MSW handlers with error scenarios
- [ ] Add k6 explicit thresholds + custom metrics
- [ ] Wire into CI pipeline with artifact uploads

## Files to Create

- `tests/agents/fixtures/conversations/reserve-sizing.json`
- `tests/agents/fixtures/conversations/qa-session.json`
- `tests/agents/fixtures/golden-cashflows.csv`
- `tests/agents/snapshots/optimizer-suggestions.test.ts`
- `tests/agents/property/evaluator-invariants.test.ts`

## Property-Based Test Example

```typescript
import fc from 'fast-check';

fc.assert(
  fc.property(
    fc.record({
      tvpi: fc.float({ min: 0, max: 10 }),
      dpi: fc.float({ min: 0, max: 10 }),
    }),
    (metrics) => metrics.tvpi >= metrics.dpi
  )
);
```
