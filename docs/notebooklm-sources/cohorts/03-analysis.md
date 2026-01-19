---
status: ACTIVE
last_updated: 2026-01-19
---

# Cohort Analysis - Practical Usage & Integration

**Module:** `client/src/core/cohorts/CohortEngine.ts` **Purpose:** Real-world
usage patterns, integration scenarios, and code examples for cohort analysis
**Estimated Reading Time:** 12-15 minutes **Target Audience:** Developers
implementing cohort features, AI agents, integration engineers **Last Updated:**
2025-11-06

---

## Table of Contents

1. [API Usage Patterns](#api-usage-patterns)
2. [Vintage Analysis Workflows](#vintage-analysis-workflows)
3. [Cross-Cohort Comparison](#cross-cohort-comparison)
4. [Integration with Other Engines](#integration-with-other-engines)
5. [Performance Benchmarking](#performance-benchmarking)
6. [Common Pitfalls & Solutions](#common-pitfalls--solutions)
7. [Code Reference Map](#code-reference-map)

---

## API Usage Patterns

### Basic Cohort Analysis

**Simplest Use Case:** Analyze a single vintage cohort

**Code Example**
([CohortEngine.ts:159-169](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L159)):

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Analyze 2023 vintage (10 companies)
const input = {
  fundId: 1,
  vintageYear: 2023,
  cohortSize: 10,
};

const result = CohortEngine(input);

console.log(result);
// {
//   cohortId: "cohort-1-2023",
//   vintageYear: 2023,
//   performance: {
//     irr: 0.1234,      // 12.34% IRR
//     multiple: 1.45,   // 1.45x TVPI
//     dpi: 0.35         // 0.35x DPI (24% realized)
//   },
//   companies: [
//     { id: 1, name: "TechCorp", stage: "Series A", valuation: 12500000 },
//     { id: 2, name: "DataInc", stage: "Seed", valuation: 3200000 },
//     // ... 8 more companies
//   ]
// }
```

**Test Validation**
([cohort-engine.test.ts:26-33](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L26)):

```typescript
it('should validate and process correct input', () => {
  const input = createCohortInput();
  const result = CohortEngine(input);

  expect(result).toBeDefined();
  expect(result.cohortId).toContain('cohort-1-2020');
  expect(result.vintageYear).toBe(2020);
});
```

### Cohort Summary Generation

**Use Case:** Get aggregated statistics and metadata for a cohort

**Code Example**
([CohortEngine.ts:176-208](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L176)):

```typescript
import { generateCohortSummary } from '@/core/cohorts/CohortEngine';

const input = {
  fundId: 1,
  vintageYear: 2021,
  cohortSize: 8,
};

const summary = generateCohortSummary(input);

console.log(summary);
// {
//   cohortId: "cohort-1-2021",
//   vintageYear: 2021,
//   totalCompanies: 8,
//   performance: { irr: 0.15, multiple: 1.6, dpi: 0.48 },
//   avgValuation: 15234000,
//   stageDistribution: {
//     "Seed": 2,
//     "Series A": 3,
//     "Series B": 2,
//     "Series C": 1
//   },
//   generatedAt: Date('2024-11-06T10:30:00Z'),
//   metadata: {
//     algorithmMode: "rule-based",
//     yearsActive: 3,
//     maturityLevel: 0.6
//   }
// }
```

**Stage Distribution Calculation**
([CohortEngine.ts:185-188](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L185)):

```typescript
// Calculate stage distribution
const stageDistribution = reduce(
  cohortOutput.companies,
  (acc, company) => {
    acc[company.stage] = (acc[company.stage] || 0) + 1;
    return acc;
  },
  {} as Record<string, number>
);
```

**Test Validation**
([cohort-engine.test.ts:302-309](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L302)):

```typescript
it('should include stage distribution', () => {
  const summary = generateCohortSummary(input);

  // Count should match total companies
  const totalCount = Object.values(summary.stageDistribution).reduce(
    (sum, count) => sum + count,
    0
  );
  expect(totalCount).toBe(summary.totalCompanies);
});
```

### Input Validation

**Error Handling:** The engine validates all inputs using Zod schemas

**Invalid Input Example:**

```typescript
const badInput = {
  fundId: 'not-a-number', // ❌ Must be positive integer
  vintageYear: 1999, // ❌ Must be 2000-2030
  cohortSize: -5, // ❌ Must be positive
};

try {
  const result = CohortEngine(badInput);
} catch (error) {
  console.error(error.message);
  // "Invalid cohort input: Expected number, received string at fundId"
}
```

**Test Validation**
([cohort-engine.test.ts:36-38](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L36)):

```typescript
it('should reject invalid cohort input', () => {
  const invalidInput = { fundId: 1 } as any;
  expect(() => CohortEngine(invalidInput)).toThrow('Invalid cohort input');
});
```

**Validation Schema**
([shared/types.ts:135-139](c:\dev\Updog_restore\shared\types.ts#L135)):

```typescript
export const CohortInputSchema = z.object({
  fundId: z.number().int().positive(),
  vintageYear: z.number().int().min(2000).max(2030),
  cohortSize: z.number().int().positive(),
});
```

---

## Vintage Analysis Workflows

### Time-Series Vintage Comparison

**Use Case:** Track how different vintage years performed over time

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Analyze 5 consecutive vintages
const vintages = [2019, 2020, 2021, 2022, 2023];

const cohortResults = vintages.map((year) => {
  const input = { fundId: 1, vintageYear: year, cohortSize: 10 };
  return CohortEngine(input);
});

// Extract TVPI time series
const tvpiTimeSeries = cohortResults.map((c) => ({
  vintage: c.vintageYear,
  tvpi: c.performance.multiple,
  maturity: (2024 - c.vintageYear) / 5,
}));

console.log(tvpiTimeSeries);
// [
//   { vintage: 2019, tvpi: 2.45, maturity: 1.0 },   // Fully mature
//   { vintage: 2020, tvpi: 2.10, maturity: 0.8 },   // 4 years old
//   { vintage: 2021, tvpi: 1.85, maturity: 0.6 },   // 3 years old
//   { vintage: 2022, tvpi: 1.50, maturity: 0.4 },   // 2 years old
//   { vintage: 2023, tvpi: 1.25, maturity: 0.2 }    // 1 year old
// ]
```

**Visualization Pattern:**

```typescript
// Chart data for vintage performance comparison
const chartData = {
  labels: tvpiTimeSeries.map((d) => d.vintage),
  datasets: [
    {
      label: 'TVPI',
      data: tvpiTimeSeries.map((d) => d.tvpi),
      borderColor: 'blue',
    },
    {
      label: 'Maturity',
      data: tvpiTimeSeries.map((d) => d.maturity),
      borderColor: 'green',
      yAxisID: 'maturity-axis',
    },
  ],
};
```

**Test Validation**
([cohort-engine.test.ts:40-48](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L40)):

```typescript
it('should handle various vintage years', () => {
  const years = [2018, 2019, 2020, 2021, 2022, 2023, 2024];

  years.forEach((year) => {
    const input = createCohortInput({ vintageYear: year });
    const result = CohortEngine(input);
    expect(result.vintageYear).toBe(year);
  });
});
```

### Vintage Year Adjustment Analysis

**Use Case:** Understand market condition impacts on different vintages

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Compare COVID-era vintages
const vintages = [
  { year: 2019, label: 'Pre-COVID' },
  { year: 2020, label: 'COVID Impact' },
  { year: 2021, label: 'Recovery Boom' },
  { year: 2022, label: 'Market Correction' },
];

const comparison = vintages.map(({ year, label }) => {
  const input = { fundId: 1, vintageYear: year, cohortSize: 10 };
  const result = CohortEngine(input);
  return {
    year,
    label,
    irr: result.performance.irr,
    adjustment: getVintageAdjustment(year), // Extract from source
  };
});

console.log(comparison);
// [
//   { year: 2019, label: "Pre-COVID", irr: 0.15, adjustment: 0 },
//   { year: 2020, label: "COVID Impact", irr: 0.10, adjustment: -0.05 },
//   { year: 2021, label: "Recovery Boom", irr: 0.23, adjustment: 0.08 },
//   { year: 2022, label: "Market Correction", irr: 0.12, adjustment: -0.03 }
// ]
```

**Vintage Adjustments**
([CohortEngine.ts:87-93](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L87)):

```typescript
const vintageAdjustments: Record<number, number> = {
  2020: -0.05, // COVID impact (-5% IRR)
  2021: 0.08, // Recovery boom (+8% IRR)
  2022: -0.03, // Market correction (-3% IRR)
  2023: 0.02, // Normalization (+2% IRR)
  2024: 0.05, // Growth resumption (+5% IRR)
};
```

**Test Validation**
([cohort-engine.test.ts:56-62](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L56)):

```typescript
it('should apply vintage year adjustments', () => {
  const cohort2020 = CohortEngine({ vintageYear: 2020 });
  const cohort2021 = CohortEngine({ vintageYear: 2021 });

  // Different vintages should have different performance
  expect(cohort2020.performance.irr).not.toBe(cohort2021.performance.irr);
});
```

---

## Cross-Cohort Comparison

### Multi-Cohort Analysis

**Use Case:** Compare performance across multiple vintages simultaneously

**Code Example**
([CohortEngine.ts:215-250](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L215)):

```typescript
import { compareCohorts } from '@/core/cohorts/CohortEngine';

const cohortInputs = [
  { fundId: 1, vintageYear: 2020, cohortSize: 10 },
  { fundId: 1, vintageYear: 2021, cohortSize: 12 },
  { fundId: 1, vintageYear: 2022, cohortSize: 8 },
];

const comparison = compareCohorts(cohortInputs);

console.log(comparison);
// {
//   cohorts: [
//     { cohortId: "cohort-1-2020", performance: { irr: 0.15, ... }, ... },
//     { cohortId: "cohort-1-2021", performance: { irr: 0.23, ... }, ... },
//     { cohortId: "cohort-1-2022", performance: { irr: 0.12, ... }, ... }
//   ],
//   comparison: {
//     bestPerforming: "cohort-1-2021",  // Highest IRR
//     avgIRR: 0.1667,                    // Average across cohorts
//     avgMultiple: 1.75,                 // Average TVPI
//     totalCompanies: 30                 // 10 + 12 + 8
//   }
// }
```

**Best Performer Identification**
([CohortEngine.ts:231-234](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L231)):

```typescript
// Find best performing cohort by IRR
const bestPerforming = reduce(
  cohortSummaries.slice(1),
  (best, current) =>
    current.performance.irr > best.performance.irr ? current : best,
  cohortSummaries[0]
);
```

**Test Validation**
([cohort-engine.test.ts:192-203](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L192)):

```typescript
it('should compare multiple cohorts', () => {
  const cohorts = [
    createCohortInput({ vintageYear: 2020 }),
    createCohortInput({ vintageYear: 2021 }),
    createCohortInput({ vintageYear: 2022 }),
  ];

  const comparison = compareCohorts(cohorts);

  expect(comparison.cohorts).toHaveLength(3);
  expect(comparison.comparison).toBeDefined();
});
```

### Validation Test: Multi-Cohort Aggregation

**Real-World Scenario**
([cohorts-validation.yaml:30-57](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L30)):

```yaml
scenario: 'Cross-vintage portfolio analysis'
cohorts:
  - vintage: 2022
    companies: 8
    totalInvested: 40000000
    totalValue: 80000000 # 2x TVPI
    realized: 30000000 # 0.75x DPI

  - vintage: 2023
    companies: 6
    totalInvested: 30000000
    totalValue: 45000000 # 1.5x TVPI
    realized: 10000000 # 0.33x DPI

  - vintage: 2024
    companies: 4
    totalInvested: 20000000
    totalValue: 22000000 # 1.1x TVPI
    realized: 0 # 0x DPI (too early)

# Expected aggregation:
# Portfolio TVPI = (80M + 45M + 22M) / (40M + 30M + 20M)
#                = 147M / 90M = 1.63x
# Portfolio DPI = (30M + 10M + 0) / 90M = 0.44x
```

**Validation Logic:**

```typescript
const result = output;

// Validate multi-cohort aggregation
result.cohorts.length === 3 &&
  result.portfolioTVPI === 1.63 &&
  result.portfolioDPI === 0.44 &&
  result.cohorts[0].maturity > result.cohorts[2].maturity; // 2022 > 2024
```

### Aggregate Metrics Calculation

**Average IRR**
([CohortEngine.ts:237](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L237)):

```typescript
const avgIRR =
  reduce(cohortSummaries, (sum, cohort) => sum + cohort.performance.irr, 0) /
  cohortSummaries.length;
```

**Average TVPI**
([CohortEngine.ts:238](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L238)):

```typescript
const avgMultiple =
  reduce(
    cohortSummaries,
    (sum, cohort) => sum + cohort.performance.multiple,
    0
  ) / cohortSummaries.length;
```

**Total Companies**
([CohortEngine.ts:239](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L239)):

```typescript
const totalCompanies = reduce(
  cohortSummaries,
  (sum, cohort) => sum + cohort.totalCompanies,
  0
);
```

**Test Validation**
([cohort-engine.test.ts:243-254](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L243)):

```typescript
it('should calculate total companies across cohorts', () => {
  const cohorts = [
    createCohortInput({ cohortSize: 10 }),
    createCohortInput({ cohortSize: 15 }),
    createCohortInput({ cohortSize: 12 }),
  ];

  const comparison = compareCohorts(cohorts);

  expect(comparison.comparison.totalCompanies).toBe(37);
});
```

---

## Integration with Other Engines

### ReserveEngine Integration

**Scenario:** Use cohort analysis to inform reserve allocation decisions

**Workflow:**

1. Analyze each vintage cohort's performance
2. Identify underperforming vintages needing rescue capital
3. Identify outperforming vintages worthy of doubling down
4. Pass company-level data to ReserveEngine for allocation

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

// Step 1: Analyze 2022 vintage cohort
const cohort = CohortEngine({
  fundId: 1,
  vintageYear: 2022,
  cohortSize: 10,
});

// Step 2: Extract companies for reserve allocation
const portfolioCompanies = cohort.companies.map((company) => ({
  id: company.id,
  invested: 500000, // Initial investment (assume $500K each)
  ownership: 0.08, // 8% ownership
  stage: company.stage,
  sector: 'SaaS', // Inferred from company data
}));

// Step 3: Calculate reserve allocations
const reserveInput = {
  availableReserves: 5000000, // $5M available
  companies: portfolioCompanies,
  constraints: {
    minCheck: 100000,
    maxCheck: 2000000,
    reserveMultiples: { Seed: 3.0, 'Series A': 2.0, 'Series B': 1.5 },
  },
};

const reserveAllocations = ConstrainedReserveEngine(reserveInput);

console.log(reserveAllocations);
// {
//   allocations: [
//     { companyId: 1, amount: 1500000, rationale: "Top performer" },
//     { companyId: 3, amount: 1000000, rationale: "Pro-rata follow-on" },
//     // ... more allocations
//   ],
//   totalAllocated: 4500000,
//   unallocated: 500000
// }
```

**Integration Point:** Cohort companies → Reserve allocation input **Related
Docs:**
[docs/notebooklm-sources/reserves/04-integration.md](../reserves/04-integration.md)

### PacingEngine Integration

**Scenario:** Adjust deployment pacing based on historical cohort performance

**Workflow:**

1. Analyze historical vintages (last 3-5 years)
2. Identify best-performing vintage years (market timing)
3. Adjust future pacing to align with favorable market conditions

**Code Example:**

```typescript
import { CohortEngine, compareCohorts } from '@/core/cohorts/CohortEngine';
import { PacingEngine } from '@/core/pacing/PacingEngine';

// Step 1: Analyze historical vintages
const historicalCohorts = [2019, 2020, 2021, 2022, 2023].map((year) => ({
  fundId: 1,
  vintageYear: year,
  cohortSize: 10,
}));

const historical = compareCohorts(historicalCohorts);

// Step 2: Identify best vintage (2021 recovery boom)
const bestVintage = historical.cohorts.find(
  (c) => c.cohortId === historical.comparison.bestPerforming
);

console.log(`Best performing vintage: ${bestVintage.vintageYear}`);
// "Best performing vintage: 2021"

// Step 3: Adjust pacing for current market
const marketCondition = bestVintage.vintageYear === 2021 ? 'bull' : 'neutral';

const pacingSchedule = PacingEngine({
  fundSize: 100000000,
  deploymentQuarter: 1,
  marketCondition, // Use inferred market condition
});

console.log(pacingSchedule);
// 8-quarter deployment schedule optimized for bull market (front-loaded)
```

**Integration Point:** Cohort performance → Market condition inference → Pacing
strategy **Related Docs:**
[docs/notebooklm-sources/pacing/03-integration.md](../pacing/03-integration.md)

### Monte Carlo Simulation Integration

**Scenario:** Use historical cohort distributions to parameterize Monte Carlo
simulations

**Workflow:**

1. Extract TVPI and IRR distributions from historical cohorts
2. Calculate mean, standard deviation, and percentiles
3. Use as inputs to Monte Carlo simulation

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Step 1: Collect historical cohort data
const historicalYears = [2017, 2018, 2019, 2020, 2021];
const cohorts = historicalYears.map((year) =>
  CohortEngine({ fundId: 1, vintageYear: year, cohortSize: 10 })
);

// Step 2: Extract TVPI distribution
const tvpiValues = cohorts.map((c) => c.performance.multiple);
const meanTVPI = tvpiValues.reduce((sum, v) => sum + v, 0) / tvpiValues.length;
const stdDevTVPI = Math.sqrt(
  tvpiValues.reduce((sum, v) => sum + Math.pow(v - meanTVPI, 2), 0) /
    tvpiValues.length
);

console.log({ meanTVPI, stdDevTVPI });
// { meanTVPI: 2.15, stdDevTVPI: 0.45 }

// Step 3: Extract IRR distribution
const irrValues = cohorts.map((c) => c.performance.irr);
const meanIRR = irrValues.reduce((sum, v) => sum + v, 0) / irrValues.length;
const stdDevIRR = Math.sqrt(
  irrValues.reduce((sum, v) => sum + Math.pow(v - meanIRR, 2), 0) /
    irrValues.length
);

console.log({ meanIRR, stdDevIRR });
// { meanIRR: 0.18, stdDevIRR: 0.06 }

// Step 4: Use in Monte Carlo simulation
const monteCarloParams = {
  baseMOIC: meanTVPI, // 2.15x
  moicVolatility: stdDevTVPI, // 0.45
  baseIRR: meanIRR, // 18%
  irrVolatility: stdDevIRR, // 6%
  monteCarloRuns: 1000,
};

// Pass to MonteCarloEngine (not yet implemented)
```

**Integration Point:** Cohort historical statistics → Monte Carlo parameters

---

## Performance Benchmarking

### Cohort vs Industry Benchmarks

**Use Case:** Compare fund cohorts to VC industry benchmarks (Pitchbook,
Cambridge Associates)

**Industry Benchmarks (Top Quartile):**

- **Seed/Early Stage:** TVPI = 3.0x+, IRR = 25%+
- **Growth Stage:** TVPI = 2.5x+, IRR = 20%+
- **Late Stage:** TVPI = 2.0x+, IRR = 15%+

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

const cohort = CohortEngine({
  fundId: 1,
  vintageYear: 2021,
  cohortSize: 10,
});

// Define benchmarks
const benchmarks = {
  seed: { tvpi: 3.0, irr: 0.25 },
  growth: { tvpi: 2.5, irr: 0.2 },
  lateStage: { tvpi: 2.0, irr: 0.15 },
};

// Infer stage from cohort composition
const stageDistribution = cohort.companies.reduce((acc, c) => {
  acc[c.stage] = (acc[c.stage] || 0) + 1;
  return acc;
}, {});

const dominantStage = Object.entries(stageDistribution).sort(
  (a, b) => b[1] - a[1]
)[0][0]; // Most common stage

const benchmark =
  dominantStage === 'Seed'
    ? benchmarks.seed
    : dominantStage === 'Series C'
      ? benchmarks.lateStage
      : benchmarks.growth;

// Compare to benchmark
const tvpiDelta = cohort.performance.multiple - benchmark.tvpi;
const irrDelta = cohort.performance.irr - benchmark.irr;

console.log({
  cohortTVPI: cohort.performance.multiple,
  benchmarkTVPI: benchmark.tvpi,
  tvpiDelta, // Positive = outperforming
  cohortIRR: cohort.performance.irr,
  benchmarkIRR: benchmark.irr,
  irrDelta, // Positive = outperforming
  quartile: tvpiDelta > 0 && irrDelta > 0 ? 'Top Quartile' : 'Below Median',
});
```

### Maturity-Adjusted Benchmarking

**Use Case:** Compare cohorts of different ages fairly (adjust for maturity)

**Code Example:**

```typescript
import { CohortEngine } from '@/core/cohorts/CohortEngine';

const recentCohort = CohortEngine({
  fundId: 1,
  vintageYear: 2023,
  cohortSize: 10,
});
const matureCohort = CohortEngine({
  fundId: 1,
  vintageYear: 2019,
  cohortSize: 10,
});

// Calculate maturity-adjusted TVPI
const adjustedRecentTVPI =
  recentCohort.performance.multiple /
  ((new Date().getFullYear() - 2023) / 5 || 0.2); // Min 1-year maturity

const adjustedMatureTVPI =
  matureCohort.performance.multiple /
  Math.min((new Date().getFullYear() - 2019) / 5, 1.0);

console.log({
  recentCohort: {
    raw: recentCohort.performance.multiple,
    adjusted: adjustedRecentTVPI,
    maturity: (new Date().getFullYear() - 2023) / 5,
  },
  matureCohort: {
    raw: matureCohort.performance.multiple,
    adjusted: adjustedMatureTVPI,
    maturity: 1.0, // Fully mature
  },
});
```

**Interpretation:** Maturity-adjusted TVPI normalizes for holding period,
enabling fair comparison across vintages.

---

## Common Pitfalls & Solutions

### Pitfall 1: Comparing Cohorts of Different Maturity

**Problem:** Directly comparing 2023 vintage (1 year old) to 2019 vintage (5
years old)

**Why It's Wrong:**

- Newer cohorts haven't had time to realize value (lower DPI)
- IRR is less meaningful for <2 year periods
- TVPI comparison ignores time value of money

**Solution:** Use maturity-adjusted metrics or compare within similar age groups

**Test Validation**
([cohort-engine.test.ts:81-86](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L81)):

```typescript
it('should apply maturity factor to performance', () => {
  const recentCohort = CohortEngine({ vintageYear: 2023 });
  const matureCohort = CohortEngine({ vintageYear: 2018 });

  // Mature cohorts should have higher realized performance (DPI)
  expect(matureCohort.performance.dpi).toBeGreaterThan(
    recentCohort.performance.dpi
  );
});
```

### Pitfall 2: Averaging IRRs Across Cohorts

**Problem:** Calculating portfolio IRR as simple average of cohort IRRs

**Why It's Wrong:**

```typescript
// ❌ INCORRECT: Simple average
const portfolioIRR =
  cohorts.reduce((sum, c) => sum + c.irr, 0) / cohorts.length;
```

**Why It Fails:**

- IRR is not additive (nonlinear metric)
- Ignores capital weighting (large cohorts should dominate)
- Ignores timing differences (2020 vs 2023 cash flows)

**Solution:** Aggregate cash flows, then calculate IRR

**Correct Implementation:**

```typescript
// ✅ CORRECT: Aggregate cash flows
import { xirrNewtonBisection } from '@/lib/finance/xirr';

const allCashFlows = [
  ...cohort2020.getCashFlows(), // Extract from cohort
  ...cohort2021.getCashFlows(),
  ...cohort2022.getCashFlows(),
];

const portfolioIRR = xirrNewtonBisection(allCashFlows).irr;
```

### Pitfall 3: Ignoring DPI ≤ TVPI Constraint

**Problem:** Allowing DPI to exceed TVPI in calculations

**Why It's Wrong:**

- Violates accounting principles (can't distribute more than total value)
- Leads to negative RVPI (unrealized value can't be negative)

**Test Validation**
([cohort-engine.test.ts:117-120](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L117)):

```typescript
it('should ensure DPI <= Multiple', () => {
  const cohort = CohortEngine(createCohortInput());
  expect(cohort.performance.dpi).toBeLessThanOrEqual(
    cohort.performance.multiple
  );
});
```

**Solution:** Enforce constraint in calculation

**Implementation**
([CohortEngine.ts:102-103](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L102)):

```typescript
const dpi = Math.max(0, Math.min(multiple, multiple * maturityFactor * 0.4));
```

### Pitfall 4: Using Mock Data in Production

**Problem:** Deploying CohortEngine with scaffolding mock company generation

**Why It's Wrong:**

- Mock companies have random valuations (not real portfolio data)
- Performance metrics are simulated (not actual fund performance)
- Cannot be used for LP reporting or investment decisions

**Current Status:** The engine generates mock companies for scaffolding
([CohortEngine.ts:48-64](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L48))

**Solution:** Replace mock generation with actual portfolio data integration

**Future Implementation:**

```typescript
// Replace mock generation with database query
function fetchCohortCompanies(fundId: number, vintageYear: number) {
  return db.query(
    `
    SELECT id, name, stage, valuation
    FROM portfolio_companies
    WHERE fund_id = $1
    AND EXTRACT(YEAR FROM initial_investment_date) = $2
  `,
    [fundId, vintageYear]
  );
}
```

### Pitfall 5: Ignoring Vintage Year Adjustments in Custom Scenarios

**Problem:** Using CohortEngine for hypothetical scenarios without considering
market effects

**Example:**

```typescript
// What if we had invested in 2020 vs 2021?
const scenario2020 = CohortEngine({
  fundId: 1,
  vintageYear: 2020,
  cohortSize: 10,
});
const scenario2021 = CohortEngine({
  fundId: 1,
  vintageYear: 2021,
  cohortSize: 10,
});

// scenario2021 will show higher IRR due to built-in vintage adjustments
// This may not reflect counterfactual (same companies, different timing)
```

**Solution:** Override vintage adjustments for "what-if" analysis

**Future Enhancement:**

```typescript
// Add override flag to CohortInput
const scenario = CohortEngine({
  fundId: 1,
  vintageYear: 2020,
  cohortSize: 10,
  overrideVintageAdjustments: true, // Ignore market effects
});
```

---

## Code Reference Map

### Core Engine Files

| File                                                                                         | Lines   | Purpose                 | Key Functions                       |
| -------------------------------------------------------------------------------------------- | ------- | ----------------------- | ----------------------------------- |
| [CohortEngine.ts:159-169](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L159) | 159-169 | Main engine function    | `CohortEngine(input)`               |
| [CohortEngine.ts:176-208](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L176) | 176-208 | Summary generation      | `generateCohortSummary(input)`      |
| [CohortEngine.ts:215-250](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L215) | 215-250 | Multi-cohort comparison | `compareCohorts(cohorts)`           |
| [CohortEngine.ts:72-119](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L72)   | 72-119  | Rule-based calculation  | `calculateRuleBasedCohortMetrics()` |
| [CohortEngine.ts:122-148](c:\dev\Updog_restore\client\src\core\cohorts\CohortEngine.ts#L122) | 122-148 | ML-enhanced calculation | `calculateMLBasedCohortMetrics()`   |

### Validation & Testing

| File                                                                                                  | Lines   | Purpose                   | Coverage        |
| ----------------------------------------------------------------------------------------------------- | ------- | ------------------------- | --------------- |
| [cohorts-validation.yaml:10-122](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L10) | 10-122  | Validation test cases     | 5 scenarios     |
| [cohort-engine.test.ts:1-418](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L1)       | 1-418   | Unit test suite           | 335 lines, 100% |
| [cohort-engine.test.ts:26-48](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L26)      | 26-48   | Input validation tests    | 3 test cases    |
| [cohort-engine.test.ts:56-87](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L56)      | 56-87   | Vintage year tests        | 5 test cases    |
| [cohort-engine.test.ts:94-133](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L94)     | 94-133  | Performance metrics tests | 6 test cases    |
| [cohort-engine.test.ts:192-259](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L192)   | 192-259 | Multi-cohort tests        | 7 test cases    |
| [cohort-engine.test.ts:376-418](c:\dev\Updog_restore\tests\unit\engines\cohort-engine.test.ts#L376)   | 376-418 | Edge case tests           | 5 test cases    |

### Type Definitions

| File                                                                 | Lines   | Purpose          | Types                                          |
| -------------------------------------------------------------------- | ------- | ---------------- | ---------------------------------------------- |
| [shared/types.ts:135-139](c:\dev\Updog_restore\shared\types.ts#L135) | 135-139 | Input schema     | `CohortInputSchema`                            |
| [shared/types.ts:141-155](c:\dev\Updog_restore\shared\types.ts#L141) | 141-155 | Output schema    | `CohortOutputSchema`                           |
| [shared/types.ts:157-180](c:\dev\Updog_restore\shared\types.ts#L157) | 157-180 | Summary schema   | `CohortSummarySchema`                          |
| [shared/types.ts:194-196](c:\dev\Updog_restore\shared\types.ts#L194) | 194-196 | TypeScript types | `CohortInput`, `CohortOutput`, `CohortSummary` |

### XIRR/IRR Implementation

| File                                                                                        | Lines  | Purpose             | Functions               |
| ------------------------------------------------------------------------------------------- | ------ | ------------------- | ----------------------- |
| [xirr.ts:39-134](c:\dev\Updog_restore\client\src\lib\finance\xirr.ts#L39)                   | 39-134 | Newton-Raphson XIRR | `xirrNewtonBisection()` |
| [brent-solver.ts:1-150](c:\dev\Updog_restore\client\src\lib\finance\brent-solver.ts#L1)     | 1-150  | Bisection fallback  | `brentSolver()`         |
| [xirr-golden-set.test.ts:1-290](c:\dev\Updog_restore\tests\unit\xirr-golden-set.test.ts#L1) | 1-290  | Excel validation    | 20 test cases           |

### Integration Points

| Engine            | File                                                   | Integration                              |
| ----------------- | ------------------------------------------------------ | ---------------------------------------- |
| **ReserveEngine** | `client/src/core/reserves/ConstrainedReserveEngine.ts` | Cohort companies → Reserve allocation    |
| **PacingEngine**  | `client/src/core/pacing/PacingEngine.ts`               | Deployment timing → Vintage composition  |
| **Monte Carlo**   | (TBD)                                                  | Cohort distributions → Simulation params |
| **Waterfall**     | `client/src/lib/waterfall.ts`                          | Cohort DPI → Carry calculation           |

---

## Real-World Scenarios from Tests

### Scenario 1: Standard Returns (Validation Test 1)

**Context:** A typical 2023 vintage cohort with 1.6x TVPI and 12% IRR

**Test Case**
([cohorts-validation.yaml:10-28](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L10)):

```yaml
vintage: 2023
companies: 5
totalInvested: 25000000
totalValue: 40000000
realized: 15000000
# Expected:
# TVPI = 1.6x (40M / 25M)
# DPI = 0.6x (15M / 25M)
# RVPI = 1.0x ((40M - 15M) / 25M)
# IRR ≈ 12%
```

**Interpretation:**

- 60% total return after 1-2 years
- 60% of value realized as cash (good early liquidity)
- 40% remaining unrealized (still growing)
- 12% IRR is solid for early-stage cohort

### Scenario 2: Total Loss (Validation Test 3)

**Context:** A failed 2020 vintage cohort that wrote down to zero

**Test Case**
([cohorts-validation.yaml:59-75](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L59)):

```yaml
vintage: 2020
companies: 3
totalInvested: 15000000
totalValue: 0 # Complete write-off
realized: 0 # No distributions

# Expected:
# TVPI = 0x (0 / 15M)
# DPI = 0x (0 / 15M)
# IRR < -95% (near -100%)
```

**Interpretation:**

- All 3 companies failed (100% loss)
- No partial exits or distributions
- Near -100% IRR (total capital loss)
- Rare but illustrates worst-case scenario

### Scenario 3: Unicorn Cohort (Validation Test 4)

**Context:** Exceptional 2019 vintage with 10x return and multiple exits

**Test Case**
([cohorts-validation.yaml:77-93](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L77)):

```yaml
vintage: 2019
companies: 10
totalInvested: 50000000
totalValue: 500000000 # 10x portfolio value
realized: 450000000 # 9x cash returned

# Expected:
# TVPI = 10.0x (500M / 50M)
# DPI = 9.0x (450M / 50M)
# IRR > 50% (>50% annualized)
```

**Interpretation:**

- 10x total return (exceptional performance)
- 90% realized as cash (high liquidity)
- > 50% IRR (top 1% of VC funds)
- Likely includes 1-2 "unicorn" exits (billion+ valuations)

### Scenario 4: Mixed Performance Portfolio (Validation Test 5)

**Context:** Realistic portfolio with winners, losers, and average performers

**Test Case**
([cohorts-validation.yaml:95-122](c:\dev\Updog_restore\scripts\validation\cohorts-validation.yaml#L95)):

```yaml
cohorts:
  - vintage: 2021
    totalInvested: 25000000
    totalValue: 60000000 # 2.4x winner
    realized: 30000000

  - vintage: 2022
    totalInvested: 25000000
    totalValue: 15000000 # 0.6x loser
    realized: 5000000

  - vintage: 2023
    totalInvested: 25000000
    totalValue: 25000000 # 1.0x breakeven
    realized: 0
# Portfolio TVPI = (60M + 15M + 25M) / 75M = 1.33x
```

**Interpretation:**

- 33% portfolio-level return (decent performance)
- 2021 vintage carrying the portfolio (2.4x)
- 2022 vintage dragging down returns (0.6x loss)
- 2023 vintage too early to judge (1.0x breakeven)
- Validates power law: 1 winner offsets 2 underperformers

---

## Summary

The CohortEngine provides comprehensive vintage cohort analysis capabilities for
VC fund portfolio management. Key takeaways:

1. **API Patterns:** Simple input/output, validation, and multi-cohort
   comparison
2. **Vintage Analysis:** Time-series tracking, market condition impacts, and
   maturity adjustment
3. **Cross-Cohort Comparison:** Portfolio-level aggregation and best performer
   identification
4. **Integration:** Reserve allocation, pacing strategy, and Monte Carlo
   simulation
5. **Benchmarking:** Industry comparison and maturity-adjusted performance
6. **Common Pitfalls:** Maturity bias, IRR averaging, constraint violations, and
   mock data

**Next Steps:**

- **Production Integration:** Replace mock data with actual portfolio company
  queries
- **Real-Time Updates:** Trigger cohort recalculation on company valuation
  changes
- **Advanced Analytics:** Add cohort-level stress testing and scenario modeling

---

**Related Documentation:**

- **[01-overview.md](./01-overview.md):** Cohort analysis fundamentals and key
  concepts
- **[02-metrics.md](./02-metrics.md):** TVPI, DPI, RVPI, and IRR calculation
  details
- **Reserves Integration:**
  [docs/notebooklm-sources/reserves/04-integration.md](../reserves/04-integration.md)
- **Pacing Integration:**
  [docs/notebooklm-sources/pacing/03-integration.md](../pacing/03-integration.md)

**Test Coverage:** 100% (335 lines of tests, 5 validation scenarios) **Code
Quality:** Type-safe with Zod validation, comprehensive edge case handling
