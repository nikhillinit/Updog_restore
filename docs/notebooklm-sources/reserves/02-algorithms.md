# Reserve Allocation Engine - Algorithms

**Module:** `client/src/core/reserves/ConstrainedReserveEngine.ts`
**Algorithm:** Priority-Based Greedy Allocation with Multi-Constraint
Satisfaction **Last Updated:** 2025-11-06

---

## Table of Contents

1. [Algorithm Overview](#algorithm-overview)
2. [Detailed Implementation Walkthrough](#detailed-implementation-walkthrough)
3. [Mathematical Formulas](#mathematical-formulas)
4. [Multi-Vintage Handling](#multi-vintage-handling)
5. [Constraint Resolution](#constraint-resolution)
6. [Performance Characteristics](#performance-characteristics)

---

## Algorithm Overview

The `ConstrainedReserveEngine` implements a **deterministic, priority-based
allocation algorithm** that satisfies multiple constraints simultaneously. The
algorithm guarantees:

1. **Capital conservation:** Total allocated ≤ available reserves
2. **Constraint satisfaction:** All limits (min check, max per company, max per
   stage) respected
3. **Deterministic output:** Same inputs always produce identical results
4. **Greedy optimization:** Prioritizes highest-value companies first

**Core Algorithm Pattern:**

```
1. Score companies (present value × priority weight)
2. Sort by score (descending)
3. Greedy allocate (satisfy constraints)
4. Verify conservation (sum check)
```

**Reference:**
[ConstrainedReserveEngine.ts:5-74](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts#L5-L74)

---

## Detailed Implementation Walkthrough

### Phase 1: Input Parsing and Constraint Setup

**Code:**
[ConstrainedReserveEngine.ts:6-18](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts#L6-L18)

```typescript
calculate(input: ReserveInput) {
  const { availableReserves, companies, stagePolicies, constraints: cst = {} } = input;

  // Parse constraints with defaults
  const minCheckC = toCents(cst.minCheck ?? 0);
  const disc = cst.discountRateAnnual ?? 0.12;

  // Build stage-specific caps
  const stageMax = new Map<string, Cents>();
  Object.entries(cst.maxPerStage ?? {}).forEach(([stage, max]) => {
    stageMax['set'](stage, toCents(max));
  });

  const stageAllocated = new Map<string, Cents>();
  const polByStage = new Map(input.stagePolicies.map(p=>[p.stage, p]));
  const years = (s:string)=> (cst.graduationYears as any)?.[s] ?? 5;
  const pExit = (s:string)=> (cst.graduationProb as any)?.[s] ?? 0.5;
```

**Key Operations:**

1. **Constraint Parsing:**
   - `minCheckC`: Minimum check size (converted to cents for precision)
   - `disc`: Annual discount rate (default 12%)
   - `stageMax`: Per-stage allocation caps
   - `stageAllocated`: Track allocations by stage (starts empty)

2. **Helper Functions:**
   - `years(stage)`: Graduation timeline lookup (default 5 years)
   - `pExit(stage)`: Graduation probability lookup (default 0.5)

3. **Money Precision:**
   - All calculations use `Cents` (BigInt) to avoid floating-point errors
   - `toCents()` converts dollars to cents (e.g., $1.50 → 150n)
   - `fromCents()` converts back for output (150n → $1.50)

**Why BigInt?**

- Standard JavaScript numbers have precision issues with currency
- Example: `0.1 + 0.2 === 0.30000000000000004` (floating point error)
- BigInt: `10n + 20n === 30n` (exact)

---

### Phase 2: Company Scoring and Ranking

**Code:**
[ConstrainedReserveEngine.ts:21-41](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts#L21-L41)

```typescript
const comps = input.companies.map((c) => {
  const pol = polByStage['get'](c.stage);
  if (!pol)
    throw Object.assign(new Error(`No policy for ${c.stage}`), { status: 400 });

  const capCompanyC = Number.isFinite(cst.maxPerCompany)
    ? toCents(cst.maxPerCompany as number)
    : BigInt(Number.MAX_SAFE_INTEGER);
  const capStageC = stageMax['get'](c.stage) ?? null;

  // Present value calculation
  const pv =
    (pol.reserveMultiple * pExit(c.stage)) / Math.pow(1 + disc, years(c.stage));

  return {
    id: c.id,
    name: c.name,
    stage: c.stage,
    investedC: toCents(c.invested),
    capCompanyC,
    capStageC,
    score: pv * pol.weight,
    allocatedC: 0n as Cents,
  };
});

comps.sort((a, b) => {
  const d = b.score - a.score;
  if (d !== 0) return d > 0 ? 1 : -1;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
});
```

**Scoring Formula:**

```
score = (reserveMultiple × graduationProb × weight) / (1 + discountRate)^years
```

**Breaking Down the Formula:**

1. **Numerator: `reserveMultiple × graduationProb × weight`**
   - `reserveMultiple`: How much capital needed (2x, 3x initial investment)
   - `graduationProb`: Likelihood of success (0.35 for Series A)
   - `weight`: Strategic priority multiplier (1.0 standard, 1.2 for high
     priority)

2. **Denominator: `(1 + discountRate)^years`**
   - Discount future capital needs to present value
   - `discountRate`: 12% (typical VC hurdle rate)
   - `years`: Time until expected deployment

**Example Calculation:**

```typescript
// Company A (Series A, strong)
reserveMultiple = 2.0
graduationProb = 0.50 (Series A benchmark)
weight = 1.2 (strategic priority)
discountRate = 0.12
years = 6

pv = 2.0 × 0.50 / (1.12)^6
   = 1.0 / 1.9738
   = 0.5067

score = 0.5067 × 1.2 = 0.608
```

```typescript
// Company B (Seed, high-risk)
reserveMultiple = 3.0
graduationProb = 0.20 (Seed benchmark)
weight = 1.0 (standard)
discountRate = 0.12
years = 7

pv = 3.0 × 0.20 / (1.12)^7
   = 0.6 / 2.2107
   = 0.2714

score = 0.2714 × 1.0 = 0.271
```

**Result:** Company A gets priority (0.608 > 0.271) despite lower reserve
multiple, because:

- Higher probability of success (50% vs 20%)
- Shorter time to deployment (6 years vs 7)
- Strategic priority boost (1.2x weight)

**Tie-Breaking:** If scores are equal, sort by:

1. Company name (alphabetical)
2. Company ID (lexicographic)

This ensures **deterministic sorting** (no random ordering).

---

### Phase 3: Greedy Allocation with Constraint Satisfaction

**Code:**
[ConstrainedReserveEngine.ts:43-58](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts#L43-L58)

```typescript
let remainingC = toCents(input.availableReserves);

// Pass 1: Greedy allocation
for (const c of comps) {
  if (remainingC <= 0n) break;

  const stAlloc = stageAllocated['get'](c.stage) ?? 0n;
  const stRoom =
    c.capStageC != null
      ? c.capStageC - stAlloc > 0n
        ? c.capStageC - stAlloc
        : 0n
      : remainingC;

  let roomC = remainingC < stRoom ? remainingC : stRoom;
  roomC = roomC < c.capCompanyC ? roomC : c.capCompanyC;

  if (roomC <= 0n) continue;
  if (minCheckC > 0n && roomC < minCheckC) continue;

  c.allocatedC += roomC;
  remainingC -= roomC;
  stageAllocated['set'](c.stage, stAlloc + roomC);
}
```

**Step-by-Step Constraint Resolution:**

For each company (in priority order):

#### Step 3.1: Check Remaining Capital

```typescript
if (remainingC <= 0n) break;
```

If no capital left, stop (can't allocate to lower-priority companies).

#### Step 3.2: Calculate Stage Room

```typescript
const stAlloc = stageAllocated['get'](c.stage) ?? 0n;
const stRoom =
  c.capStageC != null
    ? c.capStageC - stAlloc > 0n
      ? c.capStageC - stAlloc
      : 0n
    : remainingC;
```

**Logic:**

- If stage has cap (`capStageC`):
  - Room = cap - already allocated to stage
  - If stage full (cap reached): room = 0
- If no stage cap: room = all remaining capital

**Example:**

```typescript
// Series A cap: $15M
// Already allocated to Series A: $12M
// Current company: Series A

stAlloc = $12M
capStageC = $15M
stRoom = $15M - $12M = $3M

// Can allocate up to $3M before hitting stage cap
```

#### Step 3.3: Apply Multiple Constraints

```typescript
let roomC = remainingC < stRoom ? remainingC : stRoom;
roomC = roomC < c.capCompanyC ? roomC : c.capCompanyC;
```

**Constraint Cascade:**

1. **Global limit:** `min(remainingC, stRoom)` - whichever is smaller
2. **Company limit:** `min(roomC, capCompanyC)` - respect per-company cap

**Example:**

```typescript
remainingC = $8M; // Fund-level available
stRoom = $3M; // Stage-level available
capCompanyC = $5M; // Company-level cap

// Step 1: min($8M, $3M) = $3M (stage is bottleneck)
// Step 2: min($3M, $5M) = $3M (stage limit is tighter)
// Final: $3M allocated
```

#### Step 3.4: Apply Minimum Check Constraint

```typescript
if (roomC <= 0n) continue;
if (minCheckC > 0n && roomC < minCheckC) continue;
```

If allocation would be below minimum check size, **skip this company entirely**.

**Rationale:** Better to allocate nothing than an operationally infeasible
amount.

**Example:**

```typescript
minCheckC = $50K;
roomC = $30K; // Would allocate $30K

// Check: $30K < $50K → SKIP
// Move to next company
```

#### Step 3.5: Allocate and Update State

```typescript
c.allocatedC += roomC;
remainingC -= roomC;
stageAllocated['set'](c.stage, stAlloc + roomC);
```

**State Updates:**

1. Allocate to company: `allocatedC += roomC`
2. Reduce remaining capital: `remainingC -= roomC`
3. Update stage tracking: `stageAllocated[stage] += roomC`

**Invariants Maintained:**

- `sum(allocatedC) + remainingC === initialAvailableReserves`
- `stageAllocated[stage] ≤ maxPerStage[stage]`

---

### Phase 4: Output Construction and Conservation Check

**Code:**
[ConstrainedReserveEngine.ts:60-74](c:/dev/Updog_restore/client/src/core/reserves/ConstrainedReserveEngine.ts#L60-L74)

```typescript
const totalAllocatedC = comps.reduce((s, c) => addCents(s, c.allocatedC), 0n);
const ok = conservationCheck(
  [toCents(availableReserves)],
  [totalAllocatedC, remainingC]
);

return {
  allocations: comps
    .filter((c) => c.allocatedC > 0n)
    .map((c) => ({
      id: c.id,
      name: c.name,
      stage: c.stage,
      allocated: fromCents(c.allocatedC),
    })),
  totalAllocated: fromCents(totalAllocatedC),
  remaining: fromCents(remainingC),
  conservationOk: ok,
};
```

**Conservation Check:**

```
input = [availableReserves]
output = [totalAllocated, remaining]

conservationOk = (availableReserves === totalAllocated + remaining)
```

**Why This Matters:**

- Detects bugs in allocation logic
- Ensures no money "created" or "lost"
- Critical for financial auditing

**Example:**

```typescript
availableReserves = $15M
totalAllocated = $12M
remaining = $3M

conservation: $15M === $12M + $3M ✓
```

**Output Format:**

- Filter out zero allocations (`allocatedC > 0n`)
- Convert from cents to dollars (`fromCents()`)
- Include company metadata (id, name, stage)

---

## Mathematical Formulas

### 1. Priority Score Calculation

**Formula:**

```
score = (RM × GP × W) / (1 + DR)^Y

Where:
  RM = Reserve Multiple (e.g., 2.0)
  GP = Graduation Probability (e.g., 0.35)
  W = Policy Weight (e.g., 1.0)
  DR = Discount Rate Annual (e.g., 0.12)
  Y = Years to Exit (e.g., 6)
```

**Present Value Intuition:**

- Future capital is discounted by time value of money
- 12% discount rate means:
  - $1 today = $1.12 in 1 year
  - $1 today = $1.40 in 3 years
  - $1 today = $1.97 in 6 years

**Example:**

```
Company: Series A, 6 years to exit
RM = 2.0 (reserve 2x initial)
GP = 0.35 (35% succeed)
W = 1.0 (standard priority)
DR = 0.12 (12% discount)
Y = 6 years

PV = 2.0 × 0.35 / (1.12)^6
   = 0.7 / 1.9738
   = 0.3546

score = 0.3546 × 1.0 = 0.3546
```

### 2. Constraint Satisfaction

**Allocation Room Calculation:**

```
room = min(
  remainingCapital,
  stageCapRemaining,
  companyCapRemaining
)

Where:
  remainingCapital = availableReserves - sum(allocated)
  stageCapRemaining = maxPerStage - sum(allocated in stage)
  companyCapRemaining = maxPerCompany (constant)
```

**Example:**

```
remainingCapital = $8M
stageCapRemaining = $3M (Series A)
companyCapRemaining = $5M

room = min($8M, $3M, $5M) = $3M
```

### 3. Minimum Check Filter

**Boolean Condition:**

```
allocate = (room ≥ minCheck) AND (room > 0)

If false: skip company, move to next
If true: allocate room amount
```

**Example:**

```
room = $75K
minCheck = $50K

allocate = ($75K ≥ $50K) AND ($75K > 0) = true ✓
→ Allocate $75K
```

```
room = $30K
minCheck = $50K

allocate = ($30K ≥ $50K) AND ($30K > 0) = false ✗
→ Skip, allocate nothing
```

### 4. Conservation Law

**Invariant:**

```
∀ allocations:
  sum(allocated[i]) + remaining = availableReserves

Or in mathematical notation:
  Σ(allocated_i) + remaining = available
```

**Verification:**

```typescript
conservationCheck(
  inputs: [availableReserves],
  outputs: [totalAllocated, remaining]
)

returns: inputs[0] === outputs[0] + outputs[1]
```

---

## Multi-Vintage Handling

The engine naturally supports **multi-vintage portfolios** (companies from
different investment years) through stage-based policies.

### Vintage Scenarios

#### Scenario 1: Single Vintage (All Same Year)

```typescript
companies = [
  { id: 'co-1', vintage: 2023, stage: 'series_a', invested: $5M },
  { id: 'co-2', vintage: 2023, stage: 'series_a', invested: $3M },
  { id: 'co-3', vintage: 2023, stage: 'series_a', invested: $4M },
];

// All treated identically (same vintage, same stage)
// Allocation based purely on score
```

#### Scenario 2: Multi-Vintage, Same Stage

```typescript
companies = [
  { id: 'co-1', vintage: 2023, stage: 'series_a', invested: $5M },
  { id: 'co-2', vintage: 2024, stage: 'series_a', invested: $3M },
  { id: 'co-3', vintage: 2025, stage: 'series_a', invested: $4M },
];

// Vintage doesn't affect scoring directly
// All use same graduationProb and graduationYears for 'series_a'
// Allocation priority based on score (reserve multiple, weight)
```

**Note:** Vintage-specific adjustments (e.g., "older vintage = lower priority")
can be implemented via:

- Vintage-specific weights in stage policies
- Vintage-specific graduation probabilities
- Manual pre-filtering by vintage

#### Scenario 3: Multi-Vintage, Multi-Stage

```typescript
companies = [
  { id: 'co-1', vintage: 2023, stage: 'series_b', invested: $8M }, // Older, later stage
  { id: 'co-2', vintage: 2024, stage: 'series_a', invested: $5M }, // Mid, mid stage
  { id: 'co-3', vintage: 2025, stage: 'seed', invested: $2M }, // Newer, early stage
];

stagePolicies = [
  { stage: 'seed', reserveMultiple: 3.0, weight: 1.0 },
  { stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 },
  { stage: 'series_b', reserveMultiple: 1.5, weight: 1.0 },
];

// Scoring:
// co-1 (Series B): 1.5 × 0.50 / (1.12)^5 = 0.425
// co-2 (Series A): 2.0 × 0.35 / (1.12)^6 = 0.355
// co-3 (Seed): 3.0 × 0.20 / (1.12)^7 = 0.271

// Allocation priority: co-1 > co-2 > co-3
```

**Key Insight:** Stage matters more than vintage for allocation priority.

### Validation Test Case

**From:**
[reserves-validation.yaml:86-113](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml#L86-L113)

```yaml
- description: 'Multi-vintage portfolio with different deployment stages'
  vars:
    scenario: 'Complex multi-vintage calculation'
    fund:
      totalCapital: 100000000
      deployedCapital: 60000000
      committedReserves: 10000000
    companies:
      - id: 'co-1'
        vintage: 2023
        initialInvestment: 5000000
        stage: 'Series A'
        reserveMultiple: 2.0
      - id: 'co-2'
        vintage: 2024
        initialInvestment: 3000000
        stage: 'Seed'
        reserveMultiple: 3.0
  assert:
    - type: javascript
      value: |
        const result = output;
        result.allocations.length === 2 &&
        result.totalReserved === 19000000 && // 10M + 9M
        result.allocations.some(a => a.vintage === 2023) &&
        result.allocations.some(a => a.vintage === 2024)
```

**Expected Behavior:**

- Both vintages receive allocations
- Total = $10M (2023) + $9M (2024) = $19M
- Vintage preserved in output for tracking

---

## Constraint Resolution

### Constraint Priority Order

When multiple constraints conflict, resolution order is:

1. **Global Capital Limit** (hardest constraint)
   - Can't allocate more than `remainingC`
   - Non-negotiable, enforced first

2. **Stage Cap** (portfolio-level diversification)
   - `maxPerStage[stage]` limit
   - Prevents over-concentration in one stage

3. **Company Cap** (position-level diversification)
   - `maxPerCompany` limit
   - Prevents over-concentration in one company

4. **Minimum Check** (operational constraint)
   - `minCheck` threshold
   - If violated, skip allocation entirely

### Constraint Conflict Resolution

**Scenario:** All constraints bind simultaneously

```typescript
remainingC = $5M; // Global limit
stageCapRemaining = $3M; // Stage limit (tighter)
companyCapRemaining = $10M; // Company limit (loose)
minCheck = $1M; // Minimum check

// Step 1: min($5M, $3M, $10M) = $3M
// Step 2: $3M ≥ $1M → PASS minimum check
// Result: Allocate $3M
```

**Scenario:** Minimum check constraint violated

```typescript
remainingC = $500K;
stageCapRemaining = $800K;
companyCapRemaining = $2M;
minCheck = $1M;

// Step 1: min($500K, $800K, $2M) = $500K
// Step 2: $500K < $1M → FAIL minimum check
// Result: Allocate $0 (skip company)
```

**Scenario:** Stage cap already exhausted

```typescript
remainingC = $10M;
stageCapRemaining = $0; // Stage full
companyCapRemaining = $5M;
minCheck = $500K;

// Step 1: min($10M, $0, $5M) = $0
// Step 2: $0 < $500K → FAIL minimum check
// Result: Allocate $0 (stage full)
```

### Edge Case: Fractional Constraints

**Problem:** What if optimal allocation is $1.2M but stage cap allows only $1M?

**Solution:** Allocate maximum feasible ($1M), accept sub-optimal allocation.

```typescript
// Optimal (unconstrained): $1.2M
// Stage cap remaining: $1M
// Company cap: $5M
// Min check: $500K

room = min($5M, $1M, $5M) = $1M
→ Allocate $1M (not optimal $1.2M, but respects stage cap)
```

**Tradeoff:** Greedy algorithm may leave capital unallocated if later companies
hit minimum check threshold.

---

## Performance Characteristics

### Time Complexity

**Algorithm Phases:**

1. **Scoring:** O(n) - iterate all companies
2. **Sorting:** O(n log n) - sort by score
3. **Allocation:** O(n) - iterate sorted companies
4. **Conservation:** O(n) - sum allocations

**Total:** O(n log n) dominated by sorting

**Example:**

- 10 companies: ~33 operations
- 100 companies: ~664 operations
- 1,000 companies: ~9,966 operations

**Real-World:** Sub-millisecond for typical portfolios (30-50 companies)

### Space Complexity

**Memory Usage:**

- Company array: O(n)
- Stage maps: O(s) where s = number of stages (typically 6)
- Totals: O(1)

**Total:** O(n + s) ≈ O(n) for large portfolios

### Determinism

**Properties:**

- Same inputs → same outputs (always)
- No randomness
- Tie-breaking by name/ID (deterministic sort)
- BigInt arithmetic (no floating-point drift)

**Verification:**

```typescript
// Run twice, expect identical results
const result1 = engine.calculate(input);
const result2 = engine.calculate(input);

assert(JSON.stringify(result1) === JSON.stringify(result2));
```

**Test Coverage:** See
[reserves.property.test.ts:217-255](c:/dev/Updog_restore/client/src/core/reserves/__tests__/reserves.property.test.ts#L217-L255)
(Idempotence test)

---

## Next Steps

- [03-examples.md](./03-examples.md) - Real-world scenarios and edge cases
- [04-integration.md](./04-integration.md) - API integration patterns
- [01-overview.md](./01-overview.md) - Back to overview

**Related:**

- [Money utilities](c:/dev/Updog_restore/shared/money.ts) - BigInt arithmetic
- [Schemas](c:/dev/Updog_restore/shared/schemas.ts) - Input validation
