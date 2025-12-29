# Phoenix Workflow Orchestrator

## Overview

Master routing skill for the 9 Phoenix domain skills. Use this skill to
determine which Phoenix specialist skill to activate based on the task type.
Consolidates Phoenix validation, calculation, and reporting workflows.

## Triggers

Activate this skill when you see:
- "phoenix" OR "truth case" OR "validation"
- "waterfall" OR "xirr" OR "fees" OR "carry"
- "capital allocation" OR "exit recycling" OR "reserves"
- "monte carlo" OR "graduation" OR "moic"
- "brand" OR "reporting" OR "Press On Ventures"
- "precision" OR "numeric drift" OR "Decimal.js"

## Phoenix Skill Inventory

| Skill | Phase | Primary Use |
|-------|-------|-------------|
| phoenix-truth-case-orchestrator | 0 | Run suite, triage failures |
| phoenix-precision-guard | 1A | Numeric precision, Decimal.js |
| phoenix-waterfall-ledger-semantics | 1B | Waterfall/carry calculations |
| phoenix-xirr-fees-validator | 1B | XIRR and fee calculations |
| phoenix-capital-exit-investigator | 1A | Capital allocation, recycling |
| phoenix-docs-sync | 1A | JSDoc and docs alignment |
| phoenix-advanced-forecasting | 2 | Monte Carlo, graduation, MOIC |
| phoenix-reserves-optimizer | 2 | Reserve sizing optimization |
| phoenix-brand-reporting | 3 | Brand-consistent UI/reports |

## Decision Tree

```
Phoenix Task
    |
    v
Is this about running truth cases?
    |
    +-- YES --> phoenix-truth-case-orchestrator
    |           Command: /phoenix-truth
    |
    +-- NO --> Continue
    |
Is this about numeric precision or floating-point issues?
    |
    +-- YES --> phoenix-precision-guard
    |           (parseFloat → Decimal.js, tolerance issues)
    |
    +-- NO --> Continue
    |
Is this about waterfall/carry/clawback calculations?
    |
    +-- YES --> phoenix-waterfall-ledger-semantics
    |           Agent: waterfall-specialist
    |
    +-- NO --> Continue
    |
Is this about XIRR or fee calculations?
    |
    +-- YES --> phoenix-xirr-fees-validator
    |           Agent: xirr-fees-validator
    |
    +-- NO --> Continue
    |
Is this about capital allocation or exit recycling?
    |
    +-- YES --> phoenix-capital-exit-investigator
    |           Agent: phoenix-capital-allocation-analyst
    |
    +-- NO --> Continue
    |
Is this about documentation alignment (JSDoc, calculations.md)?
    |
    +-- YES --> phoenix-docs-sync
    |           Agent: phoenix-docs-scribe
    |
    +-- NO --> Continue
    |
Is this about Monte Carlo, graduation modeling, or MOIC?
    |
    +-- YES --> phoenix-advanced-forecasting
    |           Agent: phoenix-probabilistic-engineer
    |           Command: /phoenix-phase2
    |
    +-- NO --> Continue
    |
Is this about reserve sizing or follow-on allocation?
    |
    +-- YES --> phoenix-reserves-optimizer
    |           Agent: phoenix-reserves-optimizer
    |
    +-- NO --> Continue
    |
Is this about UI/reporting/branding?
    |
    +-- YES --> phoenix-brand-reporting
    |           Agent: phoenix-brand-reporting-stylist
    |
    +-- NO --> Use general phoenix-truth-case-orchestrator
```

## Phase-Based Routing

### Phase 0: Foundation Validation
**Goal**: Establish truth case baseline

| Task | Skill | Agent |
|------|-------|-------|
| Run all truth cases | phoenix-truth-case-orchestrator | phoenix-truth-case-runner |
| Triage failures | phoenix-truth-case-orchestrator | phoenix-truth-case-runner |
| Baseline comparison | phoenix-truth-case-orchestrator | - |

### Phase 1A: Precision & Provenance
**Goal**: Fix precision drift, establish provenance

| Task | Skill | Agent |
|------|-------|-------|
| parseFloat → Decimal.js | phoenix-precision-guard | phoenix-precision-guardian |
| Low-confidence modules | phoenix-capital-exit-investigator | phoenix-capital-allocation-analyst |
| JSDoc alignment | phoenix-docs-sync | phoenix-docs-scribe |

### Phase 1B: Semantic Validation
**Goal**: Core calculation correctness

| Task | Skill | Agent |
|------|-------|-------|
| Waterfall tier/ledger | phoenix-waterfall-ledger-semantics | waterfall-specialist |
| XIRR/fees parity | phoenix-xirr-fees-validator | xirr-fees-validator |
| Clawback logic | phoenix-waterfall-ledger-semantics | waterfall-specialist |

### Phase 2: Advanced Forecasting
**Goal**: Probabilistic validation

| Task | Skill | Agent |
|------|-------|-------|
| Monte Carlo | phoenix-advanced-forecasting | phoenix-probabilistic-engineer |
| Graduation modeling | phoenix-advanced-forecasting | phoenix-probabilistic-engineer |
| Reserve optimization | phoenix-reserves-optimizer | phoenix-reserves-optimizer |
| MOIC forecasting | phoenix-advanced-forecasting | phoenix-probabilistic-engineer |

### Phase 3: Brand & Reporting
**Goal**: Consistent presentation

| Task | Skill | Agent |
|------|-------|-------|
| Dashboard layout | phoenix-brand-reporting | phoenix-brand-reporting-stylist |
| Report styling | phoenix-brand-reporting | phoenix-brand-reporting-stylist |
| Press On branding | phoenix-brand-reporting | phoenix-brand-reporting-stylist |

## Command Integration

| Command | Skill Activated | When to Use |
|---------|-----------------|-------------|
| `/phoenix-truth` | phoenix-truth-case-orchestrator | Run deterministic suite |
| `/phoenix-phase2` | phoenix-advanced-forecasting | Probabilistic validation |
| `/phoenix-prob-report` | phoenix-advanced-forecasting | Format MC results |

## Common Workflows

### Truth Case Failure Investigation

```
1. /phoenix-truth (run suite)
    |
    v
2. Classify failures:
   - Precision drift → phoenix-precision-guard
   - Waterfall semantics → phoenix-waterfall-ledger-semantics
   - XIRR/fees parity → phoenix-xirr-fees-validator
   - Allocation issues → phoenix-capital-exit-investigator
    |
    v
3. Fix with specialist skill
    |
    v
4. /phoenix-truth (verify fix)
```

### New Calculation Implementation

```
1. phoenix-truth-case-orchestrator
   (create truth cases FIRST)
    |
    v
2. Implement calculation
    |
    v
3. Run skill for domain:
   - Waterfall → phoenix-waterfall-ledger-semantics
   - XIRR → phoenix-xirr-fees-validator
   - Reserves → phoenix-reserves-optimizer
    |
    v
4. phoenix-docs-sync
   (align documentation)
    |
    v
5. /phoenix-truth (full validation)
```

### Phase Gate Progression

```
Phase 0 Gate: 100% truth cases passing
    ↓
Phase 1A Gate: Precision issues resolved
    ↓
Phase 1B Gate: Core calculations Excel-parity
    ↓
Phase 2 Gate: Monte Carlo validation stable
    ↓
Phase 3: Brand consistency applied
```

## Skill Selection Matrix

| Symptom | Likely Skill | Verification |
|---------|--------------|--------------|
| "1e-7 tolerance failure" | phoenix-precision-guard | Check for parseFloat |
| "Clawback not applied" | phoenix-waterfall-ledger-semantics | Review tier logic |
| "XIRR doesn't match Excel" | phoenix-xirr-fees-validator | Check Newton-Raphson |
| "Missing capital flow" | phoenix-capital-exit-investigator | Trace provenance |
| "MC results unstable" | phoenix-advanced-forecasting | Check seed handling |
| "Chart styling wrong" | phoenix-brand-reporting | Review brand guide |

## Related Documentation

- [PHOENIX-AGENTS.md](.claude/agents/PHOENIX-AGENTS.md) - Agent details
- [execution-plan-v2.34.md](docs/PHOENIX-SOT/execution-plan-v2.34.md) - Current plan
- [docs/notebooklm-sources/](docs/notebooklm-sources/) - Domain truth (85K words)

## Related Skills

- financial-calc-correctness - Excel parity methodology
- statistical-testing - Monte Carlo validation
- systematic-debugging - Root cause analysis
