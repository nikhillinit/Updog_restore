---
status: ACTIVE
last_updated: 2026-01-19
---

# PacingEngine Strategies: Mathematical Formulas and Algorithms

**Module:** `client/src/core/pacing/PacingEngine.ts` **Purpose:** Detailed
mathematical formulas and implementation details for all pacing strategies
**Estimated Reading Time:** 8-12 minutes **Target Audience:** Developers
implementing pacing logic, data scientists, financial analysts

---

## Table of Contents

1. [Base Formula and Constraints](#base-formula-and-constraints)
2. [Rule-Based Pacing Algorithm](#rule-based-pacing-algorithm)
3. [Market Condition Strategies](#market-condition-strategies)
4. [ML-Enhanced Pacing Algorithm](#ml-enhanced-pacing-algorithm)
5. [Deterministic Variability](#deterministic-variability)
6. [Edge Cases and Boundary Conditions](#edge-cases-and-boundary-conditions)
7. [Mathematical Proofs and Invariants](#mathematical-proofs-and-invariants)

---

## Base Formula and Constraints

### Core Equation

For a fund of size `F` deployed over 8 quarters, the base deployment amount per
quarter is:

```
BaseAmount = F / 8
```

Each quarter `q` (where `q ∈ {0, 1, 2, ..., 7}`) receives:

```
Deployment(q) = BaseAmount × Multiplier(q, market) × Variability(q)
```

Where:

- **`Multiplier(q, market)`**: Phase and market-dependent factor
- **`Variability(q)`**: Deterministic pseudo-random variance ∈ [0.9, 1.1]

### Hard Constraints

**Implemented:** [PacingInputSchema validation](shared/types.ts#L113)

1. **Fund Size Constraint:**

   ```
   F ≥ 0 (enforced by Zod)
   ```

2. **Quarter Constraint:**

   ```
   deploymentQuarter ≥ 1 (integer, enforced by Zod)
   ```

3. **Market Condition Constraint:**

   ```
   marketCondition ∈ {'bull', 'bear', 'neutral'}
   ```

4. **Output Constraint:**

   ```
   ∀q: Deployment(q) ≥ 0 (always non-negative)
   ```

5. **Total Deployment Constraint (soft):**
   ```
   0.9F ≤ ∑(Deployment(q)) ≤ 1.1F
   ```
   _Soft constraint due to variability; typically converges to ~F_

**Test Evidence:**
[pacing-engine.test.ts:157-167](tests/unit/engines/pacing-engine.test.ts#L157)
validates total deployment is within 10% of fund size.

### Phase Determination

The 8-quarter schedule is divided into three phases:

```
Phase(q) = {
  'early'  if q ∈ {0, 1, 2}
  'mid'    if q ∈ {3, 4, 5}
  'late'   if q ∈ {6, 7}
}
```

**Implementation:**
[PacingEngine.ts:70-85](client/src/core/pacing/PacingEngine.ts#L70)

```typescript
if (i < 3) {
  phase = 'early';
  multiplier = adjustment.early;
} else if (i < 6) {
  phase = 'mid';
  multiplier = adjustment.mid;
} else {
  phase = 'late';
  multiplier = adjustment.late;
}
```

---

## Rule-Based Pacing Algorithm

### Algorithm Overview

The **rule-based pacing** algorithm is the default mode
([PacingEngine.ts:52-95](client/src/core/pacing/PacingEngine.ts#L52)):

```
FOR each quarter q in [0, 7]:
  1. Calculate base_amount = F / 8
  2. Determine phase = Phase(q)
  3. Lookup multiplier = MarketAdjustment[market][phase]
  4. Generate variability = 0.9 + (PRNG.next() × 0.2)
  5. Calculate deployment = base_amount × multiplier × variability
  6. Round deployment to integer
  7. Assign phase note
RETURN deployments[]
```

### Pseudocode

```python
def calculate_rule_based_pacing(fund_size, deployment_quarter, market_condition):
    # Market multipliers
    adjustments = {
        'bull': {'early': 1.3, 'mid': 1.1, 'late': 0.8},
        'bear': {'early': 0.7, 'mid': 0.9, 'late': 1.2},
        'neutral': {'early': 1.0, 'mid': 1.0, 'late': 1.0}
    }

    base_amount = fund_size / 8
    deployments = []

    for i in range(8):
        quarter = deployment_quarter + i

        # Determine phase
        if i < 3:
            phase = 'early'
        elif i < 6:
            phase = 'mid'
        else:
            phase = 'late'

        # Get multiplier
        multiplier = adjustments[market_condition][phase]

        # Add variability
        variability = 0.9 + (PRNG.next() * 0.2)

        # Calculate deployment
        deployment = round(base_amount * multiplier * variability)

        deployments.append({
            'quarter': quarter,
            'deployment': deployment,
            'note': f"{market_condition} market pacing ({phase}-stage)"
        })

    return deployments
```

### Time Complexity

- **Time:** O(8) = O(1) - Fixed 8 iterations
- **Space:** O(8) = O(1) - Fixed-size output array
- **PRNG Cost:** O(1) per call

---

## Market Condition Strategies

### Neutral Market (Linear Pacing)

**Formula:**

```
∀q: Multiplier(q, 'neutral') = 1.0
Deployment(q) = (F/8) × Variability(q)
```

**Expected Distribution:**

| Quarter | Base Amount | Multiplier | Variability Range | Deployment Range |
| ------- | ----------- | ---------- | ----------------- | ---------------- |
| Q0      | F/8         | 1.0        | [0.9, 1.1]        | [0.9F/8, 1.1F/8] |
| Q1      | F/8         | 1.0        | [0.9, 1.1]        | [0.9F/8, 1.1F/8] |
| ...     | ...         | ...        | ...               | ...              |
| Q7      | F/8         | 1.0        | [0.9, 1.1]        | [0.9F/8, 1.1F/8] |

**Example: $50M Fund**

```
BaseAmount = $50M / 8 = $6,250,000

Q0: $6.25M × 1.0 × 1.03 = $6,437,500
Q1: $6.25M × 1.0 × 0.97 = $6,062,500
Q2: $6.25M × 1.0 × 1.08 = $6,750,000
Q3: $6.25M × 1.0 × 0.94 = $5,875,000
Q4: $6.25M × 1.0 × 1.05 = $6,562,500
Q5: $6.25M × 1.0 × 0.91 = $5,687,500
Q6: $6.25M × 1.0 × 1.09 = $6,812,500
Q7: $6.25M × 1.0 × 0.98 = $6,125,000

Total: $50,312,500 (within 0.6% of fund size)
```

**Test Coverage:**
[pacing-engine.test.ts:81-94](tests/unit/engines/pacing-engine.test.ts#L81)

**Validation Test Case:**
[pacing-validation.yaml:10-24](scripts/validation/pacing-validation.yaml#L10) -
"Standard linear pacing calculation"

---

### Bull Market (Front-Loaded Deployment)

**Formula:**

```
Multiplier(q, 'bull') = {
  1.3  if Phase(q) = 'early'  (Q0-2)
  1.1  if Phase(q) = 'mid'    (Q3-5)
  0.8  if Phase(q) = 'late'   (Q6-7)
}

Deployment(q) = (F/8) × Multiplier(q, 'bull') × Variability(q)
```

**Expected Distribution:**

| Phase | Quarters | Multiplier | Share of Total | Deployment Range (per Q) |
| ----- | -------- | ---------- | -------------- | ------------------------ |
| Early | Q0-2     | 1.3        | ~46%           | [1.17F/8, 1.43F/8]       |
| Mid   | Q3-5     | 1.1        | ~39%           | [0.99F/8, 1.21F/8]       |
| Late  | Q6-7     | 0.8        | ~15%           | [0.72F/8, 0.88F/8]       |

**Example: $100M Fund**

```
BaseAmount = $100M / 8 = $12,500,000

Early Phase (Q0-2):
Q0: $12.5M × 1.3 × 1.04 = $16,900,000
Q1: $12.5M × 1.3 × 0.98 = $15,925,000
Q2: $12.5M × 1.3 × 1.07 = $17,387,500

Mid Phase (Q3-5):
Q3: $12.5M × 1.1 × 0.95 = $13,062,500
Q4: $12.5M × 1.1 × 1.09 = $15,012,500
Q5: $12.5M × 1.1 × 0.92 = $12,650,000

Late Phase (Q6-7):
Q6: $12.5M × 0.8 × 1.06 = $10,600,000
Q7: $12.5M × 0.8 × 0.94 = $9,400,000

Total: $110,937,500
```

**Cumulative Deployment:**

| Phase End | Cumulative | % of Fund |
| --------- | ---------- | --------- |
| Q2        | ~$50M      | ~45%      |
| Q5        | ~$91M      | ~82%      |
| Q7        | ~$111M     | 100%      |

**Implementation:**
[PacingEngine.ts:56-62](client/src/core/pacing/PacingEngine.ts#L56)

```typescript
const marketAdjustments = {
  bull: { early: 1.3, mid: 1.1, late: 0.8 },
  // ...
};
```

**Test Coverage:**
[pacing-engine.test.ts:60-69](tests/unit/engines/pacing-engine.test.ts#L60)

```typescript
it('should front-load deployment in bull markets', () => {
  const input = createPacingInput({ marketCondition: 'bull' });
  const result = PacingEngine(input);

  const earlyTotal = result
    .slice(0, 3)
    .reduce((sum, q) => sum + q.deployment, 0);
  const lateTotal = result
    .slice(5, 8)
    .reduce((sum, q) => sum + q.deployment, 0);

  expect(earlyTotal).toBeGreaterThan(lateTotal);
});
```

**Validation Test Case:**
[pacing-validation.yaml:27-41](scripts/validation/pacing-validation.yaml#L27) -
"Frontloaded deployment pattern (60% in year 1)"

---

### Bear Market (Back-Loaded Deployment)

**Formula:**

```
Multiplier(q, 'bear') = {
  0.7  if Phase(q) = 'early'  (Q0-2)
  0.9  if Phase(q) = 'mid'    (Q3-5)
  1.2  if Phase(q) = 'late'   (Q6-7)
}

Deployment(q) = (F/8) × Multiplier(q, 'bear') × Variability(q)
```

**Expected Distribution:**

| Phase | Quarters | Multiplier | Share of Total | Deployment Range (per Q) |
| ----- | -------- | ---------- | -------------- | ------------------------ |
| Early | Q0-2     | 0.7        | ~24%           | [0.63F/8, 0.77F/8]       |
| Mid   | Q3-5     | 0.9        | ~30%           | [0.81F/8, 0.99F/8]       |
| Late  | Q6-7     | 1.2        | ~46%           | [1.08F/8, 1.32F/8]       |

**Example: $100M Fund**

```
BaseAmount = $100M / 8 = $12,500,000

Early Phase (Q0-2):
Q0: $12.5M × 0.7 × 1.02 = $8,925,000
Q1: $12.5M × 0.7 × 0.96 = $8,400,000
Q2: $12.5M × 0.7 × 1.08 = $9,450,000

Mid Phase (Q3-5):
Q3: $12.5M × 0.9 × 0.93 = $10,462,500
Q4: $12.5M × 0.9 × 1.07 = $12,037,500
Q5: $12.5M × 0.9 × 0.99 = $11,137,500

Late Phase (Q6-7):
Q6: $12.5M × 1.2 × 1.05 = $15,750,000
Q7: $12.5M × 1.2 × 0.91 = $13,650,000

Total: $89,812,500
```

**Cumulative Deployment:**

| Phase End | Cumulative | % of Fund |
| --------- | ---------- | --------- |
| Q2        | ~$27M      | ~30%      |
| Q5        | ~$60M      | ~67%      |
| Q7        | ~$90M      | 100%      |

**Rationale:** Conservative early deployment preserves capital for better
valuations later. The 1.2× multiplier in late phase enables aggressive
deployment when market has stabilized.

**Test Coverage:**
[pacing-engine.test.ts:70-80](tests/unit/engines/pacing-engine.test.ts#L70)

```typescript
it('should back-load deployment in bear markets', () => {
  const input = createPacingInput({ marketCondition: 'bear' });
  const result = PacingEngine(input);

  const earlyTotal = result
    .slice(0, 3)
    .reduce((sum, q) => sum + q.deployment, 0);
  const lateTotal = result
    .slice(5, 8)
    .reduce((sum, q) => sum + q.deployment, 0);

  expect(lateTotal).toBeGreaterThan(earlyTotal);
});
```

**Validation Test Case:**
[pacing-validation.yaml:43-57](scripts/validation/pacing-validation.yaml#L43) -
"Backend-loaded deployment pattern (delayed deployment)"

---

## ML-Enhanced Pacing Algorithm

### Algorithm Overview

The **ML-enhanced** mode applies rule-based calculation first, then adds a
simulated trend-based adjustment
([PacingEngine.ts:98-113](client/src/core/pacing/PacingEngine.ts#L98)):

```
FOR each quarter q:
  1. Calculate rule_based_deployment using standard algorithm
  2. Generate trend_adjustment = 0.85 + (PRNG.next() × 0.3)
  3. Calculate ml_deployment = rule_based_deployment × trend_adjustment
  4. Round to integer
  5. Update note to "ML-optimized pacing"
RETURN ml_deployments[]
```

### Formula

```
Deployment_ML(q) = Deployment_Rule(q) × TrendAdjustment(q)

Where:
  TrendAdjustment(q) ∈ [0.85, 1.15]
  TrendAdjustment(q) = 0.85 + (PRNG.next() × 0.3)
```

**Composite Variability:**

The ML mode combines two sources of variance:

1. **Base variability:** ±10% from rule-based calculation
2. **Trend adjustment:** -15% to +15% from ML simulation

**Total variance range:** Approximately -23% to +26.5%

**Example:**

```
Rule-Based: $10M × 1.0 × 1.05 = $10.5M
ML Trend:   $10.5M × 0.92 = $9.66M (net -3.4%)
```

### Implementation

```typescript
function calculateMLBasedPacing(input: PacingInput): PacingOutput[] {
  const ruleBased = calculateRuleBasedPacing(input);

  return map(ruleBased, (item, _index) => {
    // ML adjusts based on simulated market trends
    const trendAdjustment = 0.85 + prng.next() * 0.3; // 0.85 to 1.15
    const mlEnhancedDeployment = item.deployment * trendAdjustment;

    return {
      ...item,
      deployment: Math.round(mlEnhancedDeployment),
      note: `ML-optimized pacing (${input.marketCondition} trend analysis)`,
    };
  });
}
```

**Activation:**

```typescript
function isAlgorithmModeEnabled(): boolean {
  return (
    process.env['ALG_PACING']?.toLowerCase() === 'true' ||
    process.env['NODE_ENV'] === 'development'
  );
}
```

**Test Coverage:**
[pacing-engine.test.ts:193-205](tests/unit/engines/pacing-engine.test.ts#L193)

```typescript
it('should apply ML enhancements when ALG_PACING is true', () => {
  process.env['ALG_PACING'] = 'true';
  const result = PacingEngine(input);

  result.forEach((quarter) => {
    expect(quarter.note).toContain('ML-optimized');
  });
});
```

### Use Cases

1. **Scenario Analysis:** Test multiple trend assumptions by adjusting PRNG seed
2. **Stress Testing:** Model extreme market volatility with wider variance
3. **Backtesting:** Simulate historical deployment patterns with known outcomes
4. **Research:** Compare rule-based vs ML-enhanced strategies statistically

**Trade-off:** Increased complexity and reduced transparency vs. more realistic
modeling of market unpredictability.

---

## Deterministic Variability

### PRNG Implementation

The PacingEngine uses a **Pseudo-Random Number Generator (PRNG)** with fixed
seed for deterministic randomness
([PacingEngine.ts:22](client/src/core/pacing/PacingEngine.ts#L22)):

```typescript
import { PRNG } from '@shared/utils/prng';
const prng = new PRNG(123); // Fixed seed for determinism
```

**Key Property:** Same seed always produces the same sequence of "random"
numbers.

### Seed Reset Mechanism

Every invocation of `PacingEngine()` resets the PRNG seed
([PacingEngine.ts:126](client/src/core/pacing/PacingEngine.ts#L126)):

```typescript
export function PacingEngine(input: unknown): PacingOutput[] {
  prng.reset(123); // Ensures consistent results across calls
  // ...
}
```

**Why Reset?** Without reset, sequential calls would produce different results
due to PRNG state progression.

**Example:**

```typescript
// Without reset (WRONG):
const result1 = PacingEngine(input); // Uses seed 123
const result2 = PacingEngine(input); // Uses seed 124 (state advanced)
// result1 !== result2 (unpredictable)

// With reset (CORRECT):
const result1 = PacingEngine(input); // Uses seed 123
const result2 = PacingEngine(input); // Uses seed 123 (reset before calculation)
// result1 === result2 (deterministic)
```

### Variability Formula

**Rule-Based Variability:**

```
Variability(q) = 0.9 + (PRNG.next() × 0.2)
Range: [0.9, 1.1] (±10%)
```

**ML Trend Adjustment:**

```
TrendAdjustment(q) = 0.85 + (PRNG.next() × 0.3)
Range: [0.85, 1.15] (±15%)
```

### Test Evidence

**Consistency Test:**
[pacing-engine.test.ts:326-335](tests/unit/engines/pacing-engine.test.ts#L326)

```typescript
it('should maintain consistency across multiple runs', () => {
  const input = createPacingInput({
    fundSize: 50000000,
    marketCondition: 'neutral',
  });

  const result1 = PacingEngine(input);
  const result2 = PacingEngine(input);

  // Structure and quarters are consistent
  expect(result1).toHaveLength(result2.length);
  expect(result1[0].quarter).toBe(result2[0].quarter);

  // Note: actual deployment values are also consistent due to seed reset
});
```

**Why Not True Randomness?** Deterministic results are critical for:

- **Testing:** Reproducible test cases
- **Debugging:** Consistent behavior across runs
- **Scenario Comparison:** Apples-to-apples comparisons
- **Auditing:** Verifiable calculations

---

## Edge Cases and Boundary Conditions

### Edge Case 1: Very Small Fund Size

**Scenario:** Fund size < $1M

**Example:**

```typescript
const input = {
  fundSize: 100000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
};
const result = PacingEngine(input);

// BaseAmount = $100,000 / 8 = $12,500 per quarter
```

**Behavior:**

- Deployments remain non-negative
- Rounding may cause slight imbalances (e.g., total = $99,900 or $100,100)
- Variability has proportionally larger impact

**Test Coverage:**
[pacing-engine.test.ts:300-307](tests/unit/engines/pacing-engine.test.ts#L300)

```typescript
it('should handle very small fund size', () => {
  const input = createPacingInput({ fundSize: 1000000 });
  const result = PacingEngine(input);

  expect(result).toHaveLength(8);
  const total = result.reduce((sum, q) => sum + q.deployment, 0);
  expect(total).toBeGreaterThan(0);
});
```

---

### Edge Case 2: Very Large Fund Size

**Scenario:** Fund size > $1B

**Example:**

```typescript
const input = {
  fundSize: 5000000000,
  deploymentQuarter: 1,
  marketCondition: 'bull',
};
const result = PacingEngine(input);

// BaseAmount = $5B / 8 = $625M per quarter
```

**Behavior:**

- Linear scaling (no special handling)
- Total deployment may exceed fund size due to variability (up to 110%)
- Rounding errors are negligible relative to magnitude

**Test Coverage:**
[pacing-engine.test.ts:309-317](tests/unit/engines/pacing-engine.test.ts#L309)

```typescript
it('should handle very large fund size', () => {
  const input = createPacingInput({ fundSize: 1000000000 });
  const result = PacingEngine(input);

  expect(result).toHaveLength(8);
  const total = result.reduce((sum, q) => sum + q.deployment, 0);
  expect(total).toBeGreaterThan(900000000); // Within 10%
});
```

---

### Edge Case 3: Single-Year Full Deployment

**Scenario:** Rapid deployment for opportunistic funds (not supported in current
implementation)

**Current Limitation:** Hardcoded 8-quarter schedule

**Validation Test Case:**
[pacing-validation.yaml:76-90](scripts/validation/pacing-validation.yaml#L76) -
"Edge case: Single-year full deployment"

**Expected Behavior (if implemented):**

```typescript
const input = { fundSize: 50000000, deploymentQuarter: 1, investmentPeriod: 1 };
const result = PacingEngine(input);

// Should return:
[{ quarter: 1, deployment: 50000000, note: 'Single-year deployment' }];
```

**Workaround:** Use bull market strategy for aggressive front-loading (60-70% in
first 6 months).

---

### Edge Case 4: High Starting Quarter

**Scenario:** Deployment starts at Q100 or higher

**Example:**

```typescript
const input = {
  fundSize: 50000000,
  deploymentQuarter: 100,
  marketCondition: 'neutral',
};
const result = PacingEngine(input);

// Quarters: 100, 101, 102, ..., 107
```

**Behavior:**

- No special handling needed
- Quarters are simply sequential integers
- No calendar date awareness

**Test Coverage:**
[pacing-engine.test.ts:318-324](tests/unit/engines/pacing-engine.test.ts#L318)

```typescript
it('should handle high starting quarter', () => {
  const input = createPacingInput({ deploymentQuarter: 100 });
  const result = PacingEngine(input);

  expect(result[0].quarter).toBe(100);
  expect(result[7].quarter).toBe(107);
});
```

---

### Edge Case 5: Zero Fund Size

**Scenario:** Fund size = $0

**Example:**

```typescript
const input = { fundSize: 0, deploymentQuarter: 1, marketCondition: 'neutral' };
const result = PacingEngine(input);

// All deployments = $0
```

**Behavior:**

- Validation passes (fundSize ≥ 0)
- All quarters have deployment = $0
- No division-by-zero errors

**Implicit Test:** Covered by validation schema allowing `z.number().min(0)`.

---

## Mathematical Proofs and Invariants

### Invariant 1: Non-Negative Deployments

**Claim:** All deployments are non-negative.

**Proof:**

1. Fund size `F ≥ 0` (enforced by Zod schema)
2. Base amount `F/8 ≥ 0`
3. All multipliers are positive:
   - Bull: {1.3, 1.1, 0.8} > 0
   - Bear: {0.7, 0.9, 1.2} > 0
   - Neutral: {1.0, 1.0, 1.0} > 0
4. Variability ∈ [0.9, 1.1] > 0
5. Therefore: `Deployment(q) = (F/8) × Multiplier × Variability ≥ 0` ∎

**Test Evidence:**
[pacing-engine.test.ts:178-185](tests/unit/engines/pacing-engine.test.ts#L178)

---

### Invariant 2: Fixed Schedule Length

**Claim:** All pacing schedules have exactly 8 quarters.

**Proof:**

1. Hard-coded loop: `Array.from({ length: 8 }, ...)` (line 65)
2. No conditional breaks or early returns within loop
3. Therefore: `|deployments| = 8` ∎

**Test Evidence:** Multiple test cases, e.g.,
[pacing-engine.test.ts:151-156](tests/unit/engines/pacing-engine.test.ts#L151)

---

### Invariant 3: Sequential Quarter Assignment

**Claim:** Quarters are strictly sequential with no gaps.

**Proof:**

1. Quarter calculation: `quarter = deploymentQuarter + i` where
   `i ∈ {0,1,...,7}`
2. `i` increments by 1 each iteration
3. Therefore: `Quarter(q+1) = Quarter(q) + 1` ∎

**Test Evidence:**
[pacing-engine.test.ts:168-177](tests/unit/engines/pacing-engine.test.ts#L168)

---

### Theorem 1: Total Deployment Convergence

**Claim:** As fund size `F → ∞`, the ratio of total deployment to fund size
converges to 1.

**Proof Sketch:**

1. Expected total deployment:

   ```
   E[Total] = ∑(q=0 to 7) E[Deployment(q)]
            = ∑(q=0 to 7) (F/8) × Multiplier(q) × E[Variability]
   ```

2. For neutral market: `Multiplier(q) = 1.0` ∀q

3. Expected variability: `E[Variability] = (0.9 + 1.1) / 2 = 1.0`

4. Therefore:

   ```
   E[Total] = ∑(q=0 to 7) (F/8) × 1.0 × 1.0
            = 8 × (F/8)
            = F
   ```

5. Variance decreases as `1/√n` due to Central Limit Theorem

6. For large `F`, rounding errors become negligible: `lim(F→∞) Total/F = 1` ∎

**Test Evidence:**
[pacing-engine.test.ts:157-167](tests/unit/engines/pacing-engine.test.ts#L157)
shows total is within ±10% for $50M fund.

---

### Theorem 2: Market Condition Ordering

**Claim:** For identical variability, bull market front-loads, bear market
back-loads, neutral is balanced.

**Proof:**

1. Define cumulative deployment through phase `p`:

   ```
   Cumulative(p) = ∑(q in phases 0..p) Deployment(q)
   ```

2. Expected cumulative after early phase (Q0-2):

   ```
   Bull:    3 × (F/8) × 1.3 = 0.4875F (48.75%)
   Neutral: 3 × (F/8) × 1.0 = 0.375F  (37.5%)
   Bear:    3 × (F/8) × 0.7 = 0.2625F (26.25%)
   ```

3. Therefore:
   `Cumulative_Bull(early) > Cumulative_Neutral(early) > Cumulative_Bear(early)`
   ∎

**Test Evidence:**
[pacing-engine.test.ts:60-80](tests/unit/engines/pacing-engine.test.ts#L60)
validates early vs late totals for bull and bear.

---

## Summary Table: Strategy Comparison

| Strategy        | Early Phase (Q0-2) | Mid Phase (Q3-5)   | Late Phase (Q6-7)  | Best For                       |
| --------------- | ------------------ | ------------------ | ------------------ | ------------------------------ |
| **Neutral**     | 1.0× (~37.5%)      | 1.0× (~37.5%)      | 1.0× (~25%)        | Stable markets, balanced risk  |
| **Bull**        | 1.3× (~49%)        | 1.1× (~33%)        | 0.8× (~18%)        | High growth, competitive deals |
| **Bear**        | 0.7× (~26%)        | 0.9× (~30%)        | 1.2× (~44%)        | Downturns, value hunting       |
| **ML-Enhanced** | Base × [0.85,1.15] | Base × [0.85,1.15] | Base × [0.85,1.15] | Scenario modeling, research    |

---

## Next Steps

- **[01-overview.md](01-overview.md)** - Conceptual overview and use cases
- **[03-integration.md](03-integration.md)** - API usage, code examples, and
  real-world integration patterns

---

## Related Documentation

- **Implementation:**
  [PacingEngine.ts](client/src/core/pacing/PacingEngine.ts#L1)
- **Test Suite:**
  [pacing-engine.test.ts](tests/unit/engines/pacing-engine.test.ts#L1)
- **Type Definitions:** [shared/types.ts:113-132](shared/types.ts#L113)
- **PRNG Utility:** `@shared/utils/prng`
- **Validation Config:**
  [pacing-validation.yaml](scripts/validation/pacing-validation.yaml#L1)

---

**Document Version:** 1.0 **Last Updated:** 2025-11-06 **Validation Status:**
Pending Promptfoo evaluation
