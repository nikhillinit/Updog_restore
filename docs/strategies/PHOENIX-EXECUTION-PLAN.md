# Phoenix: Truth-Driven Fund Calculation Rebuild

**Version:** 1.0
**Date:** December 4, 2025
**Status:** ACTIVE - Supersedes all prior Phoenix plans
**Executor:** Solo Developer

---

## Operator's View (Flight Card)

**Use this when tired or context-switching. Full details below.**

### Daily Checklist

```
[ ] Which phase am I in? (0-6)
[ ] What calculation am I validating?
[ ] Do I have the Excel truth case ready?
[ ] Have I exported to JSON?
[ ] What's my AI tier for this calculation?
```

### Quick Reference

| Phase | Focus | Exit Gate |
|-------|-------|-----------|
| 0 | Test infrastructure works | `npm test` passes baseline |
| 1 | POV Fund I thin slice | Single scenario E2E |
| 2 | Capital calls/distributions | 3 scenarios validated |
| 3 | Fee engine (4 bases) | 4 fee basis methods pass |
| 4 | American waterfall | Deal-by-deal carry validated |
| 5 | IRR/MOIC variants | 4 MOIC types + XIRR pass |
| 6 | Integration + shadow | Feature flags live at 100% |

### AI Validation Tiers

| Tier | Calculations | Rule |
|------|-------------|------|
| 1 | NAV, simple sums | 1 AI, must be GREEN |
| 2 | Fees, capital calls | 2 AI, both GREEN |
| 3 | Waterfall, IRR, MOIC | 2-3 AI, unanimous GREEN |

### Verdicts (No Numbers)

- **GREEN**: Matches Excel within threshold
- **YELLOW**: Minor discrepancy, review needed
- **RED**: Fails threshold, do not proceed

### Error Thresholds

| Metric | Threshold |
|--------|-----------|
| MOIC | < 0.1% relative |
| IRR | < 0.01% absolute |
| Fees | < $100 or 0.05% |
| NAV | < $1 or 0.01% |

### Slip Rules

- **Per-phase**: > 3 days slip → reduce scope or re-estimate
- **Cumulative**: > 10 days total → stop, re-baseline, notify stakeholders

---

## 1. Executive Summary

This plan rebuilds financial calculations for a VC fund modeling platform using a **truth-driven validation approach**. Every calculation formula is validated against a single Excel workbook containing auditable truth cases before any code changes are made.

### Core Philosophy

1. **Excel is Truth**: All expected values come from `FundCalculations.xlsx`
2. **Validation Before Code**: Prove correctness before implementation
3. **Vertical-then-Horizontal**: Thin E2E slice first (POV Fund I), then expand
4. **Feature Flags for Safety**: Shadow mode rollout with instant rollback
5. **Solo Developer Optimized**: Multi-AI consensus replaces team review

### Success Criteria

- Zero P0 errors (calculations that would cause GP/LP financial discrepancies)
- All truth cases pass within defined error thresholds
- Feature flags enable gradual rollout (0% → 10% → 50% → 100%)

---

## 2. Reference Scenario: POV Fund I

All calculations validated against a single reference fund:

| Parameter | Value |
|-----------|-------|
| Fund Size | $50M committed |
| Management Fee | 2.0% on committed (Years 1-5), 1.5% on invested (Years 6-10) |
| Carried Interest | 20% (American waterfall, deal-by-deal) |
| Preferred Return | 8% IRR hurdle |
| GP Commitment | 2% ($1M) |
| Fund Term | 10 years + 2 extension |
| Vintage Year | 2024 |

### Portfolio Construction

| Company | Stage | Initial | Follow-on | Exit |
|---------|-------|---------|-----------|------|
| Alpha Corp | Series A | $2M (Q1 2024) | $1M (Q3 2025) | $15M (Q4 2028) |
| Beta Inc | Series B | $3M (Q2 2024) | $2M (Q1 2026) | $8M (Q2 2029) |
| Gamma LLC | Seed | $500K (Q3 2024) | $500K (Q2 2025) | $0 (Write-off Q1 2027) |
| Delta Co | Series A | $2.5M (Q4 2024) | $1.5M (Q3 2026) | $25M (Q4 2030) |

---

## 3. Excel Truth Source

### Workbook Structure

**File:** `docs/truth-cases/FundCalculations.xlsx`

| Tab Name | Contents | JSON Output |
|----------|----------|-------------|
| `CapitalCalls` | Call schedules, LP contributions | `capital-calls.truth-cases.json` |
| `Distributions` | Distribution waterfalls | `distributions.truth-cases.json` |
| `Fees` | All 4 fee basis methods | `fees.truth-cases.json` |
| `Waterfall` | American waterfall scenarios | `waterfall.truth-cases.json` |
| `IRR` | Cash flow series for XIRR | `irr.truth-cases.json` |
| `MOIC` | All 4 MOIC variants | `moic.truth-cases.json` |
| `NAV` | Net Asset Value calculations | `nav.truth-cases.json` |
| `ModelVersion` | Version tags, change log | (metadata only) |

### Version Control

Each Excel version tagged with: `PHX-YYYYMMDD-NN`

**Example:** `PHX-20241204-01`

The `ModelVersion` tab contains:

| Column | Purpose |
|--------|---------|
| Version Tag | `PHX-YYYYMMDD-NN` |
| Date | ISO date |
| Author | Who made changes |
| Change Summary | What changed |
| Tabs Affected | Which tabs modified |

### Truth Case ID Convention

Format: `{category}-{scenario}-{variant}`

**Examples:**
- `fees-committed-year1`
- `waterfall-single-exit-no-hurdle`
- `moic-realized-partial`

### Pipeline Mapping

```
Excel Tab → JSON File → Test File

CapitalCalls    → capital-calls.truth-cases.json    → capital-calls.test.ts
Fees            → fees.truth-cases.json             → fees.test.ts
Waterfall       → waterfall.truth-cases.json        → waterfall.test.ts
IRR             → irr.truth-cases.json              → irr.test.ts
MOIC            → moic.truth-cases.json             → moic.test.ts
```

Each test file imports its JSON and validates implementation against expected values:

```typescript
// Example: fees.test.ts
import truthCases from './fees.truth-cases.json';

describe('Fee Calculations', () => {
  truthCases.forEach(tc => {
    it(`${tc.id}: ${tc.description}`, () => {
      const result = calculateFee(tc.inputs);
      expect(result).toBeCloseTo(tc.expected, tc.precision);
    });
  });
});
```

---

## 4. Calculation Scope

### In Scope

| Category | Calculations |
|----------|--------------|
| **Capital Calls** | LP contributions, GP contributions, call schedules |
| **Distributions** | Proceeds allocation, return of capital, profit distribution |
| **Fees** | Management fees (4 basis methods), organizational expenses |
| **Waterfall** | American (deal-by-deal) carry with clawback |
| **Returns** | XIRR, MOIC (4 variants), DPI, RVPI, TVPI |
| **NAV** | Net Asset Value, unrealized value |

### Out of Scope (Explicit Exclusions)

| Item | Reason |
|------|--------|
| **European Waterfall** | Whole-fund carry not used by POV |
| **SAFEs/Convertibles** | Complex conversion logic deferred to future phase |
| **Cashless GP Commits** | Management fee offset mechanism deferred |
| **Monte Carlo Simulation** | Already documented, validation separate |
| **Multi-currency** | Single currency (USD) for POV Fund I |

### MOIC Variants (4 Types)

| Variant | Formula | When Used |
|---------|---------|-----------|
| **Current MOIC** | (Distributions + NAV) / Called | Standard reporting |
| **Realized MOIC** | Distributions / Called | Actual returns |
| **Target MOIC** | Projected Value / Called | Planning |
| **Exit MOIC on Planned Reserves** | (Realized + Reserve Exits) / Total Called | Reserve strategy |

### Fee Basis Methods (4 Types)

| Method | Description | When Used |
|--------|-------------|-----------|
| **Committed Capital** | Fee on total commitment | Investment period |
| **Net Cumulative Called** | Fee on called minus returned | Post-investment |
| **Cumulative Invested** | Fee on deployed capital | Alternative structure |
| **FMV (Fair Market Value)** | Fee on current portfolio value | Growth funds |

### American Waterfall Structure

```
For each realized investment:
  1. Return of Capital (to all partners pro-rata)
  2. Preferred Return (8% IRR to LPs)
  3. GP Catch-up (until GP has 20% of profits)
  4. Carried Interest (80/20 split thereafter)

Clawback: GP returns excess carry if fund underperforms
GP Commit: Treated as LP for distribution, no carry on own capital
```

---

## 5. Validation Methodology

### Multi-AI Consensus (Solo Developer Adaptation)

Since this is a solo developer build, team review is replaced with AI-assisted validation:

### Tier Definitions

| Tier | Complexity | AI Count | Consensus Rule | Examples |
|------|------------|----------|----------------|----------|
| **Tier 1** | Simple | 1 AI | GREEN required | NAV, simple sums |
| **Tier 2** | Moderate | 2 AI | Both GREEN required | Fees, capital calls |
| **Tier 3** | Complex | 2-3 AI | Unanimous GREEN | Waterfall, IRR, MOIC |

### Verdict Definitions

| Verdict | Meaning | Action |
|---------|---------|--------|
| **GREEN** | Calculation matches Excel within threshold | Proceed |
| **YELLOW** | Minor discrepancy or ambiguity | Review, clarify, re-validate |
| **RED** | Fails threshold or logic error | Do not proceed, investigate |

### Validation Prompt Template

```markdown
## Calculation Validation Request

**Calculation:** [Name]
**Tier:** [1/2/3]
**Truth Case ID:** [from Excel]

### Inputs
[Paste from Excel/JSON]

### Expected Output
[From Excel]

### Implementation
[Code snippet or formula]

### Request
1. Verify the implementation matches the expected output
2. Check edge cases: [list relevant edges]
3. Provide verdict: GREEN / YELLOW / RED
4. If not GREEN, explain discrepancy
```

### Error Thresholds

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| **MOIC** | < 0.1% relative | Industry reporting standard |
| **IRR** | < 0.01% absolute | Basis point precision required |
| **Fees** | < $100 or 0.05% | Materiality threshold |
| **NAV** | < $1 or 0.01% | Rounding tolerance |
| **Distributions** | < $1 or 0.01% | LP statement precision |

---

## 6. Phased Execution

### Phase 0: Foundation (Week 1)

**Goal:** Ensure test infrastructure works reliably

| Task | Exit Criteria |
|------|---------------|
| Fix `cross-env not found` error | `npm test` runs without setup errors |
| Verify sidecar packages linked | `npm run doctor:links` passes |
| Create truth-cases directory | `docs/truth-cases/` exists |
| Initialize Excel workbook | `FundCalculations.xlsx` with ModelVersion tab |

**Deliverables:**
- [ ] Test suite runs (existing tests may fail, but infrastructure works)
- [ ] Excel workbook initialized with POV Fund I parameters

### Phase 1: Vertical Slice - POV Fund I (Week 2)

**Goal:** Single scenario flowing through entire calculation chain

| Task | Truth Cases | AI Tier |
|------|-------------|---------|
| Single capital call | 1 | Tier 1 |
| Single distribution | 1 | Tier 1 |
| Basic NAV | 1 | Tier 1 |
| Simple fee (committed basis) | 1 | Tier 2 |

**Exit Gate:** POV Fund I Q1 2024 calculates correctly E2E

### Phase 2: Capital Operations (Weeks 3-4)

**Goal:** Complete capital call and distribution logic

| Task | Truth Cases | AI Tier |
|------|-------------|---------|
| Multi-LP capital calls | 3 | Tier 2 |
| Partial calls | 2 | Tier 2 |
| Return of capital | 2 | Tier 2 |
| Profit distributions | 3 | Tier 2 |

**Exit Gate:** 3 distinct scenarios validated for calls and distributions

### Phase 3: Fee Engine (Week 5)

**Goal:** All 4 fee basis methods working

| Fee Basis | Truth Cases | AI Tier |
|-----------|-------------|---------|
| Committed Capital | 2 | Tier 2 |
| Net Cumulative Called | 2 | Tier 2 |
| Cumulative Invested | 2 | Tier 2 |
| FMV-based | 2 | Tier 2 |

**Exit Gate:** Each fee basis method has 2 passing truth cases

### Phase 4: American Waterfall (Week 6)

**Goal:** Deal-by-deal carry calculation validated

| Scenario | Truth Cases | AI Tier |
|----------|-------------|---------|
| Single exit, no hurdle | 1 | Tier 3 |
| Single exit, hurdle met | 1 | Tier 3 |
| Multiple exits, catch-up | 2 | Tier 3 |
| Clawback scenario | 1 | Tier 3 |
| GP commit treatment | 1 | Tier 3 |

**Exit Gate:** All waterfall scenarios pass with unanimous AI consensus

### Phase 5: Returns (IRR/MOIC) (Week 7)

**Goal:** All return metrics validated

| Metric | Truth Cases | AI Tier |
|--------|-------------|---------|
| XIRR (standard) | 3 | Tier 3 |
| XIRR (edge: single cash flow) | 1 | Tier 3 |
| XIRR (edge: all negative) | 1 | Tier 3 |
| Current MOIC | 2 | Tier 2 |
| Realized MOIC | 2 | Tier 2 |
| Target MOIC | 1 | Tier 2 |
| Exit MOIC on Planned Reserves | 1 | Tier 3 |

**IRR Test Matrix:**

| Scenario | Cash Flows | Expected IRR |
|----------|------------|--------------|
| Simple positive | -100, +150 (1yr) | ~50% |
| Multi-year | -100, +20, +20, +120 | ~15-20% |
| Early exit | -100, +200 (6mo) | ~300% |
| Total loss | -100, +0 | -100% |
| Break-even | -100, +100 (1yr) | 0% |

**Exit Gate:** All 4 MOIC variants + XIRR edge cases pass

### Phase 6: Integration & Rollout (Week 8)

**Goal:** Feature flags live, shadow mode validated

| Task | Criteria |
|------|----------|
| Feature flag implementation | `phoenix.*` flags in flag-definitions.ts |
| Shadow mode (0%) | New calculations run but don't display |
| Gradual rollout (10% → 50%) | Canary users see new calculations |
| Full rollout (100%) | All users on new system |
| Monitoring | Discrepancy alerts configured |

**Exit Gate:** 100% rollout with no P0 errors for 48 hours

---

## 7. Feature Flag Strategy

### Flag Naming Convention

All Phoenix flags use `phoenix.` prefix:

```typescript
// In shared/feature-flags/flag-definitions.ts

export const PHOENIX_FLAGS: Record<string, FeatureFlag> = {
  'phoenix.capital_calls': {
    key: 'phoenix.capital_calls',
    name: 'Phoenix Capital Calls',
    description: 'New capital call calculation engine',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: [],
  },
  'phoenix.fees': {
    key: 'phoenix.fees',
    name: 'Phoenix Fee Engine',
    description: 'New fee calculation with 4 basis methods',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.capital_calls'],
  },
  'phoenix.waterfall': {
    key: 'phoenix.waterfall',
    name: 'Phoenix Waterfall',
    description: 'American waterfall calculation',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.fees'],
  },
  'phoenix.returns': {
    key: 'phoenix.returns',
    name: 'Phoenix Returns',
    description: 'IRR and MOIC calculations',
    enabled: false,
    rolloutPercentage: 0,
    dependencies: ['phoenix.waterfall'],
  },
};
```

### Rollout Sequence

```
Phase 6 Rollout:

  Day 1-2:   0% (shadow mode, logging only)
  Day 3-4:   10% (canary users)
  Day 5-6:   50% (broader testing)
  Day 7:     100% (full rollout)

  Rollback: Set rolloutPercentage to 0 instantly
```

### Shadow Mode Implementation

```typescript
// Calculation harness pattern
function calculateWithShadow<T>(
  flagKey: string,
  legacyFn: () => T,
  phoenixFn: () => T
): T {
  const legacyResult = legacyFn();

  if (isPhoenixEnabled(flagKey)) {
    const phoenixResult = phoenixFn();

    // Log discrepancies in shadow mode
    if (getRolloutPercentage(flagKey) < 100) {
      logDiscrepancy(flagKey, legacyResult, phoenixResult);
    }

    return phoenixResult;
  }

  return legacyResult;
}
```

---

## 8. Integration Architecture

### Existing Integration Points

Phoenix calculations integrate with existing systems:

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐   │
│  │FundProvider │  │FeatureFlagProvider│ │CalculationCtx │   │
│  └─────────────┘  └──────────────────┘  └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Calculation Harness                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ if (phoenix.{flag}) { newCalc() } else { legacy() }  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ Capital Calls │    │   Fee Engine  │    │   Waterfall   │
│   phoenix.*   │    │   phoenix.*   │    │   phoenix.*   │
└───────────────┘    └───────────────┘    └───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              DeterministicReserveEngine                      │
│  (Existing - validate only, do not rewrite)                  │
│  Reference: client/src/lib/wizard-reserve-bridge.ts          │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `client/src/lib/wizard-reserve-bridge.ts` | Reserve engine integration pattern |
| `shared/feature-flags/flag-definitions.ts` | Feature flag definitions |
| `client/src/App.tsx` | Provider hierarchy |
| `client/src/core/reserves/DeterministicReserveEngine.ts` | Existing reserve engine |

---

## 9. UI Track (Skeleton)

**Note:** UI work is independent of calculation validation. This skeleton ensures brand consistency when calculations are displayed.

### Brand Tokens (Verified)

From `client/src/styles/brand-tokens.css`:

```css
:root {
  --font-sans-1: 'Inter', system-ui;      /* Body text */
  --font-sans-2: 'Poppins', system-ui;    /* Headings */
  --color-ink: #292929;                    /* Primary text */
  --color-paper: #fff;                     /* Background */
  --color-mist: #F2F2F2;                   /* Secondary background */
  --color-sand: #E0D8D1;                   /* Accent */
}
```

### Display Components (Future)

| Component | Purpose | Phase |
|-----------|---------|-------|
| `<MOICDisplay>` | Format MOIC with variant label | Post-Phase 5 |
| `<IRRDisplay>` | Format IRR with basis point precision | Post-Phase 5 |
| `<FeeBreakdown>` | Show fee by basis method | Post-Phase 3 |
| `<WaterfallChart>` | Visualize distribution waterfall | Post-Phase 4 |

---

## 10. Risk Management

### Slip Rules

**Per-Phase Slip:**
- If any phase slips > 3 days, STOP
- Options: Reduce scope OR re-estimate remaining phases
- Document decision in phase completion notes

**Cumulative Slip:**
- If total slip exceeds 10 days across all phases, STOP
- Re-baseline entire plan
- Notify stakeholders before continuing

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Excel formula error | Medium | High | AI validation of formulas |
| Test infrastructure fragile | Medium | Medium | Phase 0 dedicated to fixing |
| Scope creep (European waterfall) | Low | High | Explicit out-of-scope list |
| AI consensus disagreement | Medium | Low | Escalate to YELLOW, manual review |
| Feature flag race condition | Low | High | Shadow mode testing |

### Rollback Procedure

```
If P0 error detected post-rollout:

1. Set phoenix.* rolloutPercentage to 0 (immediate)
2. Verify legacy calculations restored
3. Log incident with reproduction steps
4. Root cause analysis before re-enabling
```

---

## 11. Success Metrics

### Quantitative

| Metric | Target |
|--------|--------|
| P0 errors | 0 |
| Truth cases passing | 100% |
| AI consensus rate | > 95% GREEN on first pass |
| Rollback incidents | < 2 |

### Qualitative

- [ ] All calculations traceable to Excel truth source
- [ ] Feature flags enable instant rollback
- [ ] No regressions in existing functionality
- [ ] Clear documentation for each calculation

---

## 12. Appendix

### A. Truth Case JSON Schema

```json
{
  "id": "fees-committed-year1",
  "category": "fees",
  "description": "Management fee on committed capital, Year 1",
  "inputs": {
    "fundSize": 50000000,
    "feeRate": 0.02,
    "basisMethod": "committed",
    "period": "2024-Q1"
  },
  "expected": {
    "feeAmount": 250000,
    "basisAmount": 50000000
  },
  "precision": 2,
  "excelRef": "Fees!B12",
  "modelVersion": "PHX-20241204-01"
}
```

### B. Existing Truth Cases (Reference)

The codebase already contains 126 truth cases across modules:

| File | Count | Status |
|------|-------|--------|
| `docs/xirr.truth-cases.json` | 25 | Existing, validate |
| `client/src/core/**/*.test.ts` | 101 | Embedded in tests |

### C. Related Documentation

| Document | Purpose |
|----------|---------|
| `CAPABILITIES.md` | Agent and tool inventory |
| `DECISIONS.md` | Architectural decisions (ADRs) |
| `docs/notebooklm-sources/PHASE2-COMPLETE.md` | Engine documentation status |
| `cheatsheets/anti-pattern-prevention.md` | Quality guidelines |

### D. Glossary

| Term | Definition |
|------|------------|
| **American Waterfall** | Deal-by-deal carry calculation |
| **European Waterfall** | Whole-fund carry (out of scope) |
| **MOIC** | Multiple on Invested Capital |
| **DPI** | Distributions to Paid-In |
| **RVPI** | Residual Value to Paid-In |
| **TVPI** | Total Value to Paid-In (DPI + RVPI) |
| **XIRR** | Extended Internal Rate of Return |
| **Clawback** | GP returns excess carry |
| **Catch-up** | GP receives profits until target carry % |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-04 | Initial release |

**This plan supersedes:**
- PHOENIX-PLAN-2025-11-30.md
- All prior Phoenix planning documents

**Next Review:** End of Phase 2 or upon major scope change
