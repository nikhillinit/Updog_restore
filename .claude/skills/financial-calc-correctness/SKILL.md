---
status: ACTIVE
last_updated: 2026-01-19
---

# Financial Calculation Correctness and Parity

## Overview

This skill defines patterns for validating financial calculations against Excel models, maintaining truth-case accuracy, and ensuring numerical correctness for IRR, waterfalls, Monte Carlo, and related computations.

**Core principle**: Excel is the source of truth for business logic validation. Code may differ in implementation but must produce equivalent results within defined tolerances.

## Invariants to Enforce

### 1. Mass Conservation

Money in must equal money out plus final balance. This applies to:

| Domain | Invariant |
|--------|-----------|
| Waterfall distributions | total_contributions == sum(distributions) + remaining_nav |
| Fee calculations | gross_return - fees == net_return |
| Capital calls | committed - called == uncalled |
| Cash flows | sum(inflows) - sum(outflows) == ending_balance |

### 2. Monotonicity

Cumulative values must not decrease (unless explicitly modeling reversals):

| Domain | Invariant |
|--------|-----------|
| Cumulative distributions | cumulative[t] >= cumulative[t-1] |
| DPI (Distributions to Paid-In) | Non-decreasing over time |
| Cumulative contributions | Non-decreasing (capital calls don't reverse) |

### 3. Boundary Conditions

Edge cases must produce sensible results:

| Scenario | Expected Behavior |
|----------|-------------------|
| Zero contributions | IRR undefined or returns null, not NaN or Infinity |
| Single cash flow | IRR = 0 or undefined, not error |
| All negative cash flows | IRR calculation should fail gracefully |
| Very large multiples (>100x) | Solver should converge, not timeout |
| Very small amounts (<$0.01) | Precision maintained, not rounded to zero |

### 4. Day Count Convention Consistency

Different conventions produce different results. Document and enforce:

| Convention | Use Case |
|------------|----------|
| ACT/360 | Money market, some loans |
| ACT/365 | Bonds, many PE calculations |
| ACT/ACT | Some bond markets |
| 30/360 | Some corporate bonds |

## Precision and Tolerance Norms

### When to Use Different Tolerances

| Context | Tolerance | Rationale |
|---------|-----------|-----------|
| Currency display | 1e-2 ($0.01) | Penny rounding for UI |
| Percentage display | 1e-4 (0.01%) | Basis point precision |
| IRR/XIRR comparison | 1e-6 | Solver convergence precision |
| Intermediate calculations | 1e-10 | Avoid accumulated rounding |
| Mass conservation checks | 1e-6 | Balance dollar-level precision |

### Tolerance Documentation Pattern

Every tolerance in code must be documented:

```typescript
// GOOD: Documented tolerance with rationale
const IRR_TOLERANCE = 1e-6; // 0.0001% - matches Excel XIRR solver precision

// BAD: Magic number
if (Math.abs(a - b) < 0.0001) { ... }
```

## Excel Parity Workflow

### Step 1: Define Source of Truth

Document the Excel model location, owner, last validation date, and known deviations from code.

### Step 2: Extract Test Vectors

Create test vectors programmatically from Excel, not manually.

### Step 3: Run Comparison

Compare code results with Excel expected values using explicit tolerances.

### Step 4: Document Intentional Deviations

When code intentionally differs from Excel, create an ADR.

## Truth Case Validation Rules

### Required Fields

Every truth case must include:
- name: Descriptive unique name
- description: What this case tests
- source: excel_model_v3.xlsx | manual_calculation | regression_capture
- created: Date
- inputs: Input data
- expected: Expected outputs with tolerances and rationale

### Validation Checklist

Before accepting a truth case change:

- [ ] Tolerance is explicitly specified (not default)
- [ ] Tolerance rationale is documented
- [ ] Source is identified (Excel, manual calc, regression)
- [ ] If from Excel: Excel file is committed or referenced
- [ ] If tolerance increased: ADR documents why
- [ ] Mass conservation holds in expected outputs
- [ ] Monotonicity constraints satisfied

## Solver-Specific Guidance

### IRR/XIRR Solvers

```typescript
// Solver configuration that matches Excel behavior
const XIRR_CONFIG = {
  maxIterations: 100,      // Excel default
  tolerance: 1e-6,         // Convergence threshold
  initialGuess: 0.1,       // 10% starting point
  bounds: [-0.99, 10.0],   // -99% to 1000% annual return
};
```

### Newton-Raphson vs Bisection

| Method | Use When | Tradeoff |
|--------|----------|----------|
| Newton-Raphson | Smooth function, good initial guess | Fast but can diverge |
| Bisection | Bounded search, guaranteed convergence | Slower but reliable |
| Hybrid | Start Newton, fallback to bisection | Best of both |

## Integration with Phoenix Workflows

The parity-auditor agent uses this skill when:
- PRs touch calculation code
- Truth-case tests fail
- Excel parity impact assessment is needed

## Related Skills

- phoenix-precision-guard: Numeric drift detection
- phoenix-waterfall-ledger-semantics: Waterfall calculation rules
- phoenix-xirr-fees-validator: XIRR and fee validation
