# Cohort Analysis Engine - Overview

**Module:** `client/src/core/cohorts/CohortEngine.ts` **Purpose:** Vintage
cohort analysis and performance tracking for VC fund portfolio companies
**Estimated Reading Time:** 10-12 minutes **Target Audience:** New developers,
AI agents, portfolio managers, fund analysts **Last Updated:** 2025-11-06

---

## Table of Contents

1. [What is Cohort Analysis?](#what-is-cohort-analysis)
2. [Why Cohort Analysis Matters](#why-cohort-analysis-matters)
3. [Key Concepts](#key-concepts)
4. [High-Level Algorithm Overview](#high-level-algorithm-overview)
5. [When to Use Cohort Analysis](#when-to-use-cohort-analysis)
6. [Relationship to Other Engines](#relationship-to-other-engines)

---

## What is Cohort Analysis?

**Cohort analysis** is the systematic evaluation of portfolio company
performance grouped by **vintage year**—the year in which a fund made its
initial investment in those companies. This analytical framework enables GPs to:

- **Compare performance across vintages** - Understand how different investment
  years performed
- **Identify market timing effects** - Recognize bull/bear market impacts on
  returns
- **Benchmark against cohort averages** - Evaluate individual company
  performance within their vintage peer group
- **Forecast fund-level returns** - Aggregate cohort metrics to predict overall
  fund performance
- **Optimize deployment strategy** - Learn from historical vintage performance
  to inform future pacing

### Vintage Year Definition

The **vintage year** is the calendar year when a fund makes its first
investment. All companies invested in during a single year belong to the same
vintage cohort.

**Example:**

- 2020 Vintage: All companies where the fund's initial investment occurred in
  2020
- 2021 Vintage: All companies where the fund's initial investment occurred in
  2021
- 2022 Vintage: All companies where the fund's initial investment occurred in
  2022

**Why Vintage Matters:** Companies invested in the same year share similar:

- Market conditions at investment (bull/bear cycle, valuation levels)
- Maturity timeline (years since initial investment)
- Exit opportunity windows (IPO market conditions, M&A appetite)
- Economic context (interest rates, risk appetite, sector trends)

---

## Why Cohort Analysis Matters

### Strategic Importance

1. **Performance Attribution**
   - Separate skill from luck by isolating vintage-specific market effects
   - Identify systematic patterns in investment timing
   - Understand which market environments produce best returns

2. **Portfolio Diagnostics**
   - Detect underperforming vintages early (enable proactive management)
   - Recognize when a cohort is outperforming (allocate more reserves)
   - Compare realized vs unrealized performance by vintage maturity

3. **Forecasting & Modeling**
   - Project fund-level TVPI/IRR based on cohort-level trends
   - Model "what-if" scenarios for different vintage compositions
   - Estimate time-to-liquidity based on cohort maturity curves

4. **Stakeholder Reporting**
   - Limited Partners (LPs) expect vintage-level performance reporting
   - Board presentations often compare vintages to industry benchmarks
   - Fundraising materials showcase consistent performance across market cycles

### Real-World Context

From validation test cases
([cohorts-validation.yaml:10-28](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L10)):

```yaml
# Standard vintage cohort analysis
- vintage: 2023
  companies: 5
  totalInvested: 25000000 # $25M deployed
  totalValue: 40000000 # Current portfolio value: $40M
  realized: 15000000 # Cash distributions: $15M

# Expected metrics:
# TVPI: 1.6x (40M / 25M)
# DPI: 0.6x (15M / 25M)
# RVPI: 1.0x ((40M - 15M) / 25M)
# IRR: ~12% annualized
```

**Key Insight:** A 2023 vintage with 1.6x TVPI after 1-2 years indicates strong
early performance, but the 0.6 DPI (60% cash-on-cash return realized) shows the
cohort is still early in its lifecycle with significant unrealized value.

---

## Key Concepts

### 1. Vintage Cohort

**Definition:** A group of portfolio companies where the fund made its initial
investment in the same calendar year.

**Structure:**

```typescript
interface CohortInput {
  fundId: number; // Fund identifier
  vintageYear: number; // Investment year (2000-2030)
  cohortSize: number; // Number of companies in cohort
}
```

**Example:**

```typescript
// 2021 Vintage Analysis
const cohort = {
  fundId: 1,
  vintageYear: 2021,
  cohortSize: 10, // 10 companies invested in 2021
};
```

**Edge Cases:**

- **Current year vintage** (e.g., 2025 for a 2025 investment): Zero maturity,
  minimal realized returns
- **Mature vintages** (5+ years old): High DPI, lower growth potential
- **Small cohorts** (1-2 companies): Higher variance, less statistically
  meaningful
- **Large cohorts** (50+ companies): Requires aggregation logic to prevent
  memory issues

### 2. Cohort Performance Metrics

The engine calculates **three primary performance metrics** for each cohort:

#### a. IRR (Internal Rate of Return)

**Purpose:** Annualized return rate accounting for time value of money

**Key Characteristics:**

- Time-weighted (accounts for when cash flows occur)
- Annualized (expressed as % per year)
- Comparable across vintages with different holding periods

**Typical Range:** -50% to +100% (extreme outliers possible)

See [02-metrics.md](./02-metrics.md#irr-calculation) for detailed IRR
calculation methodology.

#### b. Multiple (TVPI - Total Value to Paid-In Capital)

**Purpose:** Total return multiple (how many dollars returned per dollar
invested)

**Key Characteristics:**

- Includes both realized and unrealized value
- Not time-weighted (ignores holding period)
- Intuitive for LP communication ("2.5x fund")

**Typical Range:** 0x (total loss) to 10x+ (exceptional performance)

See [02-metrics.md](./02-metrics.md#tvpi-calculation) for formula details.

#### c. DPI (Distributions to Paid-In Capital)

**Purpose:** Cash-on-cash return (actual cash returned to LPs)

**Key Characteristics:**

- Only includes realized distributions (cash received)
- Excludes unrealized value (paper gains)
- Most conservative metric (actual liquidity)

**Typical Range:** 0x (no exits yet) to TVPI (fully realized)

**Constraint:** `DPI ≤ TVPI` (cannot distribute more than total value)

See [02-metrics.md](./02-metrics.md#dpi-calculation) for calculation details.

### 3. Cohort Maturity

**Definition:** The number of years since the vintage year, normalized to a 0-1
scale over a 5-year investment horizon.

**Formula:**

```typescript
const yearsActive = currentYear - vintageYear;
const maturityFactor = Math.min(yearsActive / 5, 1.0);
```

**Maturity Levels:**

- **0.0 (0-1 years):** Early-stage, minimal distributions, high risk
- **0.4 (2 years):** Some early exits possible, proving initial thesis
- **0.6 (3 years):** Cohort differentiation clear, reserve decisions critical
- **0.8 (4 years):** Majority of value creation visible, exit planning begins
- **1.0 (5+ years):** Mature cohort, majority of value realized or clear

**Why Maturity Matters:**

- Newer vintages have lower DPI (unrealized gains not yet distributed)
- Older vintages have higher DPI (more exits, higher cash realization)
- IRR is less meaningful for very young vintages (insufficient time elapsed)
- Performance comparisons should account for maturity (don't compare 1-year vs
  5-year cohorts directly)

**Example from tests**
([cohort-engine.test.ts:81-86](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L81)):

```typescript
const recentCohort = CohortEngine({ vintageYear: 2023, cohortSize: 10 });
const matureCohort = CohortEngine({ vintageYear: 2018, cohortSize: 10 });

// Mature cohorts should have higher realized performance (DPI)
expect(matureCohort.performance.dpi).toBeGreaterThan(
  recentCohort.performance.dpi
);
```

### 4. Vintage Year Adjustments

The engine applies **market condition adjustments** based on historical venture
capital market data:

**Adjustment Factors**
([CohortEngine.ts:87-93](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L87)):

```typescript
const vintageAdjustments: Record<number, number> = {
  2020: -0.05, // COVID-19 impact (market disruption)
  2021: 0.08, // Recovery boom (record fundraising, high valuations)
  2022: -0.03, // Market correction (interest rate hikes, valuation reset)
  2023: 0.02, // Normalization (cautious optimism)
  2024: 0.05, // Growth resumption (AI boom, exit market recovery)
};

baseIRR += vintageAdjustments[vintageYear] || 0;
```

**Why Adjust by Vintage?**

- **2020:** COVID-19 caused market disruption, delayed exits, and valuation
  uncertainty
- **2021:** Record VC fundraising ($330B+), inflated valuations, strong exit
  market
- **2022:** Rising interest rates crushed public tech valuations, IPO market
  froze
- **2023:** Flight to quality, AI investment surge, selective exit activity
- **2024:** AI-driven growth, partial IPO market recovery, M&A acceleration

**Test Validation**
([cohort-engine.test.ts:64-70](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L64)):

```typescript
// COVID impact validation
const cohort2020 = CohortEngine({ vintageYear: 2020, cohortSize: 10 });
const cohort2019 = CohortEngine({ vintageYear: 2019, cohortSize: 10 });

// 2020 should show COVID impact (lower IRR)
expect(cohort2020.performance.irr).toBeLessThan(cohort2019.performance.irr);
```

**Important:** These adjustments are applied to the **base IRR** before maturity
scaling, ensuring vintage-specific market effects are captured.

---

## High-Level Algorithm Overview

The CohortEngine operates in **two modes**: rule-based (default) and ML-enhanced
(experimental).

### Rule-Based Algorithm (Production)

**Input:** `CohortInput` (fundId, vintageYear, cohortSize)

**Processing Steps:**

1. **Validation**
   ([CohortEngine.ts:26-32](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L26))

   ```typescript
   const result = CohortInputSchema.safeParse(input);
   if (!result.success) {
     throw new Error(`Invalid cohort input: ${result.error.message}`);
   }
   ```

   - Validates fundId (positive integer)
   - Validates vintageYear (2000-2030 range)
   - Validates cohortSize (positive integer)

2. **Generate Mock Companies**
   ([CohortEngine.ts:48-64](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L48))
   - Creates `cohortSize` portfolio companies
   - Assigns realistic valuations ($1M-$51M base range)
   - Applies growth factors (1.0x-3.375x)
   - Distributes across stages (Seed, Series A, B, C)
   - Generates unique names and IDs

3. **Calculate Maturity**
   ([CohortEngine.ts:80-81](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L80))

   ```typescript
   const yearsActive = new Date().getFullYear() - vintageYear;
   const maturityFactor = Math.min(yearsActive / 5, 1);
   ```

4. **Compute Performance Metrics**
   ([CohortEngine.ts:84-103](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L84))
   - Start with base IRR (15%)
   - Apply vintage-specific adjustment (-5% to +8%)
   - Scale by maturity factor (newer = lower realized returns)
   - Calculate TVPI: `1.0 + (IRR × yearsActive)` with ±25% variance
   - Calculate DPI: `TVPI × maturityFactor × 0.4` (40% realization rate)
   - Round to appropriate precision (IRR: 4 decimals, TVPI/DPI: 2 decimals)

5. **Package Output**
   ([CohortEngine.ts:111-118](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L111))
   ```typescript
   const output: CohortOutput = {
     cohortId: `cohort-${fundId}-${vintageYear}`,
     vintageYear,
     performance: { irr, multiple, dpi },
     companies: generatedCompanies,
   };
   ```

**Output:** `CohortOutput` with performance metrics and company details

### ML-Enhanced Algorithm (Experimental)

**Activation:** Set `ALG_COHORT=true` or `NODE_ENV=development`

**Enhancement Logic**
([CohortEngine.ts:122-148](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L122)):

1. Start with rule-based calculation
2. Apply ML adjustment multiplier (0.9-1.1x)
3. Enhance company valuations with ML insights
4. Return augmented performance metrics

**Status:** Scaffolding only (actual ML model integration pending)

---

## When to Use Cohort Analysis

### Use Cohort Analysis When:

1. **Comparing Performance Across Time**
   - "How did our 2020 vintage compare to 2021?"
   - "Which vintage year has the highest IRR?"
   - "Are newer vintages outperforming historical averages?"

2. **Portfolio-Level Aggregation**
   - "What is our fund-level TVPI across all vintages?"
   - "How much capital is deployed vs realized by vintage?"
   - "What is our weighted average IRR?"

3. **Forecasting Future Performance**
   - "If our 2023 vintage matures to match 2019 performance, what will
     fund-level returns be?"
   - "How much unrealized value exists in early vintages?"
   - "When should we expect distribution events by cohort?"

4. **Benchmarking Against Industry**
   - "Is our 2021 vintage top quartile for that year?"
   - "How does our vintage distribution compare to peer funds?"
   - "Are we capturing vintage-specific market opportunities?"

### Do NOT Use Cohort Analysis When:

1. **Company-Level Diagnostics**
   - Use individual company analysis instead
   - Cohort metrics can mask outlier performance

2. **Real-Time Portfolio Monitoring**
   - Cohort analysis is backward-looking
   - Use real-time valuation tracking instead

3. **Sector or Stage Analysis**
   - Vintage groups by time, not sector
   - Use sector/stage segmentation tools instead

4. **Attribution of Individual Investment Decisions**
   - Cohort metrics are aggregated
   - Requires company-level IRR/MOIC calculation

---

## Relationship to Other Engines

The CohortEngine integrates with other portfolio management engines in the
system:

### 1. ReserveEngine Integration

**Connection:** Follow-on reserve allocation impacts cohort performance

**How They Work Together:**

- ReserveEngine determines which companies receive additional capital
- Companies receiving reserves (follow-on investments) have higher potential for
  ownership maintenance
- This affects cohort-level TVPI and IRR (concentrated winners lift cohort
  metrics)

**Example Workflow:**

1. CohortEngine identifies 2022 vintage as underperforming
2. ReserveEngine analyzes 2022 cohort companies for rescue capital needs
3. Reserves allocated to 3 top performers → lifts cohort performance
4. Next quarter: CohortEngine shows improved 2022 vintage metrics

**Code Reference:** `client/src/core/reserves/ConstrainedReserveEngine.ts`

### 2. PacingEngine Integration

**Connection:** Deployment timing determines vintage composition

**How They Work Together:**

- PacingEngine controls how much capital deploys per quarter/year
- Faster pacing → more vintages with higher company counts
- Slower pacing → fewer, more concentrated vintages

**Example Scenario:**

- **Fast pacing:** Deploy $100M over 2 years → 2 large vintages (2023: 15
  companies, 2024: 15 companies)
- **Slow pacing:** Deploy $100M over 4 years → 4 smaller vintages (2023-2026: ~8
  companies each)

**Trade-off:** More vintages = better diversification but harder to compare;
fewer vintages = clearer performance signals but higher concentration risk

**Code Reference:** `client/src/core/pacing/PacingEngine.ts`

### 3. Monte Carlo Simulation Integration

**Connection:** Cohort analysis provides historical distributions for simulation
inputs

**How They Work Together:**

- Historical cohort TVPI/IRR distributions inform Monte Carlo parameters
- Simulate future vintage performance based on cohort trends
- Model correlation between adjacent vintages (market cycle effects)

**Example Use Case:**

- Extract 5-year cohort history: [2019: 3.2x, 2020: 1.8x, 2021: 2.5x, 2022:
  2.1x, 2023: 1.4x]
- Compute IRR distribution (mean: 25%, std dev: 15%)
- Monte Carlo simulates 1,000 future scenarios for 2024-2026 vintages

**Expected Integration:** `client/src/core/simulation/MonteCarloEngine.ts` (TBD)

### 4. Waterfall & Carry Calculation

**Connection:** Cohort-level DPI drives carried interest calculation

**How They Work Together:**

- Carry waterfall triggered when DPI exceeds hurdle (e.g., 1.0x DPI = return of
  capital)
- Cohort analysis aggregates realized returns (DPI) across vintages
- GP carry = 20% of (Total DPI - 1.0x) after hurdle clearance

**Example:**

- 2020 Vintage: DPI 2.0x on $30M → $60M realized
- 2021 Vintage: DPI 1.5x on $25M → $37.5M realized
- Total DPI: $97.5M realized on $55M invested = 1.77x blended DPI
- Carry calculation: 20% × ($97.5M - $55M) = **$8.5M GP carry**

**Code Reference:** `client/src/lib/waterfall.ts`

---

## Next Steps

- **[02-metrics.md](./02-metrics.md):** Deep dive into TVPI, DPI, RVPI, and IRR
  calculations with formulas and edge cases
- **[03-analysis.md](./03-analysis.md):** Practical examples, code references,
  and integration patterns

---

**Related ADRs:** None currently (vintage methodology predates ADR system)
**Test Coverage:** `tests/unit/engines/cohort-engine.test.ts` (335 lines, 100%
coverage) **Validation Cases:** `scripts/validation/cohorts-validation.yaml` (5
test scenarios)
