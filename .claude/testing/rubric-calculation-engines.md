# Calculation Engines Testing Rubric

**Domain:** Financial calculations (XIRR, waterfall, Monte Carlo, reserves, pacing)
**Estimated Time:** 75 minutes
**Prerequisites:** Test fund with investments, Excel reference files

---

## Overview

This rubric covers all financial calculation engines that power the platform's analytical capabilities. These engines have **Excel parity requirements** - all calculations must match Excel outputs exactly.

**Calculation Engines:**
1. **XIRR Calculator** - Internal rate of return (51 tests passing)
2. **Waterfall Calculator** - American waterfall distributions (53 tests passing)
3. **Monte Carlo Engine** - Probabilistic scenario simulation (10k runs)
4. **Reserve Engine** - Reserve allocation (rule-based + ML)
5. **Pacing Engine** - Investment deployment schedules
6. **Cohort Engine** - Portfolio analytics
7. **Scenario Comparison** - Delta metric calculations

---

## Test Cases

### TC-CE-001: XIRR Calculator - Basic Functionality
**Objective:** Verify XIRR calculations match Excel XIRR function
**Steps:**

**Test 1a: Simple Cash Flow Series**
1. Navigate to company with investment history:
   - 2024-01-01: -$1,000,000 (investment)
   - 2024-12-31: +$1,200,000 (exit)
2. View IRR metric
3. Verify IRR displays: 20.00%
4. Verify calculation matches Excel: `=XIRR({-1000000, 1200000}, {2024-01-01, 2024-12-31})`

**Test 1b: Multiple Cash Flows**
1. Investment series:
   - 2024-01-01: -$1,000,000
   - 2024-06-01: -$500,000
   - 2024-12-01: -$300,000
   - 2025-06-01: +$2,500,000
2. Verify IRR calculation
3. Cross-check with Excel XIRR
4. Verify precision to 2 decimal places

**Test 1c: Negative IRR (Loss)**
1. Investment series:
   - 2024-01-01: -$1,000,000
   - 2024-12-31: +$500,000 (50% loss)
2. Verify IRR displays: -50.00%
3. Verify negative sign and red color indicator

**Excel Reference File:** `tests/fixtures/xirr-test-cases.xlsx`

**Time:** 8 minutes

---

### TC-CE-002: XIRR Edge Cases
**Objective:** Verify XIRR handles edge cases correctly
**Steps:**

**Test 2a: No Positive Cash Flow**
1. Cash flows: All negative (only investments, no exit)
2. Verify IRR displays: "N/A - No exit yet"
3. Verify no calculation error

**Test 2b: Instantaneous Return (Same Day)**
1. Cash flows:
   - 2024-01-01: -$1,000,000
   - 2024-01-01: +$1,200,000 (same day exit)
2. Verify IRR calculation handles division by zero
3. Verify displays annualized rate or "Instant return: 20%"

**Test 2c: Very Long Holding Period (10+ years)**
1. Cash flows:
   - 2014-01-01: -$1,000,000
   - 2024-12-31: +$5,000,000
2. Verify IRR calculates correctly for 10-year period
3. Verify matches Excel XIRR

**Test 2d: Zero Return (Break-Even)**
1. Cash flows:
   - 2024-01-01: -$1,000,000
   - 2024-12-31: +$1,000,000 (exact investment back)
2. Verify IRR: 0.00%

**Test 2e: Precision Test (Small Amounts)**
1. Cash flows:
   - 2024-01-01: -$100
   - 2024-12-31: +$105
2. Verify IRR: 5.00%
3. Verify no rounding errors for small amounts

**Excel Reference File:** `tests/fixtures/xirr-edge-cases.xlsx`

**Time:** 10 minutes

---

### TC-CE-003: Waterfall Calculator - Basic Distribution
**Objective:** Verify American waterfall distributions match Excel
**Steps:**

**Test 3a: Return of Capital Tier**
1. Setup waterfall:
   - GP/LP split: 20/80
   - Hurdle rate: 8%
   - Catch-up: 50%
   - Total proceeds: $50M
   - LP capital: $50M
2. Verify Tier 1 (Return of Capital):
   - LPs receive: $50M
   - GPs receive: $0

**Test 3b: Preferred Return Tier**
1. Additional proceeds: $4M (8% hurdle on $50M)
2. Verify Tier 2 (Preferred Return):
   - LPs receive: $4M
   - GPs receive: $0
   - Cumulative LP: $54M

**Test 3c: Catch-Up Tier**
1. Additional proceeds: $2M (50% catch-up to bring GP to 20%)
2. Verify Tier 3 (GP Catch-Up):
   - LPs receive: $0
   - GPs receive: $2M
   - GP now has 20% of distributed capital

**Test 3d: Carried Interest Split**
1. Additional proceeds: $44M
2. Verify Tier 4 (Carried Interest):
   - LPs receive: 80% = $35.2M
   - GPs receive: 20% = $8.8M
3. Verify final distribution:
   - Total LPs: $89.2M
   - Total GPs: $10.8M
   - GP carried interest: 10.8% of $100M

**Test 3e: Excel Parity Check**
1. Export waterfall calculation to CSV
2. Import into Excel
3. Run Excel waterfall formula
4. Verify outputs match to $0.01

**Excel Reference File:** `tests/fixtures/waterfall-test-cases.xlsx`

**Time:** 12 minutes

---

### TC-CE-004: Waterfall Calculator - Edge Cases
**Objective:** Verify waterfall handles complex scenarios
**Steps:**

**Test 4a: No Hurdle Rate**
1. Configure waterfall: 20/80 split, NO hurdle
2. Proceeds: $100M, LP capital: $50M
3. Verify distribution:
   - Tier 1: Return $50M to LPs
   - Tier 2: Split $50M at 20/80
   - LPs total: $90M
   - GPs total: $10M

**Test 4b: Hard Hurdle vs Soft Hurdle**
1. Configure Hard Hurdle (GP only gets carry after hurdle met)
2. Proceeds: $100M, LP capital: $50M, 8% hurdle
3. Verify GP only receives carry on proceeds above hurdle
4. Reconfigure with Soft Hurdle (GP gets carry on all proceeds)
5. Verify GP receives carry on entire distribution

**Test 4c: 100% Catch-Up**
1. Configure: 100% catch-up (GP gets ALL excess until hitting 20%)
2. Verify Tier 3 calculations
3. Verify GP reaches 20% faster than 50% catch-up

**Test 4d: Partial Distribution (Interim)**
1. Total expected proceeds: $100M
2. Distribute only $60M (partial exit)
3. Verify waterfall tiers applied to $60M
4. Later distribute remaining $40M
5. Verify cumulative distribution matches full $100M waterfall

**Excel Reference File:** `tests/fixtures/waterfall-edge-cases.xlsx`

**Time:** 12 minutes

---

### TC-CE-005: Monte Carlo Engine - Simulation Execution
**Objective:** Verify Monte Carlo simulations run and produce valid distributions
**Steps:**

**Test 5a: Configure Simulation**
1. Navigate to Monte Carlo page
2. Configure parameters:
   - Number of runs: 10,000
   - Scenarios: Base Case (loaded from database)
   - Output metrics: MOIC, IRR, Total Value
3. Click "Run Simulation"
4. Verify simulation starts

**Test 5b: Execution Performance**
1. Monitor simulation progress bar
2. Verify completion time: <5 seconds for 10k runs
3. Verify no browser freeze (async execution)
4. Verify results display after completion

**Test 5c: Distribution Outputs**
1. Verify simulation results include:
   - Probability distribution chart (histogram)
   - Percentile metrics (P10, P25, P50, P75, P90)
   - Mean, median, standard deviation
   - Min/max values
2. Verify chart renders correctly (Recharts)
3. Verify percentile labels on chart

**Test 5d: Statistical Validation**
1. For uniform distribution scenario:
   - Configure: Equal probability across 5 outcomes
   - Run simulation
   - Verify P50 ≈ middle outcome
   - Verify P10/P90 span expected range
2. For normal distribution scenario:
   - Verify 68% of outcomes within 1 std dev
   - Verify 95% within 2 std devs

**Time:** 10 minutes

---

### TC-CE-006: Monte Carlo Engine - Scenario Sensitivity
**Objective:** Verify sensitivity analysis across scenarios
**Steps:**

**Test 6a: Scenario Comparison**
1. Load 3 scenarios: Bear, Base, Bull
2. Run Monte Carlo on each
3. Verify output distributions differ:
   - Bear: Lower mean MOIC
   - Bull: Higher mean MOIC
   - Base: Between Bear and Bull

**Test 6b: Correlation Analysis**
1. Configure correlated variables (e.g., multiple companies in same sector)
2. Run simulation
3. Verify correlation coefficient displayed
4. Verify correlated outcomes cluster together

**Test 6c: Export Simulation Data**
1. After simulation completes
2. Click "Export Results"
3. Verify CSV contains:
   - All 10,000 run outcomes
   - Run number, MOIC, IRR, Total Value
4. Verify can import to Excel for further analysis

**Time:** 8 minutes

---

### TC-CE-007: Reserve Engine - Rule-Based Allocation
**Objective:** Verify reserve allocation rules execute correctly
**Steps:**

**Test 7a: Fixed Percentage Reserves**
1. Configure reserve policy: 50% fixed
2. Record investment: $1M initial
3. Verify reserve allocation: $500K
4. Verify deployed capital: $1M
5. Verify total commitment: $1.5M

**Test 7b: Stage-Based Rules**
1. Configure rules:
   - Seed: 100% reserve
   - Series A: 50% reserve
   - Series B+: 25% reserve
2. Invest $1M in Seed company
3. Verify reserve: $1M (100%)
4. Invest $2M in Series A company
5. Verify reserve: $1M (50%)
6. Invest $4M in Series B company
7. Verify reserve: $1M (25%)

**Test 7c: Sector-Based Rules**
1. Configure rules:
   - Biotech: 75% reserve (high risk)
   - Software: 40% reserve (moderate risk)
   - Infrastructure: 20% reserve (low risk)
2. Invest $1M in Biotech company
3. Verify reserve: $750K
4. Invest $1M in Software company
5. Verify reserve: $400K

**Test 7d: Combined Rules (Stage + Sector)**
1. Configure: Seed Biotech = 150% reserve (additive)
2. Invest $1M
3. Verify reserve: $1.5M
4. Verify warning if reserve exceeds fund capacity

**Time:** 10 minutes

---

### TC-CE-008: Reserve Engine - ML Recommendations
**Objective:** Verify ML-driven reserve suggestions
**Steps:**

**Test 8a: Enable ML Mode**
1. Navigate to reserve settings
2. Select "ML-recommended" policy
3. Verify ML model loads

**Test 8b: ML Prediction**
1. Create new investment: $1M in Series A SaaS company
2. Click "Get ML Recommendation"
3. Verify ML suggests reserve amount (e.g., 45%)
4. Verify confidence score displayed (e.g., 85%)
5. Verify explanation: "Based on 23 similar investments..."

**Test 8c: Override ML Suggestion**
1. ML suggests 45% reserve
2. Manually override to 60%
3. Verify system accepts override
4. Verify warning: "Deviating from ML recommendation"

**Test 8d: ML Training Feedback**
1. After follow-on deployment
2. Verify ML records actual vs predicted reserve usage
3. Verify feedback loop improves future predictions

**Time:** 8 minutes

---

### TC-CE-009: Pacing Engine - Deployment Schedules
**Objective:** Verify investment pacing calculations
**Steps:**

**Test 9a: Linear Pacing**
1. Configure: $50M fund, 5-year deployment, linear pacing
2. Verify annual deployment target: $10M/year
3. Verify deployment schedule chart renders
4. Verify cumulative deployment line

**Test 9b: Front-Loaded Pacing**
1. Configure: Front-loaded strategy
2. Verify Year 1 target: $15M (30%)
3. Verify Year 2 target: $12.5M (25%)
4. Verify Years 3-5 target: $7.5M each (15%)
5. Verify total: $50M

**Test 9c: Actual vs Target Tracking**
1. Record investments: $8M in Year 1
2. Navigate to Pacing Dashboard
3. Verify "Actual vs Target" chart shows:
   - Target: $10M
   - Actual: $8M
   - Variance: -$2M (underpaced)
   - Variance %: -20%

**Test 9d: Pace Adjustment Recommendations**
1. After underpacing in Year 1
2. Verify pacing engine suggests:
   - Increase Year 2 target to $12M to catch up
   - Maintain $10M/year for Years 3-5

**Time:** 7 minutes

---

### TC-CE-010: Cohort Engine - Portfolio Analytics
**Objective:** Verify cohort analysis calculations
**Steps:**

**Test 10a: Vintage Year Cohort**
1. Navigate to Cohort Analysis page
2. Select cohort: "Vintage Year"
3. Verify companies grouped by investment year
4. Verify metrics per cohort:
   - Total invested
   - Number of companies
   - Average MOIC
   - Median IRR

**Test 10b: Sector Cohort**
1. Select cohort: "Sector"
2. Verify companies grouped by sector
3. Verify sector performance comparison chart
4. Verify best/worst performing sectors highlighted

**Test 10c: Stage Cohort**
1. Select cohort: "Stage"
2. Verify companies grouped by investment stage
3. Verify stage-specific metrics:
   - Seed: Higher failure rate, higher potential returns
   - Series A: Moderate risk/return
   - Series B+: Lower variance

**Test 10d: Cohort Export**
1. Click "Export Cohort Data"
2. Verify CSV contains:
   - Cohort grouping
   - Company counts
   - Performance metrics
3. Verify pivot table friendly format

**Time:** 6 minutes

---

### TC-CE-011: Scenario Comparison - Delta Metrics
**Objective:** Verify scenario comparison delta calculations (from MVP implementation)
**Steps:**

**Test 11a: Create Comparison**
1. Navigate to Scenario Comparison page
2. Select base scenario: "Base Case"
3. Select comparison scenarios: "Bull Case", "Bear Case"
4. Select metrics: MOIC, Total Investment, Exit Proceeds
5. Click "Compare Scenarios"
6. Verify comparison results load

**Test 11b: Delta Metric Accuracy**
1. Verify delta metrics table displays:
   - Base value
   - Comparison value
   - Absolute delta
   - Percentage delta
   - Trend indicator (↑/↓)
2. For MOIC delta (Base: 2.5x, Bull: 4.0x):
   - Absolute delta: +1.5x
   - Percentage delta: +60%
   - Trend: ↑ (green)

**Test 11c: Trend Direction**
1. Verify "higher is better" metrics (MOIC, IRR):
   - Positive delta = green ↑
   - Negative delta = red ↓
2. Verify "lower is better" metrics (Total Investment):
   - Negative delta = green ↓
   - Positive delta = red ↑

**Test 11d: Comparison Caching**
1. Create comparison
2. Note comparison ID from URL
3. Navigate away
4. Return to `/api/portfolio/comparisons/{id}`
5. Verify cached result loads instantly (no recalculation)
6. After 5 minutes, verify 404 (cache expired)

**Time:** 8 minutes

---

### TC-CE-012: Calculation Precision and Rounding
**Objective:** Verify all engines use consistent precision (Decimal.js, 28 digits)
**Steps:**

**Test 12a: Decimal Precision**
1. Create investment: $1,000,000.01
2. Calculate ownership: (Investment / Post-Money) = 10.000000001%
3. Verify precision maintains: 10.000000001%
4. Verify no floating-point errors (e.g., 9.999999999%)

**Test 12b: Rounding Consistency**
1. Calculate MOIC: $2,500,000.49 / $1,000,000 = 2.50x
2. Verify rounds to 2 decimal places: 2.50x
3. Calculate IRR: 15.555%
4. Verify rounds to 2 decimal places: 15.56%

**Test 12c: Currency Formatting**
1. Verify all currency values display:
   - Comma separators: $1,000,000
   - Two decimal places: $1,000,000.00
   - Negative in parentheses: ($500,000.00)

**Test 12d: Large Number Handling**
1. Enter fund size: $10,000,000,000 ($10B)
2. Calculate metrics
3. Verify no overflow errors
4. Verify scientific notation NOT used in UI

**Time:** 6 minutes

---

## Summary Checklist

After completing all test cases, verify:

- [ ] XIRR calculations match Excel (51 test cases)
- [ ] Waterfall distributions match Excel (53 test cases)
- [ ] Monte Carlo completes <5s for 10k runs
- [ ] Reserve allocation rules execute correctly
- [ ] Pacing tracks actual vs target
- [ ] Cohort analytics group and calculate properly
- [ ] Scenario comparison delta metrics accurate
- [ ] All engines use Decimal.js (28-digit precision)
- [ ] No floating-point rounding errors
- [ ] Currency formatted consistently

---

## Excel Parity Verification

**Critical Requirement:** All financial calculations MUST match Excel outputs.

**Verification Process:**
1. Export calculation inputs to CSV
2. Import to Excel reference workbook
3. Run Excel formulas (XIRR, waterfall model)
4. Compare outputs (platform vs Excel)
5. Verify difference ≤ $0.01 or 0.01%

**Excel Reference Files:**
- `tests/fixtures/xirr-test-cases.xlsx` (51 XIRR scenarios)
- `tests/fixtures/waterfall-test-cases.xlsx` (53 waterfall scenarios)
- `tests/fixtures/monte-carlo-validation.xlsx` (Distribution validation)

**Failing Parity = Blocker Bug**

---

## Known Issues

Document any calculation discrepancies:

| Test Case | Issue Description | Severity | GitHub Issue |
|-----------|-------------------|----------|--------------|
| TC-CE-XXX | [Description]     | BLOCKER  | #XXX         |

---

## Performance Benchmarks

| Engine           | Target Performance      | Current Performance |
|------------------|-------------------------|---------------------|
| XIRR             | <100ms per calculation  | TBD                 |
| Waterfall        | <200ms per calculation  | TBD                 |
| Monte Carlo (10k)| <5s total               | TBD                 |
| Reserve Engine   | <50ms per allocation    | TBD                 |
| Pacing Engine    | <100ms per schedule     | TBD                 |
| Cohort Engine    | <500ms per cohort       | TBD                 |

---

## Related Documentation

- [cheatsheets/xirr-calculation.md](../../cheatsheets/xirr-calculation.md) - XIRR implementation details
- [cheatsheets/waterfall-modeling.md](../../cheatsheets/waterfall-modeling.md) - Waterfall calculation patterns
- [shared/utils/scenario-math.ts](../../shared/utils/scenario-math.ts) - Core math utilities
- [server/services/comparison-service.ts](../../server/services/comparison-service.ts) - Scenario comparison logic
