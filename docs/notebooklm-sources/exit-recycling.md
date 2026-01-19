---
status: ACTIVE
last_updated: 2026-01-19
---

# Exit Recycling Calculations

**Module**: `client/src/lib/exit-recycling-calculations.ts` **Schema**:
`shared/schemas/recycling-policy.ts` **Purpose**: Pure functions for calculating
exit proceeds recycling schedules, caps, and capital availability

---

## Module Overview

Exit recycling calculations model how VC funds can reinvest early exit proceeds
back into new investments within LPA-defined limits. This extends a fund's
deployment capacity beyond initial committed capital during the recycling
period.

**Key Responsibilities:**

- Calculate maximum recyclable capital based on fund size and cap percentage
- Determine exit eligibility based on recycling period
- Apply recycling rates to eligible proceeds
- Enforce recycling caps chronologically across multiple exits
- Generate year-by-year recycling schedules
- Validate recycling configurations against industry norms

**Integration Points:**

- **Fee Calculations** (`client/src/lib/fee-calculations.ts`): Management fee
  recycling is separate but complementary
- **Modeling Wizard** (`client/src/components/modeling-wizard`): Collects
  recycling policy inputs
- **Fund Calc V2** (`client/src/lib/fund-calc-v2.ts`): Uses recycling capacity
  for deployment planning

---

## Core Concepts

### What is Exit Recycling?

Exit recycling allows a VC fund to reinvest a portion of early exit proceeds
rather than immediately distributing all proceeds to LPs. This extends
investment capacity beyond the initial fund size.

**Example:**

- $100M fund with 15% recycling cap ($15M maximum)
- Exit in year 3: $50M gross, 20% ownership = $10M fund proceeds
- 75% recycling rate: $7.5M recycled, $2.5M distributed to LPs
- Extended capacity: $100M + $7.5M = $107.5M total deployable

### Recycling Capacity

**Maximum Recyclable Capital** is calculated as a percentage of committed
capital:

```typescript
maxRecyclableCapital = fundSize × (recyclingCapPercent / 100)
```

**Annual Recycling Capacity** distributes the cap evenly across the recycling
period:

```typescript
annualRecyclingCapacity = maxRecyclableCapital / recyclingPeriod;
```

**Example:**

- Fund: $100M
- Cap: 15% = $15M
- Period: 5 years
- Annual capacity: $15M / 5 = $3M/year

### Exit Events and Eligibility

An **ExitEvent** represents a portfolio company exit:

```typescript
interface ExitEvent {
  id: string;
  year: number; // Relative to vintage
  grossProceeds: number; // Total exit value ($M)
  ownershipPercent: number; // Fund's stake (%)
  fundProceeds: number; // Fund's share ($M)
  withinRecyclingPeriod: boolean; // Eligibility flag
}
```

**Eligibility Rule**: An exit is eligible if `exitYear <= recyclingPeriod`

**Example:**

- Recycling period: 5 years
- Exit in year 3: ✅ Eligible (3 <= 5)
- Exit in year 7: ❌ Not eligible (7 > 5)

### Recycling Rate

The **exit recycling rate** determines what percentage of eligible proceeds are
recycled vs. distributed:

```typescript
recycledAmount = min(
  eligibleProceeds × (recyclingRate / 100),
  remainingCapacity
)
```

**Example:**

- Exit proceeds: $10M (eligible)
- Recycling rate: 75%
- Potential recycling: $10M × 0.75 = $7.5M
- Returned to LPs: $10M - $7.5M = $2.5M

### Cap Enforcement

Recycling cap is enforced **chronologically** across all exits:

1. Sort exits by year
2. Process in order
3. Track remaining capacity
4. Stop when cap reached
5. Excess proceeds to LPs

**Example:**

- Cap: $15M, Rate: 100%
- Exit A (year 2): $10M → recycle $10M, remaining: $5M
- Exit B (year 3): $8M → recycle $5M (cap limit), return $3M to LPs
- Exit C (year 4): $5M → recycle $0 (cap exhausted), return $5M to LPs

### Term Limits

The **recycling period** defines the eligibility window measured from fund
vintage year:

- **Typical Range**: 3-5 years
- **Short Periods** (<3 years): May not capture meaningful exits
- **Long Periods** (>7 years): May overlap with fund harvest period
- **Maximum**: 10 years (validation limit)

**Boundary Condition**: Year == period is **inclusive** (year 5 exit eligible in
5-year period)

---

## Mathematical Foundations

### Capacity Calculations

**Formula 1: Maximum Recyclable Capital**

```
maxRecyclableCapital = fundSize × (recyclingCapPercent / 100)
```

Example: $100M fund × 15% = $15M cap

**Formula 2: Annual Recycling Capacity**

```
annualCapacity = maxRecyclableCapital / recyclingPeriod
```

Example: $15M cap / 5 years = $3M/year

---

### Exit Recycling Calculations

**Formula 3: Recyclable Amount from Single Exit**

```
IF exitYear <= recyclingPeriod THEN
  potentialRecycling = fundProceeds × (recyclingRate / 100)
  recycledAmount = MIN(potentialRecycling, remainingCapacity)
ELSE
  recycledAmount = 0
END IF
```

**Formula 4: LP Distribution**

```
returnedToLPs = fundProceeds - recycledAmount
```

---

### Schedule Calculation Algorithm

**Input:**

- Exits: Array of exit events
- Recycling rate: Percentage to recycle
- Max cap: Total recycling capacity

**Algorithm:**

1. Sort exits chronologically by year
2. Initialize: `remainingCapacity = maxRecyclableCapital`
3. For each exit in order:
   - Check eligibility: `withinRecyclingPeriod`
   - Calculate: `recycledAmount = min(proceeds × rate, remainingCapacity)`
   - Update: `remainingCapacity -= recycledAmount`
   - Record: LP distribution = proceeds - recycled
4. Aggregate: Build cumulative totals by year
5. Return: Complete schedule with breakdown

**Complexity**: O(n log n) for sorting + O(n) for processing = O(n log n)

---

### Extended Investment Capacity

Exit recycling extends the fund's total deployable capital:

**Formula 5: Effective Deployment Rate**

```
effectiveDeploymentRate = ((fundSize + totalRecycled) / fundSize) × 100
```

Example:

- Fund: $100M
- Total recycled: $15M
- Effective rate: ($115M / $100M) × 100 = 115%

---

## API Reference

### Capacity Calculation Functions

#### `calculateMaxRecyclableCapital(fundSize, recyclingCapPercent)`

Calculates maximum recyclable capital based on fund size and cap percentage.

**Parameters:**

- `fundSize: number` - Total committed capital ($M)
- `recyclingCapPercent: number` - Cap as percentage (e.g., 15 for 15%)

**Returns:** `number` - Maximum recyclable capital ($M)

**Example:**

```typescript
const maxCap = calculateMaxRecyclableCapital(100, 15);
// Returns: 15 (15% of $100M)
```

**Code:** `client/src/lib/exit-recycling-calculations.ts:158-163`

---

#### `calculateAnnualRecyclingCapacity(maxRecyclableCapital, recyclingPeriod)`

Distributes total cap evenly across recycling period for pacing analysis.

**Parameters:**

- `maxRecyclableCapital: number` - Total cap ($M)
- `recyclingPeriod: number` - Period in years

**Returns:** `number` - Annual capacity ($M/year)

**Example:**

```typescript
const annual = calculateAnnualRecyclingCapacity(15, 5);
// Returns: 3 ($15M over 5 years)
```

**Code:** `client/src/lib/exit-recycling-calculations.ts:175-181`

---

#### `calculateRecyclingCapacity(fundSize, recyclingCapPercent, recyclingPeriod)`

Main entry point for capacity calculations. Returns all capacity metrics.

**Parameters:**

- `fundSize: number` - Fund size ($M)
- `recyclingCapPercent: number` - Cap percentage
- `recyclingPeriod: number` - Period in years

**Returns:** `RecyclingCapacity`

```typescript
interface RecyclingCapacity {
  maxRecyclableCapital: number;
  recyclingCapPercentage: number;
  recyclingPeriodYears: number;
  annualRecyclingCapacity: number;
}
```

**Code:** `client/src/lib/exit-recycling-calculations.ts:189-210`

---

### Exit Processing Functions

#### `calculateRecyclableFromExit(exitProceeds, recyclingRate, remainingCapacity, withinPeriod)`

Calculates recyclable amount from a single exit with cap enforcement.

**Parameters:**

- `exitProceeds: number` - Fund's share of exit ($M)
- `recyclingRate: number` - Recycling rate (%)
- `remainingCapacity: number` - Remaining cap space ($M)
- `withinPeriod: boolean` - Eligibility flag

**Returns:** `number` - Recycled amount ($M)

**Logic:**

- If not within period: return 0
- If no remaining capacity: return 0
- Otherwise: min(proceeds × rate, remaining capacity)

**Code:** `client/src/lib/exit-recycling-calculations.ts:228-239`

---

#### `calculateSingleExitRecycling(exitEvent, recyclingRate, remainingCapacity)`

Returns complete recycling calculation breakdown for one exit.

**Parameters:**

- `exitEvent: ExitEvent` - Exit event details
- `recyclingRate: number` - Recycling rate (%)
- `remainingCapacity: number` - Remaining cap ($M)

**Returns:** `RecyclingCalculation`

```typescript
interface RecyclingCalculation {
  exitId: string;
  exitYear: number;
  fundProceeds: number;
  eligibleProceeds: number;
  recycledAmount: number;
  returnedToLPs: number;
  withinPeriod: boolean;
  appliedRate: number;
}
```

**Code:** `client/src/lib/exit-recycling-calculations.ts:246-274`

---

#### `calculateRecyclingSchedule(exits, recyclingRate, maxRecyclableCapital)`

Processes all exits chronologically, tracking cumulative recycling and enforcing
cap.

**Parameters:**

- `exits: ExitEvent[]` - Array of exit events
- `recyclingRate: number` - Recycling rate (%)
- `maxRecyclableCapital: number` - Total cap ($M)

**Returns:** `RecyclingSchedule`

```typescript
interface RecyclingSchedule {
  recyclingByExit: RecyclingCalculation[];
  totalRecycled: number;
  totalReturnedToLPs: number;
  remainingCapacity: number;
  capReached: boolean;
  cumulativeByYear: Array<{
    year: number;
    cumulativeRecycled: number;
    annualRecycled: number;
  }>;
}
```

**Algorithm:**

1. Sort exits by year
2. Process chronologically with capacity tracking
3. Build per-exit calculations
4. Aggregate cumulative by year

**Code:** `client/src/lib/exit-recycling-calculations.ts:287-345`

---

### Main Entry Point

#### `calculateExitRecycling(config, fundSize, exits?)`

Main calculation entry point. Derives all recycling metrics from user inputs.

**Parameters:**

- `config: ExitRecyclingInput` - Recycling configuration
  ```typescript
  interface ExitRecyclingInput {
    enabled: boolean;
    recyclingCap?: number;
    recyclingPeriod?: number;
    exitRecyclingRate?: number;
    mgmtFeeRecyclingRate?: number;
  }
  ```
- `fundSize: number` - Total fund size ($M)
- `exits?: ExitEvent[]` - Optional exit events for schedule

**Returns:** `ExitRecyclingCalculations`

```typescript
interface ExitRecyclingCalculations {
  enabled: boolean;
  capacity: RecyclingCapacity;
  schedule?: RecyclingSchedule;
  extendedInvestmentCapacity: number;
  effectiveDeploymentRate: number;
}
```

**Usage:**

```typescript
const calculations = calculateExitRecycling(
  {
    enabled: true,
    recyclingCap: 15,
    recyclingPeriod: 5,
    exitRecyclingRate: 75,
    mgmtFeeRecyclingRate: 0,
  },
  100, // $100M fund
  [] // No exits yet
);

// Results:
// calculations.capacity.maxRecyclableCapital = 15
// calculations.extendedInvestmentCapacity = 15
```

**Code:** `client/src/lib/exit-recycling-calculations.ts:401-455`

---

### Validation Functions

#### `validateExitRecycling(config, fundSize)`

Validates recycling configuration for logical consistency and industry norms.

**Parameters:**

- `config: ExitRecyclingInput` - Configuration to validate
- `fundSize: number` - Fund size for context

**Returns:** `ValidationResult`

```typescript
interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}
```

**Validation Rules:**

Errors (blocking):

- Cap outside [0%, 25%]
- Period outside [1, 10] years
- Rate outside [0%, 100%]

Warnings (informational):

- Cap >20%: "uncommon and may face LP scrutiny"
- Cap <5%: "may provide limited deployment flexibility"
- Period <3 years: "may not capture meaningful exits"
- Period >7 years: "may overlap with fund harvest period"
- Rate <50%: "reduces effective recycling capacity"

**Code:** `client/src/lib/exit-recycling-calculations.ts:470-585`

---

### Helper Functions

#### `isExitWithinRecyclingPeriod(exitYear, recyclingPeriod)`

Determines if exit is eligible for recycling based on timing.

**Parameters:**

- `exitYear: number` - Exit year relative to vintage
- `recyclingPeriod: number` - Recycling period (years)

**Returns:** `boolean` - True if eligible

**Logic:** `return exitYear <= recyclingPeriod` (inclusive boundary)

**Code:** `client/src/lib/exit-recycling-calculations.ts:596-601`

---

#### `createExitEvent(params)`

Helper to construct ExitEvent objects for testing and modeling.

**Parameters:**

```typescript
{
  id: string;
  year: number;
  grossProceeds: number;
  ownershipPercent: number;
  recyclingPeriod: number;
}
```

**Returns:** `ExitEvent` with calculated `fundProceeds` and
`withinRecyclingPeriod`

**Code:** `client/src/lib/exit-recycling-calculations.ts:611-632`

---

## Test Coverage

**Test Suite**: `client/src/lib/__tests__/exit-recycling-calculations.test.ts`

**Categories:**

1. **Capacity Calculations** (15 tests)
   - Basic capacity calculation
   - Annual capacity distribution
   - Edge cases (zero period, large funds)

2. **Schedule Calculations** (15 tests)
   - Single exit scenarios
   - Multiple exit coordination
   - Cumulative tracking
   - Year-by-year aggregation

3. **Cap Enforcement** (10 tests)
   - Exact cap boundary
   - Cap exceeded scenarios
   - Mid-exit cap limits
   - Partial recycling due to cap

4. **Term Validation** (10 tests)
   - Within period eligibility
   - After period ineligibility
   - Boundary conditions (year == period)
   - Mixed timing scenarios

**Truth Cases**: `docs/exit-recycling.truth-cases.json` (20 canonical scenarios)

---

## Error Handling

**Validation Errors** are returned via `ValidationResult`, not thrown:

- Errors prevent calculation (blocking)
- Warnings shown to user (informational)
- Always check `isValid` before using results

**Edge Cases Handled:**

- Zero recycling period: returns 0 annual capacity
- No remaining capacity: returns 0 recycled amount
- Exit after period: returns 0 recycled, 100% to LPs
- Floating-point tolerance: 0.01 for cap reached check

**No Exceptions Thrown** - all functions return safe values or validation
results

---

## Performance Characteristics

**Time Complexity:**

- Capacity calculations: O(1)
- Single exit recycling: O(1)
- Schedule calculation: O(n log n) where n = number of exits
  - Sorting: O(n log n)
  - Processing: O(n)
  - Aggregation: O(n)

**Space Complexity:**

- Capacity: O(1)
- Schedule: O(n) for exit calculations + O(m) for yearly aggregation where m =
  unique years

**Scalability:**

- Typical fund: 10-50 exits → <1ms processing time
- Large fund: 100+ exits → still <10ms
- No database calls, pure computation
- Suitable for real-time UI updates

---

## Related Documentation

- **Architecture Decision**:
  [ADR-007: Exit Recycling Policy](../adr/ADR-007-exit-recycling-policy.md)
- **Schema Definition**: `shared/schemas/recycling-policy.ts`
- **Wizard Integration**:
  `client/src/components/modeling-wizard/steps/ExitRecyclingStep.tsx`
- **Fee Integration**: `client/src/lib/fee-calculations.ts` (management fee
  recycling)
- **Truth Cases**: `docs/exit-recycling.truth-cases.json`
- **Validation Framework**: `scripts/validation/exit-recycling-validation.yaml`

---

## Change Log

**Initial Implementation** (ADR-007)

- Percentage-based cap relative to committed capital
- Year-based recycling periods (1-10 years)
- Time-based eligibility (within recycling period)
- Configurable recycling rates (0-100%)
- Chronological cap enforcement
- Comprehensive validation with errors and warnings

**Future Considerations**

- Investment-specific exclusions (schema supports, wizard doesn't expose)
- Timing options (quarterly, semi-annual, annual)
- Period extensions (automatic vs. manual)
- Management fee recycling integration
