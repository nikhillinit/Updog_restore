## Fund Modeling Schema System

### Overview

Production-grade TypeScript schemas for VC fund modeling, designed to replace hard-coded MVP assumptions with flexible, validated, and deterministic parameters.

### Architecture

The schema system uses:
- **Zod** for runtime validation and type inference
- **Decimal.js** for high-precision financial calculations
- **Discriminated unions** for type-safe policy variants
- **Fractional counts** for deterministic cohort math

### Core Schemas

#### 1. StageProfile

Replaces hard-coded exit "buckets" with stage-driven valuations and progression rates.

```typescript
import { StageProfileSchema, calculateCohortProgression } from '@shared/schemas';

const profile = {
  id: 'early-stage-v1',
  name: 'Early Stage Focus',
  initialPortfolioSize: new Decimal(25.5), // Fractional for determinism
  stages: [
    {
      stage: 'seed',
      roundSize: new Decimal(2000000),
      postMoneyValuation: new Decimal(15000000),
      esopPercent: new Decimal(0.15),
      graduationRate: new Decimal(0.4),  // 40% to Series A
      exitRate: new Decimal(0.1),        // 10% exit
      // failureRate: 0.5 (derived automatically)
      monthsToGraduate: 24,
      monthsToExit: 60,
      exitMultiple: new Decimal(3),
      dilutionPerRound: new Decimal(0.2)
    }
  ]
};

// Deterministic cohort progression
const progression = calculateCohortProgression(profile, profile.initialPortfolioSize, 12);
```

**Key Features:**
- Supports fractional company counts (e.g., 25.5 companies) to eliminate rounding errors
- Automatic failure rate derivation: `failureRate = 1 - graduationRate - exitRate`
- Stage ordering validation (seed → series_a → series_b, etc.)
- Deterministic cohort flow through stages

#### 2. FeeProfile

Tiered management fee structure with multiple calculation bases and recycling.

```typescript
import { FeeProfileSchema, calculateManagementFees } from '@shared/schemas';

const fees = {
  id: 'tiered-v1',
  name: 'Standard 2/1.5 with Step-Down',
  tiers: [
    {
      basis: 'committed_capital',
      annualRatePercent: new Decimal(0.02), // 2%
      startYear: 1,
      endYear: 5
    },
    {
      basis: 'invested_capital',
      annualRatePercent: new Decimal(0.015), // 1.5%
      startYear: 6
      // No endYear = continues to fund end
    }
  ],
  recyclingPolicy: {
    enabled: true,
    recyclingCapPercent: new Decimal(0.1), // 10% of committed
    recyclingTermMonths: 60,
    basis: 'committed_capital',
    anticipatedRecycling: true
  }
};

// Calculate fees for a period
const context = {
  committedCapital: new Decimal(100000000),
  calledCapitalCumulative: new Decimal(75000000),
  calledCapitalNetOfReturns: new Decimal(60000000),
  investedCapital: new Decimal(70000000),
  fairMarketValue: new Decimal(120000000),
  unrealizedCost: new Decimal(65000000),
  currentMonth: 18
};

const monthlyFees = calculateManagementFees(fees, context);
```

**Calculation Bases:**
- `committed_capital` — Total fund size
- `called_capital_cumulative` — All capital called to date
- `called_capital_net_of_returns` — Called minus distributions
- `invested_capital` — Capital deployed in companies
- `fair_market_value` — Current portfolio valuation
- `unrealized_cost` — Cost basis of unrealized investments

#### 3. CapitalCallPolicy

Flexible capital call timing: upfront, periodic, as-needed, or custom schedules.

```typescript
import { CapitalCallPolicySchema, calculateCapitalCall } from '@shared/schemas';

// Quarterly periodic calls
const quarterlyPolicy = {
  id: 'quarterly-v1',
  name: 'Quarterly Calls Over 5 Years',
  mode: 'quarterly',
  percentagePerPeriod: new Decimal(0.05), // 5% per quarter
  startYear: 1,
  endYear: 5,
  noticePeriodDays: 30,
  fundingPeriodDays: 60
};

// Custom schedule
const customPolicy = {
  id: 'custom-v1',
  name: 'Custom Call Schedule',
  mode: 'custom',
  schedule: [
    { month: 0, percentage: new Decimal(0.25), description: 'Initial call' },
    { month: 6, percentage: new Decimal(0.25) },
    { month: 12, percentage: new Decimal(0.25) },
    { month: 24, percentage: new Decimal(0.25) }
  ],
  noticePeriodDays: 15
};
```

**Modes:**
- `upfront` — 100% at inception (or specified %)
- `quarterly` — Every 3 months
- `semi_annual` — Every 6 months
- `annual` — Every 12 months
- `as_needed` — Triggered by investment opportunities
- `custom` — User-defined schedule

#### 4. WaterfallPolicy

European (fund-level) and American (deal-by-deal) distribution waterfalls.

```typescript
import { WaterfallPolicySchema, calculateEuropeanWaterfall } from '@shared/schemas';

const europeanWaterfall = {
  id: 'euro-v1',
  name: 'European Waterfall with 8% Hurdle',
  type: 'european',
  preferredReturnRate: new Decimal(0.08), // 8% hurdle
  tiers: [
    { tierType: 'return_of_capital', priority: 1 },
    { tierType: 'preferred_return', priority: 2, rate: new Decimal(0.08) },
    { tierType: 'gp_catch_up', priority: 3, catchUpRate: new Decimal(1.0) },
    { tierType: 'carry', priority: 4, rate: new Decimal(0.20) }
  ],
  gpCommitment: {
    percentage: new Decimal(0.01), // 1% GP commit
    basis: 'committed_capital',
    fundedFromFees: false
  },
  clawback: {
    enabled: true,
    lookbackMonths: 36,
    securityRequired: true,
    interestRate: new Decimal(0)
  },
  hurdleRateBasis: 'committed',
  cumulativeCalculations: true
};

// Calculate distribution split
const distribution = calculateEuropeanWaterfall(
  europeanWaterfall,
  totalDistributions,
  contributedCapital,
  cumulativeLPDistributions,
  cumulativeGPDistributions
);

console.log(distribution.lpDistribution); // LP share
console.log(distribution.gpDistribution); // GP carry
console.log(distribution.breakdown);      // Tier-by-tier breakdown
```

**Waterfall Types:**
- **European** — Fund-level: all capital + hurdle returned before any carry
- **American** — Deal-by-deal: carry on each exit

**Tier Types (in order):**
1. `return_of_capital` — Return LP capital first
2. `preferred_return` — LP preferred return (hurdle)
3. `gp_catch_up` — GP catches up to target carry split
4. `carry` — Ongoing carried interest split

#### 5. RecyclingPolicy

Management fee and exit proceeds recycling rules.

```typescript
import { RecyclingPolicySchema, calculateRecyclingAvailability } from '@shared/schemas';

const recycling = {
  id: 'recycling-v1',
  name: 'Standard Recycling',
  enabled: true,
  sources: ['exit_proceeds'], // Can also include 'management_fees' or 'both'
  cap: {
    type: 'percentage',
    value: new Decimal(0.2), // 20% of committed capital
    basis: 'committed_capital'
  },
  term: {
    months: 60, // During 5-year investment period
    extensionMonths: 12,
    automaticExtension: false
  },
  anticipatedRecycling: true,
  reinvestmentTiming: 'quarterly',
  minimumReinvestmentAmount: new Decimal(1000000)
};

// Check recycling availability
const context = {
  committedCapital: new Decimal(100000000),
  calledCapital: new Decimal(75000000),
  investedCapital: new Decimal(70000000),
  currentMonth: 18,
  totalFeesPaid: new Decimal(3000000),
  totalExitProceeds: new Decimal(15000000),
  totalRecycled: new Decimal(5000000),
  recycledFromFees: new Decimal(0),
  recycledFromProceeds: new Decimal(5000000)
};

const availability = calculateRecyclingAvailability(recycling, context);
console.log(availability.totalAvailable);  // Remaining capacity
console.log(availability.capReached);      // Hit cap?
console.log(availability.termExpired);     // Past term?
```

### Complete Fund Model

Combine all policies into a single validated model:

```typescript
import { ExtendedFundModelInputsSchema, validateExtendedFundModel } from '@shared/schemas';

const fundModel = {
  // Base inputs
  id: 'fund-2024-v1',
  name: 'Innovate Future Fund I',
  committedCapital: new Decimal(100000000),
  fundTermMonths: 120,
  vintageYear: 2024,
  investmentPeriodMonths: 60,

  // Profiles
  stageProfile: { /* ... */ },
  feeProfile: { /* ... */ },
  capitalCallPolicy: { /* ... */ },
  waterfallPolicy: { /* ... */ },
  recyclingPolicy: { /* ... */ },

  // Assumptions
  assumptions: {
    defaultHoldingPeriod: 60,
    reinvestmentPeriod: 36,
    portfolioConcentrationLimit: new Decimal(0.2),
    liquidateAtTermEnd: false,
    liquidationDiscountPercent: new Decimal(0.3)
  }
};

// Validate
const result = validateExtendedFundModel(fundModel);
if (result.success) {
  // Use validated model
  const validated = result.data;
} else {
  console.error(result.errors);
}
```

### Validation Features

All schemas include:
- **Type safety** — Full TypeScript inference from Zod schemas
- **Runtime validation** — Catch invalid inputs before computation
- **Detailed errors** — Path-specific error messages
- **Custom refinements** — Cross-field validation (e.g., graduation + exit ≤ 100%)
- **Decimal precision** — No floating-point errors in financial math

### Design Principles

1. **Determinism First**
   - No RNG anywhere
   - Fractional counts eliminate rounding drift
   - Same inputs → identical outputs

2. **Precision Over Performance**
   - Decimal.js for all financial calculations
   - 30-digit precision configured globally
   - Avoid float arithmetic entirely

3. **Composition Over Configuration**
   - Small, focused schemas
   - Discriminated unions for variants
   - Helpers for common calculations

4. **LP Transparency**
   - Exposed assumptions (no hidden magic numbers)
   - Complete waterfall breakdowns
   - Explainable cohort flows

### Migration from MVP

Replace hard-coded values:

| Old (MVP)                     | New (Schema)                      |
|-------------------------------|-----------------------------------|
| `index % 4` exit buckets      | `StageProfile` with rates         |
| 2% flat management fee        | `FeeProfile` with tiers           |
| 100% upfront capital call     | `CapitalCallPolicy` (flexible)    |
| Immediate distribution        | `WaterfallPolicy` (euro/american) |
| Fixed 0.1x/3x/5x/15x multiples| Stage-specific `exitMultiple`     |

### Next Steps

1. **Golden Fixtures** — Create canonical test cases with known outputs
2. **Engine Integration** — Wire schemas into the deterministic fund engine
3. **UI Bindings** — Surface schema fields in fund configuration wizard
4. **Documentation** — ADR explaining fractional count rationale
5. **Performance Gates** — Ensure < 15ms for 1,000 companies × 120 months

### References

- [Tactyc Fund Modeling](https://tactyc.com) — Industry-standard VC modeling tool
- [Decimal.js Documentation](https://mikemcl.github.io/decimal.js/)
- [Zod Documentation](https://zod.dev)
