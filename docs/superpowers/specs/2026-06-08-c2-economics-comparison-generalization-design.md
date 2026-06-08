# C2: Economics Comparison Generalization — Design Spec

**Date:** 2026-06-08 **Branch:** main (off `d79ee5b2`) **Goal:** Extend scenario
comparison support from fee-profile-only to all economics-backed override types:
`fee_profile`, `allocation`, `sector_profile`, `methodology`.

---

## Problem

M7 shipped `methodology` as a full sync override type with economics results,
but the comparison surfaces still hard-code fee-profile exclusivity:

- `ScenarioComparisonVariantV1Schema.overrideType` is
  `z.literal('fee_profile')`.
- `fund-scenario-comparison-service.ts` blocks any set with a non-`fee_profile`
  variant.
- `ScenarioSetsSummary.hasEconomicsSummary()` excludes `methodology` from the
  TVPI display.
- `ScenarioComparisonTable` and `CrossSetScenarioComparisonTable` have
  fee-profile-only badge maps and copy.

The result: methodology (and allocation/sector_profile) scenario sets silently
fall into `unsupported_override_type` or render blank metrics even though they
produce full `EconomicsResultV1` payloads.

---

## Decision

**Approach: Single generic `economicsVariants()` function.**

All four sync economics override types share identical comparison shape
(`metrics` + `metricDeltas`). No discriminated union is needed in the comparison
contract. The reservation boundary is `reserve_allocation` only — it is the sole
type that does not produce economics and must continue returning
`unsupported_override_type`.

---

## Non-Goals

- No changes to `reserve_allocation` comparison behavior.
- No changes to the async worker or BullMQ paths.
- No new API routes or DB schema changes.
- No redesign of the comparison table layout or metrics set.
- Do not introduce a new override type in this lane.

---

## Section 1: Shared Contract

**File:** `shared/contracts/fund-scenario-comparison-v1.contract.ts`

Change `ScenarioComparisonVariantV1Schema.overrideType` from a literal to an
enum:

```ts
// Before
overrideType: z.literal('fee_profile'),

// After
overrideType: z.enum(['fee_profile', 'allocation', 'sector_profile', 'methodology']),
```

No other structural changes. All four comparison variant types share the same
shape. `reserve_allocation` is absent from this contract entirely.
`UNSUPPORTED_OVERRIDE_TYPE` reason code and `unsupported_override_type` status
remain for any future override type that does not produce economics.

---

## Section 2: Server Service

**File:** `server/services/fund-scenario-comparison-service.ts`

**2a. Gate flip** (line ~312) — from "reject non-fee_profile" to "reject
reserve_allocation only":

```ts
// Before
if (scenarioSet.variants.some((v) => v.override.overrideType !== 'fee_profile')) {

// After
if (scenarioSet.variants.some((v) => v.override.overrideType === 'reserve_allocation')) {
```

**2b. Replace `feeProfileVariants()` with `economicsVariants()`:**

```ts
type EconomicsCalculationVariant = Extract<
  FundScenarioCalculationVariantV1,
  {
    overrideType:
      | 'fee_profile'
      | 'allocation'
      | 'sector_profile'
      | 'methodology';
  }
>;

function isEconomicsVariant(
  v: FundScenarioCalculationVariantV1
): v is EconomicsCalculationVariant {
  return v.overrideType !== 'reserve_allocation';
}

function economicsVariants(
  scenarioPayload: FundScenarioCalculationPayloadV1,
  baselineMetrics: ScenarioComparisonMetricMap
): ScenarioComparisonVariantV1[] {
  return scenarioPayload.variants.filter(isEconomicsVariant).map((variant) => {
    const metrics = metricMapFromEconomics(variant.economics);
    return {
      variantId: variant.variantId,
      name: variant.name,
      overrideType: variant.overrideType,
      metrics,
      metricDeltas: metricDeltas(baselineMetrics, metrics),
    };
  });
}
```

**2c. Callsite in `buildComparableComparison`:**

```ts
// Before
variants: feeProfileVariants(input.scenarioPayload, baselineMetrics),

// After
variants: economicsVariants(input.scenarioPayload, baselineMetrics),
```

Add `FundScenarioCalculationVariantV1` to the import block from
`fund-scenario-sets-v1.contract`.

---

## Section 3: Frontend Components

### 3a. `ScenarioComparisonTable.tsx`

Expand `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` (currently fee-profile-only).
TypeScript will error on missing keys after the contract widens — this resolves
the compile error:

```ts
const VARIANT_OVERRIDE_TYPE_BADGE_LABELS: Record<
  ScenarioComparisonVariantV1['overrideType'],
  string
> = {
  fee_profile: 'FEE PROFILE',
  allocation: 'ALLOCATION',
  sector_profile: 'SECTOR PROFILE',
  methodology: 'METHODOLOGY',
};
```

No other structural changes — the table iterates `comparison.variants`
generically.

### 3b. `ScenarioSetsSummary.tsx`

Add `'methodology'` to `EconomicsScenarioVariant` type and
`hasEconomicsSummary()` guard:

```ts
type EconomicsScenarioVariant = Extract<
  ScenarioSetVariantResultSummaryV1,
  {
    overrideType:
      | 'fee_profile'
      | 'allocation'
      | 'sector_profile'
      | 'methodology';
  }
>;

function hasEconomicsSummary(
  variant: ScenarioSetVariantResultSummaryV1
): variant is EconomicsScenarioVariant {
  return (
    variant.overrideType === 'fee_profile' ||
    variant.overrideType === 'allocation' ||
    variant.overrideType === 'sector_profile' ||
    variant.overrideType === 'methodology'
  );
}
```

`ScenarioSetCard` already routes `reserve_allocation` to
`ReserveScenarioMetrics` and everything else to `EconomicsScenarioMetrics`.
After this change, methodology sets correctly surface "Best TVPI" + calculated
date via `topTvpiVariant()`.

### 3c. `CrossSetScenarioComparisonTable.tsx`

**Decision: Generalize from fee-profile-only to economics-backed comparable
types.**

Rationale: The backend comparison contract now treats `fee_profile`,
`allocation`, `sector_profile`, and `methodology` as comparable economics
scenarios. The cross-set table renders the shared metric contract and
backend-provided `metricDeltas`; it does not rely on fee-profile-specific
calculations. The current `isComparableFeeProfileComparison` predicate only
checks `comparisonStatus === 'comparable'`, `baseline != null`, and
`variants.length > 0` — it does not actually verify fee-profile variants. After
contract widening it would be accidentally generalized anyway, while the copy
and badge map would still claim fee-profile.

Reserve allocation remains excluded: it returns `unsupported_override_type` and
fails the `comparisonStatus === 'comparable'` check.

Changes:

- Rename `isComparableFeeProfileComparison` → `isComparableEconomicsComparison`.
  Keep the same `comparable`/`baseline`/`variants` checks. An explicit
  `overrideType` membership guard (checking for the four economics types) is
  defensive-only — omit it unless a failing test warrants it.
- Expand `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` to match Section 3a.
- Update copy from "fee-profile variants" to "economics-backed scenario
  variants" where it appears.
- Update the renamed predicate in all three consumer files:
  `CrossSetScenarioComparisonTable.tsx`, `fund-model-results.tsx`, and
  `client/src/components/fund-results/index.ts`.

Resulting behavior on the results page:

- 2+ comparable economics sets → cross-set table
- 1 comparable economics set → single-set table
- Non-comparable / reserve / unsupported → single-set fallback card

---

## Section 4: Tests

### 4a. `tests/unit/services/fund-scenario-comparison-service.test.ts`

The existing test file already has allocation/sector-profile cases — they
currently assert `unsupported_override_type`. Flip those to `comparable` and
add:

- Methodology set returns `comparable` with correct metric deltas
- Allocation set returns `comparable`
- Sector profile set returns `comparable`
- Reserve allocation still returns `unsupported_override_type`
- Mixed economics + reserve (defensive/corrupt-data guard) returns
  `unsupported_override_type`
  - Note: `CreateFundScenarioSetV1Schema` enforces homogeneous `overrideType`
    across variants, so this mix is invalid at the API layer; the service test
    covers the DB boundary directly.

### 4b. `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`

Add fixture variants with `overrideType: 'methodology'` / `'allocation'` /
`'sector_profile'`. Assert badge labels render as `METHODOLOGY`, `ALLOCATION`,
`SECTOR PROFILE`.

### 4c. `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

Add a methodology set fixture with `economicsSummary` populated. Assert "Best
TVPI" renders. Mirrors existing fee_profile/allocation/sector_profile test
shape.

### 4d. `tests/unit/pages/fund-scenario-workspace.test.tsx`

- Extend `scenariosPayload()` to include a methodology calculated set.
- Assert the workspace renders "Best TVPI" / economics metrics for the
  methodology set.
- Add a mock handler for `GET /scenario-sets/.../comparison` for the methodology
  set — the page queries comparisons for every calculated set; without this mock
  the test will fail on an unexpected fetch.

### 4e. `CrossSetScenarioComparisonTable` tests

- Add test: 2+ comparable economics sets (including
  methodology/allocation/sector_profile) appear in the cross-set table.
- Add/keep test: reserve_allocation comparison does not enter cross-set and
  renders as unsupported single-set fallback.

---

## Gates

```
npm run test:scenario-release-gate   # must pass before PR
npm run check                        # zero TypeScript errors
npm run lint                         # zero lint errors
```
