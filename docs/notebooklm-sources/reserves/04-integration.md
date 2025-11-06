# Reserve Allocation Engine - Integration

**Module:** `client/src/core/reserves/ConstrainedReserveEngine.ts` **Purpose:**
API usage patterns, integration with other engines, performance considerations
**Last Updated:** 2025-11-06

---

## Table of Contents

1. [API Usage Patterns](#api-usage-patterns)
2. [Integration with Other Engines](#integration-with-other-engines)
3. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
4. [Performance Considerations](#performance-considerations)
5. [Testing and Validation](#testing-and-validation)

---

## API Usage Patterns

### Basic Usage

**Import:**

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import type { ReserveInput } from '@shared/schemas';
```

**Instantiation:**

```typescript
const engine = new ConstrainedReserveEngine();
```

**Note:** Engine is stateless - safe to create once and reuse, or create
per-calculation.

### Input Construction

**Pattern 1: Direct Object Construction**

```typescript
const input: ReserveInput = {
  availableReserves: 15_000_000,

  companies: [
    {
      id: 'co-1',
      name: 'Acme Corp',
      stage: 'series_a',
      invested: 5_000_000,
      ownership: 0.15,
    },
  ],

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 2.0,
      weight: 1.0,
    },
  ],

  constraints: {
    minCheck: 50_000,
    maxPerCompany: 10_000_000,
    discountRateAnnual: 0.12,
  },
};

const result = engine.calculate(input);
```

**Pattern 2: From Database Query**

```typescript
import { db } from '@/lib/db';
import { companies, funds } from '@shared/db/schema';

async function calculateReservesForFund(fundId: string) {
  // Fetch fund data
  const fund = await db.query.funds.findFirst({
    where: eq(funds.id, fundId),
  });

  // Fetch portfolio companies
  const portfolioCompanies = await db.query.companies.findMany({
    where: eq(companies.fundId, fundId),
  });

  // Build input
  const input: ReserveInput = {
    availableReserves:
      fund.totalCapital - fund.deployedCapital - fund.committedReserves,

    companies: portfolioCompanies.map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.currentStage,
      invested: c.totalInvested,
      ownership: c.ownershipPercentage,
    })),

    stagePolicies: fund.stagePolicies, // Stored as JSON in DB
    constraints: fund.reserveConstraints,
  };

  const result = engine.calculate(input);
  return result;
}
```

**Pattern 3: From API Request**

```typescript
import { Request, Response } from 'express';
import { validateReserveInput } from '@shared/schemas';

export async function calculateReservesHandler(req: Request, res: Response) {
  // Validate input
  const validation = validateReserveInput(req.body);

  if (!validation.ok) {
    return res.status(validation.status).json({
      error: 'Invalid input',
      issues: validation.issues,
    });
  }

  // Calculate
  const engine = new ConstrainedReserveEngine();
  const result = engine.calculate(validation.data);

  // Check conservation
  if (!result.conservationOk) {
    return res.status(500).json({
      error: 'Conservation check failed',
      result,
    });
  }

  return res.json(result);
}
```

### Output Handling

**Type-Safe Access:**

```typescript
const result = engine.calculate(input);

// result type:
// {
//   allocations: Array<{
//     id: string;
//     name: string;
//     stage: Stage;
//     allocated: number;
//   }>;
//   totalAllocated: number;
//   remaining: number;
//   conservationOk: boolean;
// }

// Access allocations
result.allocations.forEach((allocation) => {
  console.log(`${allocation.name}: $${allocation.allocated.toLocaleString()}`);
});

// Check if capital exhausted
if (result.remaining === 0) {
  console.log('All available reserves allocated');
}

// Verify integrity
if (!result.conservationOk) {
  throw new Error('Conservation check failed - data integrity issue');
}
```

**Filtering Allocations:**

```typescript
// Get only Series A allocations
const seriesAAllocations = result.allocations.filter(
  (a) => a.stage === 'series_a'
);

// Get top 5 allocations by amount
const topAllocations = [...result.allocations]
  .sort((a, b) => b.allocated - a.allocated)
  .slice(0, 5);

// Get companies that received allocations
const fundedCompanyIds = result.allocations.map((a) => a.id);

// Get companies that didn't receive allocations
const unfundedCompanies = input.companies.filter(
  (c) => !fundedCompanyIds.includes(c.id)
);
```

### Error Handling

**Pattern 1: Try-Catch**

```typescript
try {
  const result = engine.calculate(input);

  if (!result.conservationOk) {
    // Log warning but continue (shouldn't happen with correct implementation)
    console.warn('Conservation check failed', result);
  }

  return result;
} catch (error) {
  if (error instanceof Error && 'status' in error) {
    // Known error (e.g., missing stage policy)
    throw { status: (error as any).status, message: error.message };
  }

  // Unexpected error
  console.error('Reserve calculation failed', error);
  throw error;
}
```

**Pattern 2: Validation First**

```typescript
import { validateReserveInput } from '@shared/schemas';

function safeCalculateReserves(input: unknown) {
  // Validate input schema
  const validation = validateReserveInput(input);

  if (!validation.ok) {
    return {
      success: false,
      error: 'Invalid input',
      issues: validation.issues,
    };
  }

  // Calculate
  try {
    const engine = new ConstrainedReserveEngine();
    const result = engine.calculate(validation.data);

    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

---

## Integration with Other Engines

### Integration 1: PacingEngine (Deployment Timing)

**Use Case:** Determine **when** to deploy reserves calculated by ReserveEngine.

**Flow:**

```
ReserveEngine
  ↓ (allocations by company)
PacingEngine
  ↓ (allocations by quarter)
Calendar Schedule
```

**Example:**

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import { PacingEngine } from '@/core/pacing/PacingEngine';

// Step 1: Calculate reserves
const reserveEngine = new ConstrainedReserveEngine();
const reserves = reserveEngine.calculate(reserveInput);

// Step 2: Convert to pacing input
const pacingInput = {
  totalCapital: reserves.totalAllocated,
  deploymentStrategy: 'STAGED', // Deploy over multiple quarters
  horizonQuarters: 12, // Over next 3 years
  companies: reserves.allocations.map((a) => ({
    id: a.id,
    name: a.name,
    targetAllocation: a.allocated,
    stage: a.stage,
    urgency: a.stage === 'seed' ? 'high' : 'medium',
  })),
};

// Step 3: Generate pacing schedule
const pacingEngine = new PacingEngine();
const schedule = pacingEngine.calculateDeploymentSchedule(pacingInput);

// Output: Quarterly deployment plan
// Q1 2025: $3M (Seed Co, urgent)
// Q2 2025: $5M (Series A Co 1)
// Q3 2025: $4M (Series A Co 2)
// Q4 2025: $3M (Series B Co)
```

**Key Consideration:** PacingEngine respects reserve priorities from
ReserveEngine.

---

### Integration 2: CohortEngine (Vintage Analysis)

**Use Case:** Analyze reserve allocation by investment vintage.

**Flow:**

```
ReserveEngine
  ↓ (allocations by company)
CohortEngine
  ↓ (metrics by vintage year)
Vintage Performance Report
```

**Example:**

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import { CohortEngine } from '@/core/cohorts/CohortEngine';

// Step 1: Calculate reserves
const reserves = engine.calculate(reserveInput);

// Step 2: Enrich with vintage data
const vintageAllocations = reserves.allocations.map((a) => {
  const company = input.companies.find((c) => c.id === a.id);
  return {
    ...a,
    vintage: company.vintage,
    initialInvestment: company.invested,
  };
});

// Step 3: Analyze by cohort
const cohortEngine = new CohortEngine();
const cohortAnalysis = cohortEngine.analyzeByVintage(vintageAllocations);

// Output: Reserve allocation by vintage
// 2023 Cohort: $15M reserves (3 companies)
// 2024 Cohort: $10M reserves (5 companies)
// 2025 Cohort: $5M reserves (2 companies)
```

**Metrics:**

- Reserve/initial investment ratio by vintage
- Stage distribution by vintage
- Capital efficiency by vintage

---

### Integration 3: MonteCarloEngine (Portfolio Simulation)

**Use Case:** Simulate portfolio outcomes using reserve allocations.

**Flow:**

```
ReserveEngine
  ↓ (allocations by company)
MonteCarloEngine
  ↓ (10,000 simulations)
Distribution of Fund Returns
```

**Example:**

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import { MonteCarloEngine } from '@/core/monte-carlo/MonteCarloEngine';

// Step 1: Calculate reserves
const reserves = engine.calculate(reserveInput);

// Step 2: Build portfolio for simulation
const portfolio = reserves.allocations.map((a) => ({
  companyId: a.id,
  totalInvested:
    input.companies.find((c) => c.id === a.id)!.invested + a.allocated,
  stage: a.stage,
  exitProbability: input.constraints?.graduationProb?.[a.stage] ?? 0.5,
}));

// Step 3: Run Monte Carlo simulation
const monteCarloEngine = new MonteCarloEngine();
const simulation = monteCarloEngine.simulate({
  portfolio,
  scenarios: 10_000,
  timeHorizon: 10, // 10 years
  exitMultiples: {
    seed: { mean: 10.0, stdDev: 8.0 },
    series_a: { mean: 5.0, stdDev: 3.0 },
    series_b: { mean: 3.0, stdDev: 1.5 },
  },
});

// Output: Expected fund MOIC distribution
// P10: 1.2x (downside)
// P50: 2.8x (median)
// P90: 6.5x (upside)
```

**Key Insight:** Reserve allocations significantly impact simulated returns.

---

### Integration 4: CapitalAllocation (Initial + Reserve)

**Use Case:** Optimize both initial investments and follow-on reserves together.

**Flow:**

```
CapitalAllocationEngine
  ↓ (initial investments)
ReserveEngine
  ↓ (follow-on reserves)
Complete Capital Plan
```

**Example:**

```typescript
import { CapitalAllocationEngine } from '@/core/capital-allocation/CapitalAllocationEngine';
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

const totalFund = 100_000_000; // $100M fund

// Step 1: Allocate initial investments
const capitalEngine = new CapitalAllocationEngine();
const initialAllocation = capitalEngine.allocate({
  totalCapital: totalFund * 0.4, // 40% for initial investments
  mode: 'WEIGHTED',
  companies: targetCompanies,
  weights: strategyWeights,
});

// Step 2: Calculate reserves
const reserveEngine = new ConstrainedReserveEngine();
const reserves = reserveEngine.calculate({
  availableReserves: totalFund * 0.6, // 60% for reserves
  companies: initialAllocation.allocations.map((a) => ({
    id: a.companyId,
    name: a.companyName,
    stage: a.stage,
    invested: a.amount,
    ownership: a.ownershipTarget,
  })),
  stagePolicies: reserveStrategies,
  constraints: reserveConstraints,
});

// Combined capital plan
const capitalPlan = {
  initial: initialAllocation,
  reserves: reserves,
  totalDeployed: initialAllocation.totalAllocated,
  totalReserved: reserves.totalAllocated,
  totalCommitted: initialAllocation.totalAllocated + reserves.totalAllocated,
};
```

**Output:**

```typescript
{
  initial: {
    totalAllocated: 40_000_000,    // $40M initial
    allocations: [...]
  },
  reserves: {
    totalAllocated: 55_000_000,    // $55M reserves
    remaining: 5_000_000,          // $5M dry powder
    allocations: [...]
  },
  totalCommitted: 95_000_000       // 95% of fund committed
}
```

---

## Common Pitfalls and Solutions

### Pitfall 1: Not Validating Input

**Problem:** Passing invalid data to engine, causing runtime errors.

**Bad:**

```typescript
const result = engine.calculate(untrustedInput); // May throw
```

**Good:**

```typescript
import { validateReserveInput } from '@shared/schemas';

const validation = validateReserveInput(untrustedInput);

if (!validation.ok) {
  throw new Error(`Validation failed: ${JSON.stringify(validation.issues)}`);
}

const result = engine.calculate(validation.data);
```

**Why:** Schema validation catches:

- Missing required fields
- Invalid stage names
- Negative values
- Type mismatches

---

### Pitfall 2: Ignoring Conservation Check

**Problem:** Not verifying `conservationOk` flag in output.

**Bad:**

```typescript
const result = engine.calculate(input);
// Assume result is valid, proceed
saveToDatabase(result);
```

**Good:**

```typescript
const result = engine.calculate(input);

if (!result.conservationOk) {
  // Log for investigation
  console.error('Conservation check failed', {
    input,
    result,
    expected: input.availableReserves,
    actual: result.totalAllocated + result.remaining,
  });

  // Throw or handle
  throw new Error('Data integrity violation - conservation check failed');
}

saveToDatabase(result);
```

**Why:** Conservation failure indicates:

- Bug in allocation logic
- Floating-point precision error (shouldn't happen with BigInt)
- Data corruption

---

### Pitfall 3: Mutating Input Objects

**Problem:** Modifying input after calling `calculate()`, expecting changes to
reflect.

**Bad:**

```typescript
const input = { ... };
const result1 = engine.calculate(input);

// Modify input
input.companies[0].invested = 10_000_000;

const result2 = engine.calculate(input);
// result2 !== result1 (as expected, but may cause confusion)
```

**Good:**

```typescript
const baseInput = { ... };

// Scenario 1: Original
const result1 = engine.calculate(baseInput);

// Scenario 2: Modified (create new object)
const modifiedInput = {
  ...baseInput,
  companies: baseInput.companies.map(c =>
    c.id === 'target-id' ? { ...c, invested: 10_000_000 } : c
  )
};

const result2 = engine.calculate(modifiedInput);
```

**Why:** Engine doesn't mutate input, so changes must be in new input objects.

---

### Pitfall 4: Assuming Allocations Sum to Available Reserves

**Problem:** Expecting `totalAllocated === availableReserves` (not always true).

**Bad:**

```typescript
const result = engine.calculate(input);

// WRONG: This may not be true
assert(result.totalAllocated === input.availableReserves);
```

**Correct Understanding:**

```typescript
const result = engine.calculate(input);

// CORRECT: Total + remaining = available
assert(result.totalAllocated + result.remaining === input.availableReserves);

// Reasons for remaining > 0:
// 1. Minimum check constraint (allocations below minCheck skipped)
// 2. Stage caps exhausted (can't allocate to more companies in stage)
// 3. Company caps exhausted (can't allocate more to any company)
```

**Example:**

```typescript
// Scenario: Small remaining capital below min check
availableReserves: $10.5M
allocated: $10M (to high-priority companies)
remaining: $500K (next company needs $1M, below min check)

// Result: $500K left unallocated
```

---

### Pitfall 5: Not Handling Missing Stage Policies

**Problem:** Company stage doesn't have corresponding policy in `stagePolicies`.

**Bad:**

```typescript
const input = {
  companies: [
    { id: 'co-1', stage: 'series_c', ... }  // ← No policy for series_c
  ],
  stagePolicies: [
    { stage: 'seed', ... },
    { stage: 'series_a', ... }
    // Missing: series_c
  ]
};

const result = engine.calculate(input);  // ← THROWS ERROR
```

**Good:**

```typescript
// Option 1: Validate before calculation
const stageSet = new Set(input.stagePolicies.map((p) => p.stage));
const missingStages = input.companies
  .map((c) => c.stage)
  .filter((stage) => !stageSet.has(stage));

if (missingStages.length > 0) {
  throw new Error(`Missing policies for stages: ${missingStages.join(', ')}`);
}

// Option 2: Add default policies
const allStages = [
  'preseed',
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'series_dplus',
];
const defaultPolicies = allStages.map((stage) => ({
  stage,
  reserveMultiple: 2.0,
  weight: 1.0,
}));

const inputWithDefaults = {
  ...input,
  stagePolicies: [
    ...input.stagePolicies,
    ...defaultPolicies.filter((p) => !stageSet.has(p.stage)),
  ],
};

const result = engine.calculate(inputWithDefaults);
```

---

### Pitfall 6: Precision Loss with Large Numbers

**Problem:** JavaScript numbers lose precision above ~$9 quadrillion.

**Safe:**

```typescript
const input = {
  availableReserves: 100_000_000,  // $100M - SAFE
  companies: [
    { invested: 5_000_000, ... }   // $5M - SAFE
  ]
};
```

**Unsafe (but unlikely):**

```typescript
const input = {
  availableReserves: 10_000_000_000_000_000, // $10 quadrillion - UNSAFE
  // ← Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991
};
```

**Solution:** Engine uses `BigInt` internally (via `Cents` type), so precision
is maintained up to 2^53 cents = ~$90 trillion.

---

## Performance Considerations

### Time Complexity Analysis

**Phases:**

1. **Parsing:** O(n) - iterate companies
2. **Scoring:** O(n) - calculate score per company
3. **Sorting:** O(n log n) - sort by score
4. **Allocation:** O(n) - greedy iteration
5. **Output:** O(n) - filter and map

**Dominant:** O(n log n) sorting

**Benchmarks:**

```typescript
// n = 10 companies: < 1ms
// n = 100 companies: ~5ms
// n = 1,000 companies: ~50ms
// n = 10,000 companies: ~500ms
```

**Real-World:** Typical portfolio (30-50 companies) executes in < 2ms.

### Memory Usage

**Storage:**

- Input: O(n) companies + O(s) stage policies
- Intermediate: O(n) sorted companies
- Output: O(m) allocations (where m ≤ n)

**Total:** O(n) linear in portfolio size

**Example:**

```typescript
// 100 companies
// ~50 bytes per company
// Total: ~5KB memory
```

**Scaling:** Can handle 10,000+ company portfolios without memory issues.

### Optimization Tips

**Tip 1: Reuse Engine Instance**

```typescript
// GOOD: Reuse stateless engine
const engine = new ConstrainedReserveEngine();

for (const scenario of scenarios) {
  const result = engine.calculate(scenario); // Fast
}
```

**Tip 2: Cache Validation Results**

```typescript
// If input is used multiple times, validate once
const validation = validateReserveInput(rawInput);

if (validation.ok) {
  const validInput = validation.data;

  // Use validInput multiple times (no re-validation needed)
  const result1 = engine.calculate(validInput);
  const result2 = engine.calculate(validInput); // Deterministic, same output
}
```

**Tip 3: Filter Companies Before Calculation**

```typescript
// Remove inactive companies before calculation
const activeCompanies = allCompanies.filter(c => c.isActive);

const input = {
  companies: activeCompanies,  // Smaller input = faster
  ...
};
```

**Tip 4: Parallelize Multiple Scenarios**

```typescript
// Calculate multiple scenarios in parallel
const scenarios = [scenario1, scenario2, scenario3];

const results = await Promise.all(
  scenarios.map(async (scenario) => {
    const engine = new ConstrainedReserveEngine();
    return engine.calculate(scenario);
  })
);
```

---

## Testing and Validation

### Unit Testing Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

describe('ConstrainedReserveEngine', () => {
  it('should allocate reserves proportionally', () => {
    const engine = new ConstrainedReserveEngine();

    const input = {
      availableReserves: 10_000_000,
      companies: [
        {
          id: 'co-1',
          name: 'Co 1',
          stage: 'series_a',
          invested: 5_000_000,
          ownership: 0.15,
        },
      ],
      stagePolicies: [{ stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 }],
    };

    const result = engine.calculate(input);

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].allocated).toBe(10_000_000);
    expect(result.conservationOk).toBe(true);
  });
});
```

### Property-Based Testing

**From:**
[reserves.property.test.ts](c:/dev/Updog_restore/client/src/core/reserves/__tests__/reserves.property.test.ts)

```typescript
import fc from 'fast-check';

it('conserves total reserves', () => {
  fc.assert(
    fc.property(
      reserveAllocationInputArbitrary, // Generate random inputs
      async (input) => {
        const engine = new ConstrainedReserveEngine();
        const result = await engine.calculate(input);

        const totalAllocated = result.allocations.reduce(
          (sum, a) => sum + a.allocated,
          0
        );

        // Invariant: total + remaining = available
        expect(totalAllocated + result.remaining).toBeCloseTo(
          input.availableReserves
        );
      }
    ),
    { numRuns: 50 } // Test 50 random scenarios
  );
});
```

**Covered Invariants:**

1. Conservation (sum preservation)
2. Non-negativity (no negative allocations)
3. Monotonicity (higher score = higher priority)
4. Graduation impact (probability affects allocation)
5. Idempotence (same input = same output)

### Integration Testing Pattern

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';
import { PacingEngine } from '@/core/pacing/PacingEngine';

describe('Reserve + Pacing Integration', () => {
  let reserveEngine: ConstrainedReserveEngine;
  let pacingEngine: PacingEngine;

  beforeEach(() => {
    reserveEngine = new ConstrainedReserveEngine();
    pacingEngine = new PacingEngine();
  });

  it('should generate valid pacing schedule from reserves', () => {
    // Step 1: Calculate reserves
    const reserves = reserveEngine.calculate(reserveInput);

    // Step 2: Generate pacing schedule
    const pacingInput = buildPacingInput(reserves);
    const schedule = pacingEngine.calculateSchedule(pacingInput);

    // Verify integration
    expect(schedule.totalDeployment).toBe(reserves.totalAllocated);
    expect(schedule.quarters.length).toBeGreaterThan(0);
  });
});
```

---

## Summary

**Key Takeaways:**

- ✓ Validate input before calculation (`validateReserveInput`)
- ✓ Check `conservationOk` flag in output
- ✓ Understand that `totalAllocated + remaining = availableReserves` (not
  necessarily `totalAllocated = availableReserves`)
- ✓ Handle missing stage policies gracefully
- ✓ Integrate with PacingEngine, CohortEngine, MonteCarloEngine for complete
  portfolio analysis
- ✓ Performance: O(n log n) time, O(n) space, < 2ms for typical portfolios
- ✓ Test with property-based tests for invariant verification

**Next Steps:**

- [01-overview.md](./01-overview.md) - Conceptual overview
- [02-algorithms.md](./02-algorithms.md) - Algorithm details
- [03-examples.md](./03-examples.md) - Usage examples

**Related Engines:**

- [PacingEngine](../pacing/) - Deployment timing
- [CohortEngine](../cohorts/) - Vintage analysis
- [MonteCarloEngine](../monte-carlo/) - Portfolio simulation
- [CapitalAllocationEngine](../capital-allocation.md) - Initial investment
  allocation

**References:**

- [Implementation](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts)
- [Schemas](c:/dev/Updog_restore/shared/schemas.ts)
- [Tests](c:/dev/Updog_restore/client/src/core/reserves/__tests__)
- [Validation](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml)
