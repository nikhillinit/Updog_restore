# Fee Calculations Module

The fee calculations module handles all fee-related computations in the venture
capital fund modeling system, including management fees, carried interest, fee
recycling, and administrative expenses. This module integrates with the
waterfall distribution system and provides comprehensive fee impact analysis for
LP net returns.

## Module Overview

### Purpose

This module calculates fee-related cash flows and economic impacts in VC fund
models, serving as the bridge between high-level fee terms defined in Limited
Partnership Agreements (LPAs) and detailed period-by-period cash flows. The
system ensures mathematical consistency between management fees, carried
interest, recycled fees, and administrative expenses while respecting LPA
constraints.

### Key Components

- **Management Fees**: Period-by-period GP compensation across six basis types
  with step-down support
- **Carried Interest**: Integration with waterfall system for GP carry after
  preferred return hurdles
- **Fee Recycling**: Tracking and enforcement of recycling caps allowing GPs to
  reinvest fees
- **Admin Expenses**: Modeling fund operating expenses with configurable growth
  rates
- **Fee Impact Analysis**: Comprehensive reporting of fee impacts on LP net
  returns and GP economics

### File Locations

- **Implementation**: `client/src/lib/fee-calculations.ts` (760 lines)
- **Schemas**: `shared/schemas/fee-profile.ts` (245 lines)
- **Tests**: `tests/unit/fee-calculations.test.ts` (comprehensive coverage)
- **UI Integration**:
  `client/src/components/modeling-wizard/steps/FeesExpensesStep.tsx`

## Core Concepts

### Management Fees

Management fees represent annual GP compensation for managing the fund. Typical
rates range from 1.5% to 2.5% annually, calculated on a specific "basis" that
determines the fee amount.

#### Fee Basis Types

The module supports six distinct basis types:

**1. Committed Capital (`committed`)**

- Most LP-friendly structure
- Fees calculated on total fund commitment throughout fund life
- Provides predictable GP revenue stream
- Example: $100M fund × 2% = $2M/year (constant)
- Usage: Most common in early-stage and seed funds

**2. Called Capital Cumulative (`called`)**

- Fees on capital actually called from LPs to date
- More capital-efficient for LPs than committed basis
- Example: $60M called of $100M → $60M × 2% = $1.2M
- Usage: Growth-stage funds, LP-friendly structures

**3. Called Capital Net of Returns (`called_net`)**

- Fees on called capital minus distributions received
- Most LP-friendly as basis decreases with distributions
- Example: $60M called, $20M distributed → $40M × 2% = $0.8M
- Usage: Later-stage funds with significant distributions

**4. Invested Capital (`invested`)**

- Fees on capital deployed in portfolio companies
- Excludes uninvested reserves
- Example: $70M invested of $100M → $70M × 2% = $1.4M
- Usage: Funds with substantial reserve strategies

**5. Fair Market Value (`fmv`)**

- Fees on current portfolio value (NAV)
- Most GP-adverse as fees decline with exits
- Example: Year 1: $100M NAV → $2M, Year 8: $30M NAV → $0.6M
- Usage: Buyout and later-stage funds

**6. Invested or NAV (`invested_or_nav`)**

- Hybrid: max(Invested, NAV) during investment period, then NAV
- Protects GP from early markdowns
- Usage: Balanced LP/GP structures

#### Step-Down Mechanics

Step-downs reduce fees after the investment period, typically after years 5-7:

**Structure:**

```typescript
interface FeeStepDown {
  afterYear: number; // When step-down takes effect (1-indexed)
  newRate: number; // New fee rate (%)
}

// Example: Classic two-tier structure
const stepDown = { afterYear: 5, newRate: 1.0 };
// Years 1-5: 2%, Years 6-10: 1%
```

**Common Patterns:**

- Investment Period Step-Down: 2% (years 1-5) → 1.5% (years 6-10)
- Graduated Step-Down: 2% → 1.75% → 1.5%
- Basis Change: 2% on committed → 2% on NAV

### Carried Interest

Carried interest represents the GP's share of profits after LPs receive their
capital plus a preferred return (hurdle).

#### Waterfall Integration

The module integrates with `client/src/lib/waterfall.ts` for carry calculations:

**Waterfall Tiers:**

1. **Return of Capital**: LP receives invested capital back
2. **Preferred Return**: LP receives hurdle (e.g., 8%) on capital
3. **Catch-Up**: GP receives 100% until reaching target carry percentage
4. **Carry Split**: Remaining profits split per carry rate (e.g., 80/20)

**Integration:**

```typescript
const carryConfig: CarryConfig = {
  grossReturns: 250,
  investedCapital: 100,
  hurdleRate: 8, // 8% preferred return
  carryRate: 20, // 20% carry
  catchUpPercentage: 100,
  waterfallType: 'EUROPEAN',
};

const carry = calculateCarriedInterest(carryConfig);
// Returns: { gpCarry: 30.4, lpNet: 219.6, ... }
```

#### Catch-Up Provisions

Catch-up allows GPs to accelerate carry until achieving target percentage:

**Full Catch-Up (100% to GP):**

- After LP receives preferred return, 100% goes to GP until target reached
- Formula: `CatchUp = (carryRate × HurdleAmount) / (1 - carryRate)`
- Example: 8% hurdle on $100M = $8M hurdle amount
  - Catch-up = (0.20 × $8M) / 0.80 = $2M to GP
  - Then remaining profits split 80/20

**Partial Catch-Up (e.g., 50%):**

- Catch-up tier splits between GP and LP
- Takes longer for GP to reach target percentage

**No Catch-Up (0%):**

- Straight split on all excess returns
- GP never reaches full target percentage of total profits

### Fee Recycling

Fee recycling allows GPs to reinvest management fees subject to caps and term
limits:

**Recycling Cap:**

```
MaxRecyclable = FundSize × (recyclingCapPercent / 100)
```

Example: $100M fund with 10% cap = $10M maximum recyclable

**Recycling Term:**

- Fees only recyclable within specified period (e.g., 84 months / 7 years)
- Fees paid after term cannot be recycled

**Yearly Allocation:**

```
Recyclable(year) = min(FeeAmount, MaxRecyclable - CumulativeRecycled)
```

### Admin Expenses

Administrative expenses cover fund operations with optional annual growth:

**Formula:**

```
Expense(year) = BaseAmount × (1 + growthRate)^(year-1)
```

Example: $150K base with 3% growth

- Year 1: $150K
- Year 5: $168.9K
- Year 10: $194.8K
- Total: $1.71M

## Mathematical Foundations

### Management Fee Calculation

**Base Formula:**

```
Fee(year) = Basis(year) × Rate(year) / 100
```

**With Step-Down:**

```
Rate(year) = {
  baseRate           if year ≤ stepDownYear
  stepDownRate       if year > stepDownYear
}
```

**Cumulative Tracking:**

```
CumulativeFees(n) = Σ(year=1 to n) Fee(year)
```

### Carried Interest Formulas

**Preferred Return:**

```
PreferredReturn = InvestedCapital × (1 + hurdleRate / 100)
```

**Excess Returns:**

```
ExcessReturns = max(0, GrossReturns - PreferredReturn)
```

**Catch-Up (Full):**

```
CatchUpAmount = (carryRate / 100) × HurdleAmount / (1 - carryRate / 100)
where HurdleAmount = PreferredReturn - InvestedCapital
```

**Carry Split:**

```
RemainingExcess = ExcessReturns - CatchUpAmount
CarryFromSplit = RemainingExcess × (carryRate / 100)
TotalGPCarry = CatchUpAmount + CarryFromSplit
```

**Example (2/20/8 structure):**

- $250M gross returns, $100M invested
- Preferred return: $100M × 1.08 = $108M
- Excess: $250M - $108M = $142M
- Catch-up: (0.20 × $8M) / 0.80 = $2M to GP
- Remaining: $142M - $2M = $140M
- Split: $140M × 0.20 = $28M to GP
- Total GP carry: $2M + $28M = $30M
- LP net: $250M - $30M = $220M

### Fee Recycling Mathematics

**Cap Enforcement:**

```
MaxRecyclable = FundSize × (recyclingCapPercent / 100)
```

**Term Calculation:**

```
RecyclingTermYears = ceil(recyclingTermMonths / 12)
```

**Yearly Allocation:**

```
Recyclable(y) = min(Fee(y), MaxRecyclable - Σ Recyclable(1 to y-1))
```

Only allocate if `y ≤ RecyclingTermYears`.

## Implementation Details

### Core Functions

#### `calculateManagementFees(config: ManagementFeeConfig): YearlyFee[]`

**Parameters:**

- `fundSize`: Fund size ($M)
- `feeRate`: Annual fee rate (%)
- `basis`: 'committed' | 'called' | 'invested' | 'fmv'
- `fundTerm`: Fund term (years)
- `stepDown?`: Optional `{ afterYear, newRate }`

**Returns:** Array of
`{ year, basisAmount, feeRate, feeAmount, cumulativeFees }`

**Example:**

```typescript
const fees = calculateManagementFees({
  fundSize: 100,
  feeRate: 2.0,
  basis: 'committed',
  fundTerm: 10,
  stepDown: { afterYear: 5, newRate: 1.0 },
});
// Total fees: $15M (years 1-5: $10M, years 6-10: $5M)
```

#### `calculateCarriedInterest(config: CarryConfig): CarryCalculation`

**Parameters:**

- `grossReturns`: Gross returns ($M)
- `investedCapital`: Invested capital ($M)
- `hurdleRate`: Hurdle rate (%)
- `carryRate`: Carry rate (%)
- `catchUpPercentage`: Catch-up (0-100%)
- `waterfallType`: 'american' | 'european'

**Returns:**
`{ preferredReturn, returnsAboveHurdle, catchUpAmount, gpCarry, lpNet }`

**Edge Cases:**

- Returns below hurdle → `gpCarry = 0`
- Zero catch-up → straight split on excess
- Zero hurdle → no preferred return tier

#### `calculateFeeRecycling(config: FeeRecyclingConfig): RecyclingSchedule`

**Parameters:**

- `managementFees`: Yearly fees array
- `recyclingCapPercent`: Cap as % of fund size
- `recyclingTermMonths`: Recycling period (months)
- `fundSize`: Fund size ($M)

**Returns:** `{ totalRecyclable, recyclingByYear }`

**Logic:**

1. Calculate max recyclable
2. Convert term to years
3. For each year within term, allocate up to remaining cap
4. Stop when cap reached or term expires

#### `calculateFeeImpact(...): FeeImpactResult`

Comprehensive analysis combining all fee types:

**Returns:**

- `totalManagementFees`: Total mgmt fees ($M)
- `totalAdminExpenses`: Total admin expenses ($M)
- `totalCarry`: Total carried interest ($M)
- `grossMOIC`: Gross multiple on invested capital
- `netMOIC`: Net multiple after all fees
- `feeDragBps`: Fee drag in basis points
- `yearlyBreakdown`: Year-by-year fee schedule

**Fee Drag Calculation:**

```
grossReturnPct = (grossReturns - investedCapital) / investedCapital
netReturnPct = (netReturns - investedCapital) / investedCapital
feeDragBps = (grossReturnPct - netReturnPct) × 10000
```

### TypeScript Interfaces

```typescript
interface ManagementFeeConfig {
  fundSize: number;
  feeRate: number;
  basis: 'committed' | 'called' | 'invested' | 'fmv';
  fundTerm: number;
  stepDown?: { afterYear: number; newRate: number };
}

interface CarryConfig {
  grossReturns: number;
  investedCapital: number;
  hurdleRate: number;
  carryRate: number;
  catchUpPercentage: number;
  waterfallType: 'american' | 'european';
}

interface FeeStructure {
  managementFee: {
    rate: number;
    basis: FeeBasis;
    stepDown?: { enabled: boolean; afterYear?: number; newRate?: number };
  };
  carriedInterest?: {
    enabled: boolean;
    rate: number;
    hurdleRate: number;
    catchUpPercentage: number;
    waterfallType: WaterfallType;
  };
  adminExpenses: {
    annualAmount: number;
    growthRate: number;
  };
}
```

## Test Coverage

### Test Suite Organization

**70+ comprehensive test cases:**

- Management Fee Tests (26 cases): Basic calculations, step-downs, edge cases
- Carried Interest Tests (15 cases): European/American waterfalls, hurdle
  scenarios
- Fee Recycling Tests (4 cases): Cap enforcement, term limits
- Admin Expenses Tests (4 cases): Growth rates, negative growth
- Fee Impact Analysis Tests (7 cases): Combined effects, MOIC, fee drag
- Utility Functions (8 cases): Validation, formatting, calculations
- Edge Cases (6 cases): Boundary conditions, extreme values

### Key Test Scenarios

**Management Fees:**

- Basic 2% flat rate over 10 years
- Step-down after year 5 (2% → 1%)
- Multiple step-downs
- Zero fund size handling
- Effective fee rate calculation

**Carried Interest:**

- Standard 2/20/8 (European)
- No hurdle (0%)
- Returns below hurdle (no carry)
- Partial catch-up (50%, 80%)
- Returns exactly at hurdle (boundary)
- High returns stress test (3x MOIC)

**Fee Impact:**

- Fee-only impact (no carry)
- Combined management + admin + carry
- MOIC calculation (gross vs net)
- Fee drag measurement
- Step-down impact on total fees

### Coverage Metrics

- **Function Coverage**: 100% - All exported functions tested
- **Branch Coverage**: ~95% - All calculation paths covered
- **Edge Case Coverage**: Comprehensive boundary conditions validated
- **Integration Coverage**: Full cross-function integration tested

## Integration Points

### Waterfall Module Integration

**Location:** `client/src/lib/waterfall.ts`

Integration flow:

1. Waterfall configuration provides hurdle, carry rate, catch-up
2. Fee calculations compute GP carry and LP net
3. Results feed into waterfall display components
4. Fee impact includes carry in total burden

**Type Compatibility:**

- Waterfall uses uppercase: `'AMERICAN' | 'EUROPEAN'`
- Fee calculations use lowercase: `'american' | 'european'`
- Conversion handled in integration layer

### Fund Calculator Integration

**Location:** `client/src/core/calculator.ts`

Fee impact provides net returns:

```typescript
const feeImpact = calculateFeeImpact(
  fundSize,
  feeStructure,
  fundTerm,
  grossReturns,
  investedCapital
);
const netReturns =
  grossReturns -
  feeImpact.totalManagementFees -
  feeImpact.totalAdminExpenses -
  feeImpact.totalCarry;
const netMOIC = netReturns / investedCapital;
```

### Scenario Modeling

**Location:** `client/src/pages/scenarios/`

Enables what-if analysis:

- Compare step-down timing (year 5 vs year 7)
- Evaluate recycling impact on effective rates
- Model carry rate negotiation effects
- Analyze admin expense growth scenarios

## Performance Considerations

### Computational Complexity

- **Management Fees**: O(n) where n = fund term years
- **Admin Expenses**: O(n)
- **Carried Interest**: O(1) constant time
- **Fee Impact**: O(n) dominated by yearly breakdown
- **Fee Recycling**: O(n) limited by recycling term

**Typical Performance:**

- 10-year fund: <1ms
- 100 scenario batch: ~50ms
- Monte Carlo (10K iterations): ~500ms

### Optimization Strategies

**Memoization:**

```typescript
const feeCache = new Map<string, YearlyFee[]>();
function getCachedFees(config: ManagementFeeConfig): YearlyFee[] {
  const key = JSON.stringify(config);
  if (!feeCache.has(key)) {
    feeCache.set(key, calculateManagementFees(config));
  }
  return feeCache.get(key)!;
}
```

**Lazy Evaluation:**

- Only calculate carry when `grossReturns` provided
- Skip recycling when cap is zero
- Defer cumulative calculations until needed

## API Reference

### Exported Functions

**Management Fees:**

- `calculateManagementFees(config)` → `YearlyFee[]`
- `calculateTotalManagementFees(config)` → `number`
- `calculateEffectiveFeeRate(fees)` → `number` (%)

**Carried Interest:**

- `calculateCarriedInterest(config)` → `CarryResult`
- `calculateEffectiveCarryRate(result, grossReturns)` → `number` (%)

**Fee Recycling:**

- `calculateFeeRecycling(config)` → `RecyclingSchedule`

**Admin Expenses:**

- `calculateAdminExpenses(amount, rate, term)` →
  `Array<{year, amount, cumulative}>`
- `calculateTotalAdminExpenses(amount, rate, term)` → `number`

**Fee Impact:**

- `calculateFeeImpact(fundSize, structure, term, gross?, invested?)` →
  `FeeImpactResult`

**Utilities:**

- `validateFeeStructure(structure)` → `{valid, warnings}`
- `formatFeeImpact(impact)` → `{managementFees, carry, ...}` (strings)
- `calculateFeeLoad(totalFees, fundSize)` → `number` (%)
- `calculateNetToGrossRatio(gross, net)` → `number` (0-1)

## Common Patterns

### Step-Down Configuration

**Basic:**

```typescript
const config = {
  fundSize: 100,
  feeRate: 2.0,
  basis: 'committed',
  fundTerm: 10,
  stepDown: { afterYear: 5, newRate: 1.5 },
};
```

**No Step-Down:**

```typescript
const config = {
  fundSize: 100,
  feeRate: 2.0,
  basis: 'committed',
  fundTerm: 10,
  // Omit stepDown property
};
```

### Fee Impact Analysis

**Complete Analysis:**

```typescript
const feeStructure = {
  managementFee: {
    rate: 2.0,
    basis: 'committed',
    stepDown: { enabled: true, afterYear: 5, newRate: 1.0 },
  },
  carriedInterest: {
    enabled: true,
    rate: 20,
    hurdleRate: 8,
    catchUpPercentage: 100,
    waterfallType: 'european',
  },
  adminExpenses: {
    annualAmount: 0.5,
    growthRate: 3,
  },
};

const impact = calculateFeeImpact(100, feeStructure, 10, 250, 90);
console.log(`Net MOIC: ${impact.netMOIC.toFixed(2)}x`);
console.log(`Fee Drag: ${impact.feeDragBps} bps`);
```

### Validation Best Practices

**Pre-Calculation:**

```typescript
const validation = validateFeeStructure(feeStructure);
if (!validation.valid) {
  console.warn('Warnings:', validation.warnings);
}
```

**Validation Rules:**

- Management fee >3% or <1% triggers warning
- Carry rate >25% or <15% triggers warning
- Hurdle rate >10% triggers warning
- Invalid step-down (new rate ≥ initial rate) triggers warning

### Recycling Configuration

**Standard:**

```typescript
const recycling = calculateFeeRecycling({
  managementFees: fees,
  recyclingCapPercent: 10, // 10% of fund size
  recyclingTermMonths: 84, // 7 years
  fundSize: 100,
});
```

**Disabled:**

```typescript
const recycling = calculateFeeRecycling({
  managementFees: fees,
  recyclingCapPercent: 0, // Disabled
  recyclingTermMonths: 84,
  fundSize: 100,
});
// recycling.totalRecyclable = 0
```

---

**See Also:**

- [Waterfall Distribution System](./waterfall.md) - Carry calculation
  integration
- [ADR-006: Fee Calculation Standards](../adr/ADR-006-fee-calculation-standards.md) -
  Architectural decisions
- [Fee Truth Cases](../fees.truth-cases.json) - 30 canonical test scenarios
