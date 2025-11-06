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

The module supports six distinct basis types, defined in the schema validation
layer:

**1. Committed Capital (`committed_capital`)**

- Most LP-friendly structure
- Fees calculated on total fund commitment throughout fund life
- Provides predictable GP revenue stream
- Example: $100M fund × 2% = $2M/year (constant)
- Usage: Most common in early-stage and seed funds
- Schema:
  [`FeeBasisType.committed_capital`](../../shared/schemas/fee-profile.ts:13-20)

**2. Called Capital Cumulative (`called_capital_cumulative`)**

- Fees on capital actually called from LPs to date
- More capital-efficient for LPs than committed basis
- Example: $60M called of $100M → $60M × 2% = $1.2M
- Usage: Growth-stage funds, LP-friendly structures
- Schema:
  [`FeeBasisType.called_capital_cumulative`](../../shared/schemas/fee-profile.ts:13-20)

**3. Called Capital Net of Returns (`called_capital_net_of_returns`)**

- Fees on called capital minus distributions received
- Most LP-friendly as basis decreases with distributions
- Example: $60M called, $20M distributed → $40M × 2% = $0.8M
- Usage: Later-stage funds with significant distributions
- Schema:
  [`FeeBasisType.called_capital_net_of_returns`](../../shared/schemas/fee-profile.ts:13-20)

**4. Invested Capital (`invested_capital`)**

- Fees on capital deployed in portfolio companies
- Excludes uninvested reserves
- Example: $70M invested of $100M → $70M × 2% = $1.4M
- Usage: Funds with substantial reserve strategies
- Schema:
  [`FeeBasisType.invested_capital`](../../shared/schemas/fee-profile.ts:13-20)

**5. Fair Market Value (`fair_market_value`)**

- Fees on current portfolio value (NAV)
- Most GP-adverse as fees decline with exits
- Example: Year 1: $100M NAV → $2M, Year 8: $30M NAV → $0.6M
- Usage: Buyout and later-stage funds
- Schema:
  [`FeeBasisType.fair_market_value`](../../shared/schemas/fee-profile.ts:13-20)

**6. Unrealized Cost (`unrealized_cost`)**

- Cost basis of unrealized investments
- Alternative metric for fee basis during investment phase
- Usage: Alternative cost basis calculations
- Schema:
  [`FeeBasisType.unrealized_cost`](../../shared/schemas/fee-profile.ts:13-20)

**Basis Resolution Logic:** The runtime resolution of basis types to actual
amounts is handled by
[`getBasisAmount()`](../../shared/schemas/fee-profile.ts:202-217), which maps
schema basis types to calculated capital amounts via
[`FeeCalculationContext`](../../shared/schemas/fee-profile.ts:142-150).

#### Step-Down Mechanics

Step-downs reduce fees after the investment period, typically after years 5-7.
The tier-based system supports flexible timing and basis changes:

**Structure:**

```typescript
interface FeeTier {
  basis: FeeBasisType;
  annualRatePercent: Decimal;
  startYear: number; // Fund year when tier becomes active
  endYear?: number; // Optional end year
  capPercent?: Decimal; // Optional fee cap
  capAmount?: Decimal; // Optional fixed cap
}

// Example: Classic two-tier structure
const tiers = [
  {
    basis: 'committed_capital',
    annualRatePercent: 2.0,
    startYear: 1,
    endYear: 5,
  },
  { basis: 'committed_capital', annualRatePercent: 1.0, startYear: 6 },
];
// Years 1-5: 2%, Years 6-10: 1%
```

**Tier Selection Logic:** Tier activation is determined by
[`calculateManagementFees()`](../../shared/schemas/fee-profile.ts:155-197),
which evaluates `startYear` and `endYear` against current fund year.

**Common Patterns:**

- Investment Period Step-Down: 2% (years 1-5) → 1.5% (years 6-10)
- Graduated Step-Down: 2% → 1.75% → 1.5% (multiple tiers)
- Basis Change: 2% on committed → 2% on NAV
- Fee Caps: Tiers can include
  [`capPercent`](../../shared/schemas/fee-profile.ts:40-44) or
  [`capAmount`](../../shared/schemas/fee-profile.ts:40-44) limits

### Carried Interest

Carried interest represents the GP's share of profits after LPs receive their
capital plus a preferred return (hurdle).

#### Waterfall Integration

The module integrates with `client/src/lib/waterfall.ts` for carry calculations.
The primary calculation function is
[`calculateCarriedInterest()`](../../client/src/lib/fee-calculations.ts:278-344),
which implements waterfall mechanics:

**Waterfall Tiers:**

1. **Return of Capital**: LP receives invested capital back
2. **Preferred Return**: LP receives hurdle (e.g., 8%) on capital
   [computed at line 290](../../client/src/lib/fee-calculations.ts:289-291)
3. **Catch-Up**: GP receives 100% until reaching target carry percentage
   [catch-up logic at lines 311-338](../../client/src/lib/fee-calculations.ts:310-338)
4. **Carry Split**: Remaining profits split per carry rate (e.g., 80/20)

**Integration:**

```typescript
const carryConfig: CarryConfig = {
  grossReturns: 250,
  investedCapital: 100,
  hurdleRate: 8, // 8% preferred return
  carryRate: 20, // 20% carry
  catchUpPercentage: 100, // Full catch-up
  waterfallType: 'american', // Type of waterfall
};

const carry = calculateCarriedInterest(carryConfig);
// Returns: { preferredReturn: 108, returnsAboveHurdle: 142, catchUpAmount: 2, gpCarry: 30, lpNet: 220 }
```

**Type Compatibility:** Waterfall type conversion from UI format
([uppercase in `waterfall.ts:12-13`](../../client/src/lib/waterfall.ts:12-13))
to calculation format (lowercase) is handled in the integration layer.

#### Catch-Up Provisions

Catch-up allows GPs to accelerate carry until achieving target percentage.
Implementation is in
[`calculateCarriedInterest()`](../../client/src/lib/fee-calculations.ts:310-338):

**Full Catch-Up (100% to GP):**

- After LP receives preferred return, 100% goes to GP until target reached
- Formula:
  `CatchUp = min((carryRate × HurdleAmount) / (1 - carryRate), maxCatchUp)`
- Implemented at
  [lines 322-325](../../client/src/lib/fee-calculations.ts:322-325)
- Example: 8% hurdle on $100M = $8M hurdle amount
  - Full catch-up = (0.20 × $8M) / 0.80 = $2M to GP
  - Max catch-up (100%) = $8M × 1.0 = $8M
  - Actual catch-up = min($2M, $8M) = $2M
  - Then remaining profits split 80/20

**Partial Catch-Up (e.g., 50%):**

- Catch-up tier splits between GP and LP
- Takes longer for GP to reach target percentage
- [`catchUpPercentage`](../../client/src/lib/fee-calculations.ts:69-70)
  parameter limits catch-up eligibility
- Max catch-up = HurdleAmount × (catchUpPercentage / 100)

**No Catch-Up (0%):**

- Straight split on all excess returns
- Handled by [lines 336-338](../../client/src/lib/fee-calculations.ts:336-338)
- GP never reaches full target percentage of total profits
- Formula: `gpCarry = excessReturns × (carryRate / 100)`

### Fee Recycling

Fee recycling allows GPs to reinvest management fees subject to caps and term
limits. Implementation is in
[`calculateRecyclableFees()`](../../shared/schemas/fee-profile.ts:222-244) and
[`FeeRecyclingPolicySchema`](../../shared/schemas/fee-profile.ts:52-73):

**Recycling Cap:**

The maximum recyclable amount is enforced by
[`recyclingCapPercent`](../../shared/schemas/fee-profile.ts:56-57):

```
MaxRecyclable = BasisAmount × (recyclingCapPercent / 100)
```

Example: $100M fund with 10% cap = $10M maximum recyclable

The cap is validated on the policy object
[lines 67-72](../../shared/schemas/fee-profile.ts:67-72), ensuring cap and term
are positive when enabled.

**Recycling Term:**

- Fees only recyclable within specified period (e.g., 84 months / 7 years)
- Enforced by [`recyclingTermMonths`](../../shared/schemas/fee-profile.ts:59-60)
- Term checking implemented at
  [lines 234-236](../../shared/schemas/fee-profile.ts:234-236)
- Fees paid after term cannot be recycled

**Yearly Allocation:**

```
Recyclable(year) = min(FeeAmount, MaxRecyclable - CumulativeRecycled)
```

Logic implemented at
[lines 238-243](../../shared/schemas/fee-profile.ts:238-243), using Decimal
arithmetic for precision.

**Cap Basis:** The recycling cap can be based on different bases via
[`basis`](../../shared/schemas/fee-profile.ts:62-63) field, defaulting to
committed capital. The basis is resolved through the same
[`getBasisAmount()`](../../shared/schemas/fee-profile.ts:202-217) function as
management fees.

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

The fundamental fee calculation logic is implemented in
[`calculateManagementFees()`](../../shared/schemas/fee-profile.ts:155-197):

```
Fee(month) = BasisAmount × AnnualRatePercent / 12
```

Where:

- BasisAmount is resolved from one of 6 basis types via
  [`getBasisAmount()`](../../shared/schemas/fee-profile.ts:202-217)
- Monthly fees are calculated
  [at line 182](../../shared/schemas/fee-profile.ts:182) by dividing annual rate
  by 12

**With Tier-Based Step-Downs:**

```
AnnualRate(year) = {
  tier[0].rate       if year ∈ [tier[0].startYear, tier[0].endYear]
  tier[1].rate       if year ∈ [tier[1].startYear, tier[1].endYear]
  ...
}
```

Tier evaluation logic
[at lines 172-176](../../shared/schemas/fee-profile.ts:172-176) checks whether
current year falls within tier's startYear and endYear bounds.

**Optional Fee Caps:**

Fees can be capped by percentage of basis
([lines 185-188](../../shared/schemas/fee-profile.ts:185-188)) or fixed amount
([lines 189-191](../../shared/schemas/fee-profile.ts:189-191)):

```
ActualFee = min(CalculatedFee, capPercent × Basis, capAmount)
```

**Cumulative Tracking:**

Each tier maintains cumulative tracking:

```
CumulativeFees(n) = Σ(month=1 to n) Fee(month)
```

Used for waterfall calculations and cash flow projections.

### Carried Interest Formulas

All carry calculations are implemented in
[`calculateCarriedInterest()`](../../client/src/lib/fee-calculations.ts:278-344).

**Preferred Return:**

```
PreferredReturn = InvestedCapital × (1 + hurdleRate / 100)
```

Calculated at [line 290](../../client/src/lib/fee-calculations.ts:289-291):

```ts
const preferredReturn = investedCapital * (1 + hurdleRate / 100);
```

**Excess Returns:**

```
ExcessReturns = max(0, GrossReturns - PreferredReturn)
```

Calculated at [line 307](../../client/src/lib/fee-calculations.ts:306-308) with
guard at [line 302](../../client/src/lib/fee-calculations.ts:301-304) to return
zero carry if returns don't exceed hurdle.

**Catch-Up (Full) Calculation:**

```
FullCatchUpAmount = (carryRate / 100) × HurdleAmount / (1 - carryRate / 100)
where HurdleAmount = PreferredReturn - InvestedCapital
MaxCatchUpAmount = HurdleAmount × (catchUpPercentage / 100)
CatchUpAmount = min(FullCatchUpAmount, MaxCatchUpAmount, ExcessReturns)
```

Implemented at
[lines 322-325](../../client/src/lib/fee-calculations.ts:322-325):

```ts
const hurdleAmount = preferredReturn - investedCapital;
const fullCatchUpAmount =
  ((carryRate / 100) * hurdleAmount) / (1 - carryRate / 100);
const maxCatchUpAmount = hurdleAmount * (catchUpPercentage / 100);
const catchUpAmount = Math.min(
  fullCatchUpAmount,
  maxCatchUpAmount,
  excessReturns
);
```

**Carry Split:**

```
RemainingExcess = ExcessReturns - CatchUpAmount
CarryFromSplit = RemainingExcess × (carryRate / 100)
TotalGPCarry = CatchUpAmount + CarryFromSplit
```

Implemented at
[lines 331-334](../../client/src/lib/fee-calculations.ts:331-334):

```ts
const remainingExcess = excessReturns - catchUpAmount;
if (remainingExcess > 0) {
  result.gpCarry += remainingExcess * (carryRate / 100);
}
```

**Example (2/20/8 structure):**

- $250M gross returns, $100M invested
- Preferred return: $100M × 1.08 = $108M
- Excess: $250M - $108M = $142M
- Hurdle amount: $108M - $100M = $8M
- Full catch-up: (0.20 × $8M) / 0.80 = $2M
- Max catch-up (100%): $8M × 1.0 = $8M
- Actual catch-up: min($2M, $8M, $142M) = $2M to GP
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

#### `calculateManagementFees(profile: FeeProfile, context: FeeCalculationContext): Decimal`

**Location:**
[`shared/schemas/fee-profile.ts:155-197`](../../shared/schemas/fee-profile.ts:155-197)

**Parameters:**

- `profile`: FeeProfile with one or more fee tiers
- `context`: FeeCalculationContext with basis amounts and current month

**Returns:** Decimal (monthly management fee amount)

**Tier Evaluation:**

The function iterates through profile tiers
[at lines 172-194](../../shared/schemas/fee-profile.ts:172-194), evaluating:

- Whether current year falls within tier's `startYear`/`endYear`
- Basis amount for the tier
- Percentage and cap limits
- Applies Decimal.js for precise arithmetic

**Example:**

```typescript
const fees = calculateManagementFees(feeProfile, {
  committedCapital: new Decimal(100),
  calledCapitalCumulative: new Decimal(60),
  investedCapital: new Decimal(50),
  fairMarketValue: new Decimal(45),
  currentMonth: 36, // Year 3
});
// Returns: Decimal object for monthly fee amount
```

#### `calculateCarriedInterest(config: CarryConfig): CarryCalculation`

**Location:**
[`client/src/lib/fee-calculations.ts:278-344`](../../client/src/lib/fee-calculations.ts:278-344)

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
  [handled at lines 302-304](../../client/src/lib/fee-calculations.ts:301-304)
- Zero catch-up → straight split on excess
  [at lines 336-338](../../client/src/lib/fee-calculations.ts:336-338)
- Zero hurdle → no preferred return tier (preferred return = invested capital)

#### `calculateRecyclableFees(profile: FeeProfile, feesPaid: Decimal, context: FeeCalculationContext): Decimal`

**Location:**
[`shared/schemas/fee-profile.ts:222-244`](../../shared/schemas/fee-profile.ts:222-244)

**Parameters:**

- `profile`: FeeProfile with recycling policy
- `feesPaid`: Fees paid in current period
- `context`: Calculation context with basis amounts

**Returns:** Decimal (recyclable fee amount)

**Logic:**

1. Check if recycling is enabled
   [at lines 227-229](../../shared/schemas/fee-profile.ts:227-229)
2. Verify within recycling term
   [at lines 234-236](../../shared/schemas/fee-profile.ts:234-236)
3. Calculate max recyclable based on basis
   [at lines 239-240](../../shared/schemas/fee-profile.ts:239-240)
4. Return minimum of fees paid and remaining cap
   [at line 243](../../shared/schemas/fee-profile.ts:243)

#### `calculateFeeImpact(fundSize: number, feeStructure: FeeStructure, fundTerm: number, grossReturns?: number, investedCapital?: number): FeeImpactResult`

**Location:**
[`client/src/lib/fee-calculations.ts:518-618`](../../client/src/lib/fee-calculations.ts:518-618)

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

Implemented at
[lines 602-606](../../client/src/lib/fee-calculations.ts:602-606):

```ts
const grossReturnPct = (grossReturns - investedCapital) / investedCapital;
const netReturnPct = (netReturns - investedCapital) / investedCapital;
feeDragBps = Math.round((grossReturnPct - netReturnPct) * 10000);
```

**Composite Calculation:**

The function integrates:

- Management fees
  [lines 526-547](../../client/src/lib/fee-calculations.ts:526-547)
- Admin expenses
  [lines 550-558](../../client/src/lib/fee-calculations.ts:550-558)
- Carried interest
  [lines 583-595](../../client/src/lib/fee-calculations.ts:583-595)
- MOIC calculations
  [lines 598-606](../../client/src/lib/fee-calculations.ts:598-606)

### TypeScript Interfaces

**Management Fee Configuration:**
[`ManagementFeeConfig`](../../client/src/lib/fee-calculations.ts:23-39)

```typescript
interface ManagementFeeConfig {
  /** Fund size in millions ($M) */
  fundSize: number;
  /** Base management fee rate (%) */
  feeRate: number;
  /** Fee calculation basis */
  basis: FeeBasis;
  /** Fund term in years */
  fundTerm: number;
  /** Optional step-down configuration */
  stepDown?: {
    afterYear: number;
    newRate: number;
  };
}
```

**Carried Interest Configuration:**
[`CarryConfig`](../../client/src/lib/fee-calculations.ts:60-73)

```typescript
interface CarryConfig {
  /** Gross returns before carry ($M) */
  grossReturns: number;
  /** Total invested capital ($M) */
  investedCapital: number;
  /** Hurdle rate (%) */
  hurdleRate: number;
  /** Carry rate - GP's share of profits (%) */
  carryRate: number;
  /** Catch-up percentage - how fast GP catches up (%) */
  catchUpPercentage: number;
  /** Waterfall type */
  waterfallType: WaterfallType;
}
```

**Complete Fee Structure:**
[`FeeStructure`](../../client/src/lib/fee-calculations.ts:125-149)

```typescript
interface FeeStructure {
  managementFee: {
    rate: number;
    basis: FeeBasis;
    stepDown?: {
      enabled: boolean;
      afterYear?: number;
      newRate?: number;
    };
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

**Yearly Fee Breakdown:**
[`YearlyFee`](../../client/src/lib/fee-calculations.ts:44-55) interface used in
fee arrays

**Carry Calculation Result:**
[`CarryCalculation`](../../client/src/lib/fee-calculations.ts:78-89) with
detailed tier breakdown

## Test Coverage

### Test Suite Organization

**70+ comprehensive test cases in
[`tests/unit/fee-calculations.test.ts`](../../tests/unit/fee-calculations.test.ts):**

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

- Basic calculation without step-down
- Step-down after year 5 (2% → 1%)
- Total management fees aggregation
  [`calculateTotalManagementFees`](../../client/src/lib/fee-calculations.ts:238-243)
- Zero fund size handling
- Effective fee rate calculation
  [`calculateEffectiveFeeRate`](../../client/src/lib/fee-calculations.ts:630-638)

**Carried Interest:**

- Standard 2/20/8 with 100% catch-up
- No hurdle (0%) scenario
- Returns below hurdle (no carry)
- Partial catch-up (50%, 80%) - tested with
  [`catchUpPercentage`](../../client/src/lib/fee-calculations.ts:69-70)
  parameter
- Returns exactly at hurdle (boundary condition)
- High returns stress test (3x MOIC)
- Effective carry rate
  [`calculateEffectiveCarryRate`](../../client/src/lib/fee-calculations.ts:353-359)

**Fee Impact:**

- Fee-only impact (no carry) - tested via
  [`calculateFeeImpact`](../../client/src/lib/fee-calculations.ts:518-618) with
  `carriedInterest.enabled = false`
- Combined management + admin + carry scenario
- MOIC calculation (gross vs net)
  [lines 598-606](../../client/src/lib/fee-calculations.ts:598-606)
- Fee drag measurement
  [lines 602-606](../../client/src/lib/fee-calculations.ts:602-606)
- Step-down impact on total fees

**Validation:**

- Fee structure validation
  [`validateFeeStructure`](../../client/src/lib/fee-calculations.ts:685-728)
  tests:
  - Management fee >3% warning
    [line 692](../../client/src/lib/fee-calculations.ts:692)
  - Management fee <1% warning
    [line 695](../../client/src/lib/fee-calculations.ts:695)
  - Step-down validation
    [lines 700-707](../../client/src/lib/fee-calculations.ts:700-707)
  - Carry rate bounds checks
    [lines 713-718](../../client/src/lib/fee-calculations.ts:713-718)

### Coverage Metrics

- **Function Coverage**: 100% - All exported functions tested
- **Branch Coverage**: ~95% - All calculation paths covered
- **Edge Case Coverage**: Comprehensive boundary conditions validated
- **Integration Coverage**: Full cross-function integration tested
- **Schema Validation**: Zod schema tests in
  [`shared/schemas/fee-profile.ts`](../../shared/schemas/fee-profile.ts)

## Integration Points

### Waterfall Module Integration

**Location:** [`client/src/lib/waterfall.ts`](../../client/src/lib/waterfall.ts)

Integration flow:

1. Waterfall configuration provides hurdle, carry rate, catch-up
2. Fee calculations compute GP carry and LP net via
   [`calculateCarriedInterest()`](../../client/src/lib/fee-calculations.ts:278-344)
3. Results feed into waterfall display components
4. Fee impact includes carry in total burden via
   [`calculateFeeImpact()`](../../client/src/lib/fee-calculations.ts:518-618)

**Type Compatibility:**

- Waterfall uses uppercase: `'AMERICAN' | 'EUROPEAN'` (defined at
  [lines 12-13](../../client/src/lib/waterfall.ts:12-13))
- Fee calculations use lowercase: `'american' | 'european'` (parameter at
  [line 72](../../client/src/lib/fee-calculations.ts:71-72))
- Waterfall updates use
  [`applyWaterfallChange()`](../../client/src/lib/waterfall.ts:50-74) for
  type-safe modifications
- Conversion handled in integration layer

### Fund Calculator Integration

**Location:** `client/src/core/calculator.ts`

Fee impact provides net returns via
[`calculateFeeImpact()`](../../client/src/lib/fee-calculations.ts:518-618):

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

**Result Structure:**
[`FeeImpactResult`](../../client/src/lib/fee-calculations.ts:154-174) provides
comprehensive metrics including:

- Monthly/yearly fee breakdown
  [lines 168-173](../../client/src/lib/fee-calculations.ts:168-173)
- Gross and net MOIC
  [lines 162-164](../../client/src/lib/fee-calculations.ts:162-164)
- Fee drag in basis points
  [lines 165-166](../../client/src/lib/fee-calculations.ts:165-166)

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

- [`calculateManagementFees(profile, context)`](../../shared/schemas/fee-profile.ts:155-197)
  → `Decimal`
- [`calculateTotalManagementFees(config)`](../../client/src/lib/fee-calculations.ts:238-243)
  → `number`
- [`calculateEffectiveFeeRate(fees)`](../../client/src/lib/fee-calculations.ts:630-638)
  → `number` (%)

**Carried Interest:**

- [`calculateCarriedInterest(config)`](../../client/src/lib/fee-calculations.ts:278-344)
  → `CarryCalculation`
- [`calculateEffectiveCarryRate(result, grossReturns)`](../../client/src/lib/fee-calculations.ts:353-359)
  → `number` (%)

**Fee Recycling:**

- [`calculateRecyclableFees(profile, feesPaid, context)`](../../shared/schemas/fee-profile.ts:222-244)
  → `Decimal`
- [`calculateFeeRecycling(config)`](../../client/src/lib/fee-calculations.ts:386-437)
  → `RecyclingSchedule`

**Admin Expenses:**

- [`calculateAdminExpenses(amount, rate, term)`](../../client/src/lib/fee-calculations.ts:451-473)
  → `Array<{year, amount, cumulative}>`
- [`calculateTotalAdminExpenses(amount, rate, term)`](../../client/src/lib/fee-calculations.ts:483-490)
  → `number`

**Fee Impact:**

- [`calculateFeeImpact(fundSize, structure, term, gross?, invested?)`](../../client/src/lib/fee-calculations.ts:518-618)
  → `FeeImpactResult`

**Utilities:**

- [`validateFeeStructure(structure)`](../../client/src/lib/fee-calculations.ts:685-728)
  → `{valid, warnings}`
- [`formatFeeImpact(impact)`](../../client/src/lib/fee-calculations.ts:661-677)
  → `{managementFees, carry, ...}` (strings)
- [`calculateFeeLoad(totalFees, fundSize)`](../../client/src/lib/fee-calculations.ts:737-740)
  → `number` (%)
- [`calculateNetToGrossRatio(gross, net)`](../../client/src/lib/fee-calculations.ts:647-653)
  → `number` (0-1)
- [`projectManagementFeesCustomPeriod(baseConfig, periodYears)`](../../client/src/lib/fee-calculations.ts:751-780)
  → `YearlyFee[]`

## Common Patterns

### Step-Down Configuration

**Basic with Tier-Based Model:**

```typescript
const profile: FeeProfile = {
  id: 'standard-stepdown',
  name: 'Standard 2% to 1.5%',
  tiers: [
    {
      basis: 'committed_capital',
      annualRatePercent: new Decimal('2.0'),
      startYear: 1,
      endYear: 5,
    },
    {
      basis: 'committed_capital',
      annualRatePercent: new Decimal('1.5'),
      startYear: 6,
    },
  ],
};

const fees = calculateManagementFees(profile, context);
```

Implementation via [`FeeTierSchema`](../../shared/schemas/fee-profile.ts:27-45)
with tier ordering validation
[at lines 117-134](../../shared/schemas/fee-profile.ts:114-135).

**No Step-Down (Single Tier):**

```typescript
const profile: FeeProfile = {
  id: 'flat-fee',
  name: 'Flat 2% Fee',
  tiers: [
    {
      basis: 'committed_capital',
      annualRatePercent: new Decimal('2.0'),
      startYear: 1,
      // endYear omitted - applies for entire fund life
    },
  ],
};
```

### Fee Impact Analysis

**Complete Analysis with All Components:**

```typescript
const feeStructure: FeeStructure = {
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
    waterfallType: 'american',
  },
  adminExpenses: {
    annualAmount: 0.5,
    growthRate: 3,
  },
};

const impact = calculateFeeImpact(100, feeStructure, 10, 250, 90);
console.log(`Total Mgmt Fees: $${impact.totalManagementFees.toFixed(1)}M`);
console.log(`Total Admin: $${impact.totalAdminExpenses.toFixed(1)}M`);
console.log(`Total Carry: $${impact.totalCarry.toFixed(1)}M`);
console.log(`Net MOIC: ${impact.netMOIC.toFixed(2)}x`);
console.log(`Fee Drag: ${impact.feeDragBps} bps`);
console.log(`Yearly Breakdown:`, impact.yearlyBreakdown);
```

**Result formatting** uses
[`formatFeeImpact()`](../../client/src/lib/fee-calculations.ts:661-677) for
display strings

### Validation Best Practices

**Pre-Calculation Validation:**

Use [`validateFeeStructure()`](../../client/src/lib/fee-calculations.ts:685-728)
to check configuration before calculations:

```typescript
const validation = validateFeeStructure(feeStructure);
if (!validation.valid) {
  console.warn('Warnings:', validation.warnings);
}
```

**Validation Rules Implemented:**

- Management fee >3% triggers warning
  [line 692](../../client/src/lib/fee-calculations.ts:692)
- Management fee <1% triggers warning
  [line 695](../../client/src/lib/fee-calculations.ts:695)
- Step-down new rate >= initial rate triggers warning
  [lines 700-707](../../client/src/lib/fee-calculations.ts:700-707)
- Carry rate >25% triggers warning
  [line 713](../../client/src/lib/fee-calculations.ts:713)
- Carry rate <15% triggers warning
  [line 716](../../client/src/lib/fee-calculations.ts:716)
- Hurdle rate >10% triggers warning
  [line 719](../../client/src/lib/fee-calculations.ts:719)

**Schema Validation:** FeeProfile uses Zod schema validation with refine checks
[at lines 114-135](../../shared/schemas/fee-profile.ts:114-135) for tier
ordering

### Recycling Configuration

**Standard with Cap and Term:**

```typescript
const recyclingPolicy: FeeRecyclingPolicy = {
  enabled: true,
  recyclingCapPercent: new Decimal('10'), // 10% of basis
  recyclingTermMonths: 84, // 7 years
  basis: 'committed_capital', // Default
  anticipatedRecycling: false,
};

const recyclable = calculateRecyclableFees(profile, feesPaid, context);
```

Policy structure defined in
[`FeeRecyclingPolicySchema`](../../shared/schemas/fee-profile.ts:52-73)

**Disabled Recycling:**

```typescript
const recyclingPolicy: FeeRecyclingPolicy = {
  enabled: false,
  recyclingCapPercent: new Decimal('0'),
  recyclingTermMonths: 84,
};

const recyclable = calculateRecyclableFees(profile, feesPaid, context);
// Always returns Decimal(0)
```

Validation ensures cap and term are positive when enabled
[at lines 68-72](../../shared/schemas/fee-profile.ts:67-72)

**Proactive Recycling:**

Use [`anticipatedRecycling`](../../shared/schemas/fee-profile.ts:65-66) flag for
forecasting to assume recycling up to cap for future periods

---

**See Also:**

- [Waterfall Distribution System](./waterfall.md) - Carry calculation
  integration
- [ADR-006: Fee Calculation Standards](../adr/ADR-006-fee-calculation-standards.md) -
  Architectural decisions
- [Fee Truth Cases](../fees.truth-cases.json) - 30 canonical test scenarios
