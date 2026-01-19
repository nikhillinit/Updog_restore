---
status: ACTIVE
last_updated: 2026-01-19
---

# ADR-0001: Evaluator Metrics for AI Agents

## Status

Accepted (2025-01-15)

## Context

Our fund modeling platform needs an AI agent evaluation system to measure the quality of scenario optimizations, reserve allocations, and portfolio recommendations. We must decide which metrics to track and how to define "success" for an agent-generated suggestion.

### Constraints
- Must align with existing fund performance metrics (IRR, TVPI, DPI, NAV)
- Must integrate with `DeterministicReserveEngine` for reserve calculations
- Must be deterministic (same inputs → same scores) for reproducibility
- Must support both Construction and Current scenario flows

### Stakeholder Goals
- **GPs**: Want confidence that AI suggestions improve fund returns
- **LPs**: Need transparency in how AI-driven decisions are evaluated
- **Engineers**: Need clear, testable metrics for agent quality

## Decision

We will implement a **venture-specific evaluator** with the following core metrics:

### Primary Metrics (Fund Performance)
1. **IRR Delta**: `candidateIRR - baselineIRR`
   - Measures improvement in internal rate of return
   - Baseline = Current scenario; Candidate = Construction scenario with AI optimizations
2. **TVPI Delta**: `candidateTVPI - baselineTVPI`
   - Measures total value to paid-in capital improvement
3. **DPI Delta**: `candidateDPI - baselineDPI`
   - Measures distributions to paid-in capital change
4. **NAV Delta**: `candidateNAV - baselineNAV`
   - Measures net asset value change

### Secondary Metrics (Reserve Quality)
5. **Exit MOIC on Planned Reserves**
   - Directly from `DeterministicReserveEngine.calculateOptimalReserveAllocation()`
   - Industry-standard metric for follow-on investment quality
6. **Reserve Utilization**: `reservesAllocated / reservesAvailable`
   - Ensures AI uses capital efficiently
7. **Diversification Score**: `1 - (1 / portfolioSize)`
   - Simple Herfindahl proxy to avoid over-concentration

### Operational Metrics
8. **Token Cost (USD)**: Total AI API cost
9. **TTFB (ms)**: Time to first byte (responsiveness)
10. **Latency (ms)**: Total processing time

### Success Criteria
An evaluation is marked as "successful" if:
- `irrDelta > 0` OR `tvpiDelta > 0` (any improvement)
- No constraint violations (max concentration, budget limits)
- Completed within timeout (default 30s)

## Consequences

### Positive
- **Domain Alignment**: Metrics match GP/LP language (IRR/TVPI, not generic "quality score")
- **Deterministic**: Same scenario inputs → same evaluation scores (critical for testing)
- **Integration**: Reuses `DeterministicReserveEngine` → no duplication
- **Transparency**: Clear definition of "better" for AI suggestions

### Negative
- **Complexity**: More metrics to track than simpler generic evaluator
- **Benchmark Dependency**: Requires good "baseline" scenario for meaningful deltas
- **Limited Scope**: Focused on fund modeling; not reusable for other domains

### Mitigations
- Start with Construction vs Current as default baseline/candidate pair
- Add caching for baseline calculations to avoid redundant compute
- Document metric definitions in UI tooltips for GP users

## Alternatives Considered

### Alternative 1: Generic Quality Score (0-100)
**Rejected** because:
- Opaque to GPs/LPs ("What does 87/100 mean for my fund?")
- Doesn't leverage existing financial metrics
- Hard to debug ("Why did score drop from 85 to 83?")

### Alternative 2: Only Track IRR
**Rejected** because:
- Too narrow; ignores liquidity (DPI), reserves quality, diversification
- Single metric can be gamed by concentrated bets

### Alternative 3: Use Third-Party Agent Evaluation Framework
**Rejected** because:
- Generic frameworks (LangChain, etc.) don't understand venture finance
- Would still need to map their metrics to IRR/TVPI
- Adds dependency without clear value

## References

- `DeterministicReserveEngine` implementation: [client/src/core/reserves/DeterministicReserveEngine.ts](../../client/src/core/reserves/DeterministicReserveEngine.ts)
- Reserve schemas: [shared/schemas/reserves-schemas.ts](../../shared/schemas/reserves-schemas.ts)
- Tactyc benchmarking (inspiration): Construction vs Current flows
- Industry standard: "Exit MOIC on Planned Reserves" (Correlation Ventures, First Round Capital)

## Related Decisions

- [ADR-0002](0002-token-budgeting.md) - How we control AI costs
- [ADR-0003](0003-streaming-architecture.md) - How we deliver results to UI
