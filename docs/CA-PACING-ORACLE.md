# CA Pacing Oracle Packet

**Status**: ACTIVE **Date**: 2026-02-22 **Purpose**: Explicit gross-pacing
derivations for CA-009, CA-010, CA-012

## Decision Lock

Pacing semantics: **GROSS** (capacity-oriented). Formula:
`monthlyTarget = commitment / window_months` (no reserve deduction for
pacing_engine category).

Per `periodLoop.ts:396-404`:

- `reserve_engine` deducts effective buffer
- `pacing_engine` does NOT deduct reserve (reserveDeduction = 0)

Per `periodLoop.ts:500-503`:

```
allocable = min(periodPacingTarget, max(0, periodNetCash))
```

Reserve balance for pacing_engine uses capacity planning model
(`periodLoop.ts:585-588`):

```
reserveBalance = effectiveBuffer (= max(minCashBuffer, commitment * targetReservePct))
```

---

## CA-009: Quarterly Pacing with Carryover

**Inputs:**

- commitment = $36,000,000
- pacing_window = 18 months
- frequency = quarterly
- target_reserve_pct = 0.10
- min_cash_buffer = $500,000
- Contributions: $3,000,000 on 2025-02-10
- Cohorts: Core-25 (0.6), Growth-25 (0.4)

**Derivation:**

1. Unit scale: 36,000,000 >= 10,000 -> unitScale = 1 (raw dollars)
2. commitmentCents = 36,000,000 \* 100 = 3,600,000,000
3. effectiveBuffer = max(50,000,000, 360,000,000) = 360,000,000 cents
   ($3,600,000)
4. monthlyPacingTarget = 3,600,000,000 / 18 = 200,000,000 cents ($2,000,000/mo)
5. Quarterly target (Q1: Jan-Mar, 3 months): Math.round(200,000,000 \* 3) =
   600,000,000 cents ($6,000,000)

**Period-by-period:**

| Period | Cash In | Net Cash | Pacing Target | Allocable | Core-25 (60%) | Growth-25 (40%) |
| ------ | ------- | -------- | ------------- | --------- | ------------- | --------------- |
| Q1     | $3M     | $3M      | $6M           | $3M       | $1,800,000    | $1,200,000      |
| Q2-Q6  | $0      | $0       | $6M           | $0        | $0            | $0              |

**Totals:** Core-25 = $1,800,000, Growth-25 = $1,200,000 **Reserve balance:**
$3,600,000 (effectiveBuffer, capacity planning model)

**Note:** Engine does not implement carryover in periodLoop. Q1 shortfall ($3M
vs $6M target) does not carry to Q2 because Q2 has zero cash.

---

## CA-010: Front-Loaded Pipeline Constrained

**Inputs:**

- commitment = $30,000,000
- pacing_window = 24 months
- frequency = monthly
- target_reserve_pct = 0.20
- min_cash_buffer = $1,000,000
- Contributions: $5,000,000 on 2025-01-10, $5,000,000 on 2025-02-15
- Cohorts: Core (0.7), Growth (0.3)

**Derivation:**

1. commitmentCents = 3,000,000,000
2. effectiveBuffer = max(100,000,000, 600,000,000) = 600,000,000 cents
   ($6,000,000)
3. monthlyPacingTarget = 3,000,000,000 / 24 = 125,000,000 cents ($1,250,000/mo)

**Period-by-period:**

| Period   | Cash In | Net Cash | Pacing Target | Allocable | Core (70%) | Growth (30%) |
| -------- | ------- | -------- | ------------- | --------- | ---------- | ------------ |
| 2025-01  | $5M     | $5M      | $1.25M        | $1.25M    | $875,000   | $375,000     |
| 2025-02  | $5M     | $5M      | $1.25M        | $1.25M    | $875,000   | $375,000     |
| 2025-03+ | $0      | $0       | $1.25M        | $0        | $0         | $0           |

**Totals:** Core = $1,750,000, Growth = $750,000 **Reserve balance:** $6,000,000
(effectiveBuffer, capacity planning model)

**Note:** Pacing caps deployment to $1.25M/month despite $5M+ available cash.
This is the "front-loaded pipeline constrained" behavior: excess cash is
preserved, not deployed.

---

## CA-012: Window Comparison (18-Month Case)

**Inputs:**

- commitment = $24,000,000
- pacing_window = 18 months
- frequency = monthly
- target_reserve_pct = 0.10
- min_cash_buffer = $300,000
- Contributions: $2,000,000 on 2024-07-15, $2,000,000 on 2025-07-15
- Cohort: Main-24 (1.0)

**Derivation:**

1. commitmentCents = 2,400,000,000
2. effectiveBuffer = max(30,000,000, 240,000,000) = 240,000,000 cents
   ($2,400,000)
3. monthlyPacingTarget = bankersRound(2,400,000,000 / 18) =
   bankersRound(133,333,333.33) = 133,333,333 cents

**Period-by-period (only active months shown):**

| Period  | Cash In | Net Cash | Pacing Target | Allocable     | Main-24       |
| ------- | ------- | -------- | ------------- | ------------- | ------------- |
| 2024-07 | $2M     | $2M      | $1,333,333.33 | $1,333,333.33 | $1,333,333.33 |
| 2025-07 | $2M     | $2M      | $1,333,333.33 | $1,333,333.33 | $1,333,333.33 |

**Totals:** Main-24 = $2,666,666.66 (266,666,666 cents) **Reserve balance:**
$2,400,000 (effectiveBuffer, capacity planning model)

**Note:** Two contributions across 24-month timeline, each capped at monthly
pacing target. Total deployment = 2 \* $1,333,333.33 = $2,666,666.66.

---

## Verification Commands

```bash
# Run CA truth cases after applying corrections
npm run test:unit -- tests/unit/truth-cases/capital-allocation.test.ts --run
```
