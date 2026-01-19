---
status: ACTIVE
last_updated: 2026-01-19
---

# Reserve Allocation Engine - Examples

**Module:** `client/src/core/reserves/ConstrainedReserveEngine.ts` **Purpose:**
Real-world scenarios, edge cases, and step-by-step walkthroughs **Last
Updated:** 2025-11-06

---

## Table of Contents

1. [Basic Scenarios](#basic-scenarios)
2. [Edge Cases](#edge-cases)
3. [Multi-Constraint Examples](#multi-constraint-examples)
4. [Multi-Vintage Portfolios](#multi-vintage-portfolios)
5. [Error Handling](#error-handling)

---

## Basic Scenarios

### Scenario 1: Standard Follow-On Reserve Calculation

**Context:** Single-stage fund with 3 Series A companies, calculating follow-on
reserves.

**Setup:**

```typescript
import { ConstrainedReserveEngine } from '@/core/reserves/ConstrainedReserveEngine';

const engine = new ConstrainedReserveEngine();

const input = {
  availableReserves: 15_000_000, // $15M available

  companies: [
    {
      id: 'acme-corp',
      name: 'Acme Corp',
      stage: 'series_a',
      invested: 5_000_000, // $5M initial
      ownership: 0.15,
    },
    {
      id: 'tech-startup',
      name: 'Tech Startup',
      stage: 'series_a',
      invested: 3_000_000, // $3M initial
      ownership: 0.2,
    },
    {
      id: 'innovate-co',
      name: 'Innovate Co',
      stage: 'series_a',
      invested: 4_000_000, // $4M initial
      ownership: 0.18,
    },
  ],

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 2.0, // Reserve 2x initial investment
      weight: 1.0, // Standard priority
    },
  ],

  constraints: {
    minCheck: 50_000, // $50K minimum per allocation
    maxPerCompany: 10_000_000, // $10M max per company
    discountRateAnnual: 0.12, // 12% discount rate
    graduationProb: {
      series_a: 0.35, // 35% Series A → Series B
    },
    graduationYears: {
      series_a: 6, // 6 years to exit
    },
  },
};

const result = engine.calculate(input);
```

**Step-by-Step Execution:**

#### Phase 1: Scoring

```typescript
// All companies have same stage, so use same parameters:
// RM = 2.0, GP = 0.35, W = 1.0, DR = 0.12, Y = 6

// Present value (all same):
pv = 2.0 × 0.35 / (1.12)^6 = 0.7 / 1.9738 = 0.3546

// Scores (all equal since same PV and weight):
acme-corp: 0.3546 × 1.0 = 0.3546
tech-startup: 0.3546 × 1.0 = 0.3546
innovate-co: 0.3546 × 1.0 = 0.3546

// Tie-breaking by name (alphabetical):
// 1. Acme Corp (A)
// 2. Innovate Co (I)
// 3. Tech Startup (T)
```

#### Phase 2: Allocation

```typescript
remainingC = $15M

// Company 1: Acme Corp
room = min($15M, infinity, $10M) = $10M
room ≥ $50K ✓
allocated = $10M
remainingC = $15M - $10M = $5M

// Company 2: Innovate Co
room = min($5M, infinity, $10M) = $5M
room ≥ $50K ✓
allocated = $5M
remainingC = $5M - $5M = $0

// Company 3: Tech Startup
remainingC = $0 → STOP (no capital left)
allocated = $0
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'acme-corp',
      name: 'Acme Corp',
      stage: 'series_a',
      allocated: 10_000_000  // $10M (hit company cap)
    },
    {
      id: 'innovate-co',
      name: 'Innovate Co',
      stage: 'series_a',
      allocated: 5_000_000   // $5M (exhausted remaining)
    }
    // Tech Startup: No allocation (capital exhausted)
  ],
  totalAllocated: 15_000_000,
  remaining: 0,
  conservationOk: true
}
```

**Key Observations:**

- Equal scores → alphabetical tie-breaking
- First company hits max-per-company cap ($10M)
- Second company gets remaining capital ($5M)
- Third company gets nothing (capital exhausted)
- Conservation check passes: $15M = $10M + $5M + $0

---

### Scenario 2: Multi-Stage Portfolio

**Context:** Fund with companies at different stages, each with different
reserve multiples.

**Setup:**

```typescript
const input = {
  availableReserves: 20_000_000, // $20M available

  companies: [
    {
      id: 'seed-co',
      name: 'Seed Co',
      stage: 'seed',
      invested: 2_000_000, // $2M initial
      ownership: 0.2,
    },
    {
      id: 'series-a-co',
      name: 'Series A Co',
      stage: 'series_a',
      invested: 5_000_000, // $5M initial
      ownership: 0.15,
    },
    {
      id: 'series-b-co',
      name: 'Series B Co',
      stage: 'series_b',
      invested: 8_000_000, // $8M initial
      ownership: 0.12,
    },
  ],

  stagePolicies: [
    {
      stage: 'seed',
      reserveMultiple: 3.0, // Higher risk, more reserves
      weight: 1.0,
    },
    {
      stage: 'series_a',
      reserveMultiple: 2.0,
      weight: 1.0,
    },
    {
      stage: 'series_b',
      reserveMultiple: 1.5, // Lower risk, fewer reserves
      weight: 1.0,
    },
  ],

  constraints: {
    discountRateAnnual: 0.12,
    graduationProb: {
      seed: 0.2, // 20% succeed
      series_a: 0.35, // 35% succeed
      series_b: 0.5, // 50% succeed
    },
    graduationYears: {
      seed: 7, // 7 years to exit
      series_a: 6, // 6 years to exit
      series_b: 5, // 5 years to exit
    },
  },
};

const result = engine.calculate(input);
```

**Scoring Calculations:**

```typescript
// Seed Co
pv_seed = 3.0 × 0.20 / (1.12)^7
        = 0.6 / 2.2107
        = 0.2714
score_seed = 0.2714 × 1.0 = 0.2714

// Series A Co
pv_a = 2.0 × 0.35 / (1.12)^6
     = 0.7 / 1.9738
     = 0.3546
score_a = 0.3546 × 1.0 = 0.3546

// Series B Co
pv_b = 1.5 × 0.50 / (1.12)^5
     = 0.75 / 1.7623
     = 0.4256
score_b = 0.4256 × 1.0 = 0.4256

// Priority ranking:
// 1. Series B Co (0.4256) - highest graduation prob, shortest time
// 2. Series A Co (0.3546)
// 3. Seed Co (0.2714) - lowest graduation prob, longest time
```

**Allocation:**

```typescript
remainingC = $20M

// 1. Series B Co
allocated = $12M (1.5 × $8M)
remainingC = $20M - $12M = $8M

// 2. Series A Co
allocated = $8M (would be 2.0 × $5M = $10M, but only $8M left)
remainingC = $8M - $8M = $0

// 3. Seed Co
allocated = $0 (no capital left)
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'series-b-co',
      name: 'Series B Co',
      stage: 'series_b',
      allocated: 12_000_000  // $12M
    },
    {
      id: 'series-a-co',
      name: 'Series A Co',
      stage: 'series_a',
      allocated: 8_000_000   // $8M (sub-optimal, constrained)
    }
  ],
  totalAllocated: 20_000_000,
  remaining: 0,
  conservationOk: true
}
```

**Key Insights:**

- Later-stage companies score higher (higher graduation probability, shorter
  time)
- Seed company doesn't receive allocation despite high reserve multiple
- Series A company receives less than optimal (capital exhausted)

---

## Edge Cases

### Edge Case 1: Zero Available Reserves

**From:**
[reserves-validation.yaml:32-49](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml#L32-L49)

**Scenario:** Fund is fully deployed, no capital available for reserves.

**Setup:**

```typescript
const input = {
  availableReserves: 0, // NO CAPITAL AVAILABLE

  companies: [
    {
      id: 'co-1',
      name: 'Company 1',
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
};

const result = engine.calculate(input);
```

**Expected Output:**

```typescript
{
  allocations: [],  // EMPTY - no allocations possible
  totalAllocated: 0,
  remaining: 0,
  conservationOk: true  // 0 = 0 + 0 ✓
}
```

**Why This Happens:**

```typescript
remainingC = $0;

// Allocation loop
for (const c of comps) {
  if (remainingC <= 0n) break; // ← EXITS IMMEDIATELY
  // ...
}

// Result: No iterations, no allocations
```

**Use Case:** Fund status reporting when fully deployed.

---

### Edge Case 2: 100% Reserve Utilization

**From:**
[reserves-validation.yaml:51-68](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml#L51-L68)

**Scenario:** Single high-reserve company can absorb all available capital.

**Setup:**

```typescript
const input = {
  availableReserves: 50_000_000, // $50M available

  companies: [
    {
      id: 'winner-co',
      name: 'Winner Co',
      stage: 'series_a',
      invested: 10_000_000, // $10M initial
      ownership: 0.2,
    },
  ],

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 5.0, // VERY HIGH reserve multiple
      weight: 1.0,
    },
  ],
};

const result = engine.calculate(input);
```

**Calculation:**

```typescript
// Desired reserve: 5.0 × $10M = $50M
// Available: $50M
// Allocated: min($50M available, $50M desired) = $50M

utilizationRate = $50M / $50M = 1.0 (100%)
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'winner-co',
      name: 'Winner Co',
      stage: 'series_a',
      allocated: 50_000_000  // Entire fund reserved for this one company
    }
  ],
  totalAllocated: 50_000_000,
  remaining: 0,
  conservationOk: true
}
```

**Risk Consideration:** 100% utilization = no flexibility for:

- New opportunities
- Additional follow-ons
- Operational reserves

**Best Practice:** Target 70-85% utilization, keep 15-30% as dry powder.

---

### Edge Case 3: Maximum Deployment (Fully Deployed Fund)

**From:**
[reserves-validation.yaml:70-84](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml#L70-L84)

**Scenario:** Fund has deployed all capital, including reserves.

**Setup:**

```typescript
const input = {
  availableReserves: 0, // Fully deployed

  companies: [], // No companies to reserve for

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 2.0,
      weight: 1.0,
    },
  ],
};

const result = engine.calculate(input);
```

**Output:**

```typescript
{
  allocations: [],  // Empty
  totalAllocated: 0,
  remaining: 0,
  conservationOk: true
}
```

**Use Case:**

- Fund lifecycle reporting (mature fund)
- Historical analysis (post-deployment)
- "What-if" comparison (actual vs. planned)

---

### Edge Case 4: Minimum Check Threshold Filtering

**Scenario:** Small remaining capital prevents allocation to lower-priority
companies.

**Setup:**

```typescript
const input = {
  availableReserves: 5_500_000, // $5.5M

  companies: [
    {
      id: 'co-1',
      name: 'High Priority Co',
      stage: 'series_a',
      invested: 5_000_000,
      ownership: 0.15,
    },
    {
      id: 'co-2',
      name: 'Low Priority Co',
      stage: 'series_a',
      invested: 1_000_000,
      ownership: 0.1,
    },
  ],

  stagePolicies: [
    {
      stage: 'series_a',
      reserveMultiple: 1.0, // 1x initial
      weight: 1.0,
    },
  ],

  constraints: {
    minCheck: 500_000, // $500K minimum
  },
};

const result = engine.calculate(input);
```

**Allocation Logic:**

```typescript
remainingC = $5.5M

// Company 1 (High Priority, alphabetically first)
room = min($5.5M, $5M cap) = $5M
$5M ≥ $500K ✓
allocated = $5M
remainingC = $5.5M - $5M = $500K

// Company 2 (Low Priority)
room = min($500K, $1M cap) = $500K
$500K ≥ $500K ✓ (EXACTLY at threshold)
allocated = $500K
remainingC = $500K - $500K = $0
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'co-1',
      name: 'High Priority Co',
      stage: 'series_a',
      allocated: 5_000_000
    },
    {
      id: 'co-2',
      name: 'Low Priority Co',
      stage: 'series_a',
      allocated: 500_000  // Exactly at minimum
    }
  ],
  totalAllocated: 5_500_000,
  remaining: 0,
  conservationOk: true
}
```

**Edge Condition:** If remaining was $499K instead of $500K:

```typescript
room = $499K
$499K < $500K ✗ (BELOW threshold)
→ Skip allocation, leave $499K unallocated
```

---

### Edge Case 5: Stage Cap Exhaustion

**Scenario:** Stage-level diversification cap prevents allocation to same-stage
companies.

**Setup:**

```typescript
const input = {
  availableReserves: 20_000_000, // $20M available

  companies: [
    {
      id: 'series-a-1',
      name: 'Series A Company 1',
      stage: 'series_a',
      invested: 5_000_000,
      ownership: 0.15,
    },
    {
      id: 'series-a-2',
      name: 'Series A Company 2',
      stage: 'series_a',
      invested: 4_000_000,
      ownership: 0.18,
    },
    {
      id: 'series-a-3',
      name: 'Series A Company 3',
      stage: 'series_a',
      invested: 3_000_000,
      ownership: 0.2,
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
    maxPerStage: {
      series_a: 15_000_000, // MAX $15M for Series A (across all companies)
    },
  },
};

const result = engine.calculate(input);
```

**Allocation with Stage Tracking:**

```typescript
remainingC = $20M
stageAllocated['series_a'] = $0

// Company 1
room = min($20M, $15M - $0, infinity) = $10M (wants 2×$5M)
allocated = $10M
remainingC = $20M - $10M = $10M
stageAllocated['series_a'] = $10M

// Company 2
room = min($10M, $15M - $10M, infinity) = $5M (stage cap limiting)
allocated = $5M (not full $8M desired)
remainingC = $10M - $5M = $5M
stageAllocated['series_a'] = $15M

// Company 3
room = min($5M, $15M - $15M, infinity) = $0 (STAGE CAP REACHED)
allocated = $0
remainingC = $5M (unallocated)
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'series-a-1',
      name: 'Series A Company 1',
      stage: 'series_a',
      allocated: 10_000_000
    },
    {
      id: 'series-a-2',
      name: 'Series A Company 2',
      stage: 'series_a',
      allocated: 5_000_000  // Constrained by stage cap
    }
    // series-a-3: No allocation (stage cap exhausted)
  ],
  totalAllocated: 15_000_000,
  remaining: 5_000_000,  // LEFT UNALLOCATED
  conservationOk: true
}
```

**Key Insight:** Stage cap causes capital to remain unallocated even though:

- $5M is still available
- Company 3 wants $6M
- No company-level constraints violated

**Workaround:** Increase `maxPerStage['series_a']` or add companies in other
stages.

---

## Multi-Constraint Examples

### Example 1: All Constraints Binding

**Scenario:** Every constraint limit is tested.

**Setup:**

```typescript
const input = {
  availableReserves: 10_000_000, // $10M

  companies: [
    {
      id: 'co-1',
      name: 'Big Co',
      stage: 'series_a',
      invested: 8_000_000, // Large initial
      ownership: 0.12,
    },
    {
      id: 'co-2',
      name: 'Small Co',
      stage: 'series_a',
      invested: 500_000, // Small initial
      ownership: 0.25,
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
    minCheck: 1_000_000, // $1M minimum
    maxPerCompany: 6_000_000, // $6M max per company
    maxPerStage: {
      series_a: 7_000_000, // $7M max for Series A
    },
  },
};

const result = engine.calculate(input);
```

**Detailed Allocation:**

```typescript
remainingC = $10M
stageAllocated['series_a'] = $0

// Company 1: Big Co
// Wants: 2.0 × $8M = $16M
room = min(
  $10M,         // Global: available
  $7M - $0,     // Stage: cap - allocated
  $6M           // Company: cap
) = $6M

$6M ≥ $1M ✓ (passes min check)
allocated = $6M
remainingC = $10M - $6M = $4M
stageAllocated['series_a'] = $6M

// Company 2: Small Co
// Wants: 2.0 × $500K = $1M
room = min(
  $4M,          // Global: remaining
  $7M - $6M,    // Stage: $1M left
  $6M           // Company: cap (not binding)
) = $1M

$1M ≥ $1M ✓ (exactly at min check)
allocated = $1M
remainingC = $4M - $1M = $3M
stageAllocated['series_a'] = $7M (STAGE CAP REACHED)
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'co-1',
      name: 'Big Co',
      stage: 'series_a',
      allocated: 6_000_000   // Limited by maxPerCompany
    },
    {
      id: 'co-2',
      name: 'Small Co',
      stage: 'series_a',
      allocated: 1_000_000   // Limited by stage cap remainder
    }
  ],
  totalAllocated: 7_000_000,
  remaining: 3_000_000,  // Can't allocate more (stage cap)
  conservationOk: true
}
```

**Constraints Applied:**

- ✓ Min check: Both allocations ≥ $1M
- ✓ Max per company: Big Co capped at $6M (not $16M)
- ✓ Max per stage: Total Series A = $7M (cap reached)
- ✓ Global limit: $7M ≤ $10M available

---

## Multi-Vintage Portfolios

### Example 1: Mixed Vintage, Different Stages

**From:**
[reserves-validation.yaml:86-113](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml#L86-L113)

**Setup:**

```typescript
const input = {
  availableReserves: 30_000_000, // $30M

  companies: [
    {
      id: 'vintage-2023-a',
      name: '2023 Series A Co',
      vintage: 2023,
      stage: 'series_a',
      invested: 5_000_000,
      ownership: 0.15,
    },
    {
      id: 'vintage-2024-seed',
      name: '2024 Seed Co',
      vintage: 2024,
      stage: 'seed',
      invested: 3_000_000,
      ownership: 0.2,
    },
    {
      id: 'vintage-2023-b',
      name: '2023 Series B Co',
      vintage: 2023,
      stage: 'series_b',
      invested: 8_000_000,
      ownership: 0.12,
    },
  ],

  stagePolicies: [
    { stage: 'seed', reserveMultiple: 3.0, weight: 1.0 },
    { stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 },
    { stage: 'series_b', reserveMultiple: 1.5, weight: 1.0 },
  ],

  constraints: {
    discountRateAnnual: 0.12,
    graduationProb: {
      seed: 0.2,
      series_a: 0.35,
      series_b: 0.5,
    },
    graduationYears: {
      seed: 7,
      series_a: 6,
      series_b: 5,
    },
  },
};

const result = engine.calculate(input);
```

**Scoring (Stage-Based, Vintage-Agnostic):**

```typescript
// 2023 Series A: 2.0 × 0.35 / (1.12)^6 = 0.3546
// 2024 Seed: 3.0 × 0.20 / (1.12)^7 = 0.2714
// 2023 Series B: 1.5 × 0.50 / (1.12)^5 = 0.4256

// Priority:
// 1. 2023 Series B (0.4256)
// 2. 2023 Series A (0.3546)
// 3. 2024 Seed (0.2714)
```

**Allocation:**

```typescript
// 1. 2023 Series B
allocated = 1.5 × $8M = $12M
remainingC = $30M - $12M = $18M

// 2. 2023 Series A
allocated = 2.0 × $5M = $10M
remainingC = $18M - $10M = $8M

// 3. 2024 Seed
allocated = min($8M, 3.0 × $3M) = $8M (limited by available)
remainingC = $8M - $8M = $0
```

**Output:**

```typescript
{
  allocations: [
    {
      id: 'vintage-2023-b',
      name: '2023 Series B Co',
      stage: 'series_b',
      allocated: 12_000_000
    },
    {
      id: 'vintage-2023-a',
      name: '2023 Series A Co',
      stage: 'series_a',
      allocated: 10_000_000
    },
    {
      id: 'vintage-2024-seed',
      name: '2024 Seed Co',
      stage: 'seed',
      allocated: 8_000_000  // Sub-optimal (wanted $9M)
    }
  ],
  totalAllocated: 30_000_000,
  remaining: 0,
  conservationOk: true
}
```

**Key Insight:** Vintage year doesn't affect scoring - **stage is primary
factor**.

---

## Error Handling

### Error 1: Missing Stage Policy

**Scenario:** Company has stage without corresponding policy.

**Setup:**

```typescript
const input = {
  availableReserves: 10_000_000,

  companies: [
    {
      id: 'co-1',
      name: 'Orphan Stage Co',
      stage: 'series_c', // ← No policy defined
      invested: 5_000_000,
      ownership: 0.15,
    },
  ],

  stagePolicies: [
    { stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 },
    // Missing: series_c policy
  ],
};

// This will throw:
try {
  const result = engine.calculate(input);
} catch (error) {
  console.error(error);
  // Error: No policy for series_c
  // status: 400
}
```

**Error Details:**

```typescript
// From ConstrainedReserveEngine.ts:23
if (!pol)
  throw Object.assign(new Error(`No policy for ${c.stage}`), { status: 400 });
```

**Resolution:** Add missing stage policy:

```typescript
stagePolicies: [
  { stage: 'series_a', reserveMultiple: 2.0, weight: 1.0 },
  { stage: 'series_c', reserveMultiple: 1.2, weight: 1.0 }, // ← Added
];
```

---

### Error 2: Negative Available Reserves

**Scenario:** Input validation should catch negative values.

**Setup:**

```typescript
const input = {
  availableReserves: -5_000_000,  // ← INVALID (negative)
  companies: [...],
  stagePolicies: [...]
};

// Validation (before engine.calculate):
import { validateReserveInput } from '@shared/schemas';

const validation = validateReserveInput(input);

if (!validation.ok) {
  console.error(validation.issues);
  // [{ code: 'schema', message: 'availableReserves must be non-negative' }]
}
```

**Resolution:** Ensure `availableReserves ≥ 0`.

---

### Error 3: Invalid Stage Name

**Scenario:** Stage string doesn't match enum.

**Setup:**

```typescript
const input = {
  availableReserves: 10_000_000,

  companies: [
    {
      id: 'co-1',
      name: 'Bad Stage Co',
      stage: 'series-d', // ← Invalid (should be 'series_dplus')
      invested: 5_000_000,
      ownership: 0.15,
    },
  ],

  stagePolicies: [{ stage: 'series-d', reserveMultiple: 1.0, weight: 1.0 }],
};

// Validation fails at schema level:
const validation = validateReserveInput(input);
// validation.ok === false
// validation.issues: [{ code: 'schema', message: 'Invalid stage enum value' }]
```

**Valid Stage Values:**

- `'preseed'`
- `'seed'`
- `'series_a'`
- `'series_b'`
- `'series_c'`
- `'series_dplus'`

**Resolution:** Use correct stage enum value.

---

## Summary

**Covered Scenarios:**

- ✓ Basic single-stage allocation
- ✓ Multi-stage portfolio prioritization
- ✓ Zero reserves edge case
- ✓ 100% utilization edge case
- ✓ Minimum check filtering
- ✓ Stage cap exhaustion
- ✓ Multi-constraint binding
- ✓ Multi-vintage portfolios
- ✓ Error handling patterns

**Next Steps:**

- [04-integration.md](./04-integration.md) - API usage and integration patterns
- [02-algorithms.md](./02-algorithms.md) - Back to algorithm details
- [01-overview.md](./01-overview.md) - Back to overview

**Test Coverage:**

- Unit tests:
  [reserves.spec.ts](c:/dev/Updog_restore/client/src/core/reserves/__tests__/reserves.spec.ts)
- Property tests:
  [reserves.property.test.ts](c:/dev/Updog_restore/client/src/core/reserves/__tests__/reserves.property.test.ts)
- Validation suite:
  [reserves-validation.yaml](c:/dev/Updog_restore/scripts/validation/reserves-validation.yaml)
