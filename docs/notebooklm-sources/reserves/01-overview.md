---
status: ACTIVE
last_updated: 2026-01-19
---

# Reserve Allocation Engine - Overview

**Module:** `client/src/core/reserves/ConstrainedReserveEngine.ts` **Purpose:**
Deterministic, constraint-based allocation of follow-on reserves across
portfolio companies **Last Updated:** 2025-11-06

---

## Table of Contents

1. [What is Reserve Allocation?](#what-is-reserve-allocation)
2. [Key Concepts](#key-concepts)
3. [High-Level Algorithm](#high-level-algorithm)
4. [When to Use This Engine](#when-to-use-this-engine)
5. [Related Components](#related-components)

---

## What is Reserve Allocation?

**Reserve allocation** is the strategic process of earmarking capital from a
venture fund's uncommitted funds for future follow-on investments in existing
portfolio companies. This enables GPs to:

- **Maintain ownership percentage** through pro-rata participation in subsequent
  rounds
- **Double down on winners** by allocating more to high-performing companies
- **Support portfolio companies** through multiple stages of growth (Seed →
  Series A → Series B → Series C)
- **Optimize capital efficiency** by prioritizing companies with highest
  expected returns

### Why Reserve Allocation Matters

In venture capital, **initial investments are just the beginning**. A typical VC
fund:

- Makes initial investments of $500K-$2M per company
- Reserves 2-3x the initial investment for follow-on rounds
- Uses 40-60% of total fund capital for reserves (not initial investments)
- Achieves portfolio-level returns heavily influenced by reserve allocation
  strategy

**Example:** A $100M fund might deploy:

- $40M in initial investments (30-40 companies)
- $60M in follow-on reserves (concentrated in 10-15 winners)

The **reserve allocation algorithm** determines which companies receive
follow-on capital and how much.

---

## Key Concepts

### 1. Available Reserves

**Definition:** Capital remaining in the fund that can be allocated to follow-on
investments.

**Calculation:**

```
availableReserves = totalFundCapital - deployedCapital - committedReserves
```

**Example:**

- Total fund: $100M
- Already deployed: $60M
- Already committed to specific follow-ons: $25M
- **Available reserves: $15M**

**Edge Cases:**

- Zero available reserves → No allocations possible (see
  [03-examples.md](./03-examples.md#zero-reserves-scenario))
- Negative reserves → Invalid input (validation error)

### 2. Reserve Multiple

**Definition:** The ratio of planned follow-on investment to initial investment.

**Formula:**

```
reserveAmount = initialInvestment × reserveMultiple
```

**Typical Values:**

- **Seed stage:** 3.0x (higher risk, more capital needed for graduation)
- **Series A:** 2.0x (moderate risk, standard follow-on)
- **Series B:** 1.5x (lower risk, smaller top-ups)
- **Series C+:** 1.0x (minimal follow-on, near exit)

**Example:**

- Initial investment: $5M in Series A
- Reserve multiple: 2.0
- **Planned reserve: $10M**

**Why Multiple Varies by Stage:**

- Earlier stages require more capital to reach next milestone
- Failure rates decrease at later stages (less reserve needed)
- Ownership dilution is higher early (need more capital to maintain)

### 3. Deployment Constraints

The engine respects multiple constraints to ensure allocation realism:

#### a. Minimum Check Size (`minCheck`)

**Purpose:** Avoid "micro-allocations" that aren't worth the operational
overhead.

**Example:**

- `minCheck: $50K`
- Company would receive $30K → **Skipped** (below minimum)
- Company would receive $75K → **Allocated** (above minimum)

**Rationale:** Writing a $10K check has same legal/admin cost as $1M check.

#### b. Maximum Per Company (`maxPerCompany`)

**Purpose:** Prevent over-concentration in a single company.

**Example:**

- `maxPerCompany: $10M`
- Algorithm wants to allocate $15M to top company → **Clamped to $10M**

**Rationale:** Diversification risk management, avoid "all eggs in one basket."

#### c. Maximum Per Stage (`maxPerStage`)

**Purpose:** Maintain stage diversification across the portfolio.

**Example:**

```typescript
maxPerStage: {
  seed: $5M,
  series_a: $15M,
  series_b: $20M
}
```

If Series A companies have already received $15M in reserves:

- Next Series A company requesting $3M → **Skipped** (stage cap reached)

**Rationale:** Stage concentration risk (e.g., all reserves in late-stage = no
dry powder for early winners).

#### d. Discount Rate (`discountRateAnnual`)

**Purpose:** Time-value of money adjustment for future capital deployment.

**Default:** 12% annually (typical VC hurdle rate)

**Formula:**

```
presentValue = futureAllocation / (1 + discountRate)^years
```

**Example:**

- Planned allocation in 3 years: $1M
- Discount rate: 12%
- **Present value: $711,780**

**Rationale:** Capital deployed today is more valuable than capital deployed in
5 years.

### 4. Graduation Probabilities

**Definition:** Likelihood a company "graduates" from one stage to the next
(rather than failing or stagnating).

**Default Values:**

```typescript
graduationProb: {
  preseed: 0.10,    // 10% make it to Seed
  seed: 0.20,       // 20% make it to Series A
  series_a: 0.35,   // 35% make it to Series B
  series_b: 0.50,   // 50% make it to Series C
  series_c: 0.65,   // 65% make it to Series D+
  series_dplus: 0.80 // 80% exit successfully
}
```

**Usage:** Higher graduation probability → higher allocation priority (expected
value calculation).

**Data Source:** Industry benchmarks from Carta, PitchBook, Cambridge
Associates.

### 5. Graduation Timeline

**Definition:** Expected time (in years) from current stage to successful exit.

**Default Values:**

```typescript
graduationYears: {
  preseed: 8,      // 8 years to exit
  seed: 7,         // 7 years to exit
  series_a: 6,     // 6 years to exit
  series_b: 5,     // 5 years to exit
  series_c: 4,     // 4 years to exit
  series_dplus: 3  // 3 years to exit
}
```

**Usage:** Combined with discount rate for present value calculations.

### 6. Stage Policy

**Definition:** Configuration that defines reserve strategy per investment
stage.

**Schema:**

```typescript
interface StagePolicy {
  stage: Stage; // e.g., 'series_a'
  reserveMultiple: number; // e.g., 2.0 (2x initial investment)
  weight: number; // e.g., 1.0 (relative priority)
}
```

**Example:**

```typescript
stagePolicies: [
  { stage: 'seed', reserveMultiple: 3.0, weight: 1.2 }, // High priority
  { stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 }, // Standard
  { stage: 'series_b', reserveMultiple: 1.5, weight: 0.8 }, // Lower priority
];
```

**Weight Interpretation:**

- Weight > 1.0 = Higher allocation priority (e.g., strategic focus on Seed)
- Weight = 1.0 = Standard priority
- Weight < 1.0 = Lower priority (e.g., de-emphasize late-stage)

---

## High-Level Algorithm

The `ConstrainedReserveEngine` uses a **priority-based, greedy allocation**
algorithm:

### Step 1: Scoring

For each company, calculate a priority score:

```
score = reserveMultiple × graduationProbability × weight / (1 + discountRate)^years
```

**Factors:**

- Higher reserve multiple → Higher score (more capital needed)
- Higher graduation probability → Higher score (more likely to succeed)
- Higher policy weight → Higher score (strategic priority)
- Farther in future → Lower score (time discount)

### Step 2: Ranking

Sort companies by score (highest to lowest).

### Step 3: Greedy Allocation

Iterate through sorted companies:

1. Calculate maximum allocation = `min(remainingCapital, stageCap, companyCap)`
2. Check minimum check constraint
3. Allocate maximum possible to current company
4. Subtract from remaining capital
5. Continue until capital exhausted or no valid allocations remain

### Step 4: Conservation Check

Verify total allocated + remaining = initial available reserves (no money
created/lost).

**Algorithm Properties:**

- **Deterministic:** Same inputs always produce same outputs
- **Greedy:** Prioritizes highest-scoring companies first (no backtracking)
- **Constrained:** Respects all deployment limits
- **Conservative:** Never over-allocates (total ≤ available)

**Why Greedy?**

- Optimal for VC context (back winners aggressively)
- Computationally efficient (O(n log n) sorting + O(n) allocation)
- Predictable behavior (no complex optimization artifacts)

**Tradeoffs Accepted:**

- May not perfectly balance stage diversification (manual tuning via
  `maxPerStage`)
- No portfolio-wide optimization (focuses on individual company merit)

---

## When to Use This Engine

### Use Cases

✅ **Follow-on reserve planning** for multi-stage venture funds ✅ **Scenario
modeling** (what-if analysis with different constraints) ✅ **LP reporting**
(show reserve allocation strategy) ✅ **Capital call planning** (when to call
capital from LPs) ✅ **Portfolio construction** (optimize initial + reserve
allocation together)

### When NOT to Use

❌ **Angel investing** (typically no formal reserve strategy) ❌ **Single-stage
funds** (e.g., only Seed, no follow-ons) ❌ **Fully deployed funds** (no capital
left to allocate) ❌ **Real-time trading decisions** (this is strategic
planning, not execution)

### Comparison to Other Engines

| Engine                         | Purpose                      | Output                                          |
| ------------------------------ | ---------------------------- | ----------------------------------------------- |
| **ConstrainedReserveEngine**   | Follow-on capital allocation | Company-level reserve amounts                   |
| **DeterministicReserveEngine** | MOIC-based reserve strategy  | Priority-ranked allocations with expected value |
| **PacingEngine**               | Deployment timing            | Quarterly capital deployment schedule           |
| **CohortEngine**               | Vintage analysis             | Performance by investment year                  |
| **MonteCarloEngine**           | Portfolio simulation         | Distribution of fund-level returns              |

**Integration:** Reserve allocations from this engine feed into:

- **PacingEngine:** When to deploy these reserves (quarterly schedule)
- **MonteCarloEngine:** Simulate portfolio outcomes with these reserves
- **CohortEngine:** Analyze reserve performance by vintage

---

## Related Components

### Dependencies

**Schemas:**

- `shared/schemas.ts` - `ReserveInputSchema`, `StagePolicySchema`,
  `ConstraintsSchema`
- `shared/money.ts` - `Cents` type, `toCents()`, `fromCents()`,
  `conservationCheck()`

**Related Engines:**

- `client/src/core/reserves/DeterministicReserveEngine.ts` - Alternative
  MOIC-based algorithm
- `client/src/core/pacing/PacingEngine.ts` - Deployment timing
- `client/src/core/cohorts/CohortEngine.ts` - Vintage analysis

**API Endpoints:**

- `server/routes/reserves.ts` - Reserve calculation endpoints
- Integration with fund management workflows

### Testing

**Test Files:**

- `client/src/core/reserves/__tests__/reserves.spec.ts` - Unit tests
- `client/src/core/reserves/__tests__/reserves.property.test.ts` -
  Property-based tests
- `scripts/validation/reserves-validation.yaml` - Promptfoo validation suite

**Test Coverage:**

- 5 core invariants (conservation, non-negativity, monotonicity, graduation
  impact, idempotence)
- 8 boundary conditions (zero capital, max deployment, concentration limits)
- 12 edge cases (multi-vintage, stage caps, rounding)

### Documentation

**Next Steps:**

- [02-algorithms.md](./02-algorithms.md) - Detailed algorithm walkthrough
- [03-examples.md](./03-examples.md) - Real-world scenarios and edge cases
- [04-integration.md](./04-integration.md) - API usage and integration patterns

**Related Documentation:**

- [Capital Allocation](../capital-allocation.md) - Initial investment allocation
- [Pacing](../pacing/) - Deployment timing strategies

---

## Quick Start Example

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

// Configure engine
const engine = new ConstrainedReserveEngine();

// Define input
const input = {
  availableReserves: 15_000_000, // $15M available

  companies: [
    {
      id: 'co-1',
      name: 'Acme Corp',
      stage: 'series_a',
      invested: 5_000_000, // $5M initial investment
      ownership: 0.15,
    },
  ],

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 2.0, // Reserve 2x initial
      weight: 1.0,
    },
  ],

  constraints: {
    minCheck: 50_000, // $50K minimum
    maxPerCompany: 10_000_000, // $10M maximum per company
  },
};

// Calculate allocations
const result = engine.calculate(input);

// Output:
// {
//   allocations: [
//     {
//       id: 'co-1',
//       name: 'Acme Corp',
//       stage: 'series_a',
//       allocated: 10_000_000  // $10M (2x $5M initial)
//     }
//   ],
//   totalAllocated: 10_000_000,
//   remaining: 5_000_000,
//   conservationOk: true
// }
```

**Next:** See [02-algorithms.md](./02-algorithms.md) for detailed algorithm
explanation.
