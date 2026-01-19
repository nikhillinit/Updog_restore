---
status: ACTIVE
last_updated: 2026-01-19
---

# PR-B — Deterministic Fund Calc Engine (Status: Changes requested)

**Keep going—direction is good.** To align with the deterministic design and avoid accounting drift, please address the items below.

## Required changes

### 1) Inputs (remove hard-codes)
- Add `fundStartDateISO` (no `new Date()` in the engine).
- Add per-stage `stageOwnershipPct` (no fixed 0.15 except an explicit schema fallback).

```ts
// shared/schemas/fund-model.ts
stageOwnershipPct: z.record(
  z.enum(['preseed','seed','seriesA','seriesB','seriesC','growth']),
  z.number().min(0).max(1)
),
fundStartDateISO: z.string().datetime(),
```

### 2) Reserves (fund-level, not per-stage)

* Compute `reservePool = fundSize * reservePoolPct` **once**.
* Allocate stage deployable capital from **fundSize − reservePool** (avoid per-stage subtraction which over-reserves).

### 3) Follow-ons (scope clarity)

* Either **remove** follow-on from this PR **or** implement a minimal deterministic rule:

  * Trigger on stage graduation.
  * Draw a fixed fraction of initial check (e.g., 50%) **capped** by remaining reserve.
  * Emit a **structured warning** when capped (e.g., `logger.warn('follow_on_capped', { companyId, requested, granted, remainingReserve })`).
  * Never let reserve go negative.

### 4) Fees: verification, not re-implementation

* Fees appear to be **periodized** in the current code. Keep that logic.
* Add a **golden test** asserting fee accrual across the management-fee horizon.

## Tests to add

### Golden fixtures (deterministic)

* **Smoke:** no reserves, no exits.
* **Reserves + exits:** varying period lengths.
* **Ownership:** differing per-stage ownership inputs.

### CSV header stability

* Assert header **order** and field names remain stable (prevents BI/Excel breakage).

```ts
expect(csv.split('\n')[0]).toBe(
  'periodIndex,periodStart,periodEnd,contributions,investments,managementFees,exitProceeds,distributions,unrealizedPnl,nav,tvpi,dpi,irrAnnualized'
);
```

### Fee accrual test

* Assert the sum of periodic management fees equals `fundSize × annualRate × feeYears` (within rounding tolerance).

## DX / scope hygiene

* Keep this feature PR **separate from auth**.
* Use project path aliases for shared types to avoid brittle relative imports.

## Quick checklist

* [ ] `fundStartDateISO` and per-stage ownership wired
* [ ] Reserves computed at fund level
* [ ] Follow-on removed **or** minimal deterministic + cap + warning
* [ ] Golden + CSV header + fee accrual tests added and green
* [ ] No auth files touched in this PR

> Build status details are in the latest CI run linked on the PR.
