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

**Approach: Single generic `economicsVariants()` function with a positive
allowlist.**

All four sync economics override types share identical comparison shape
(`metrics` + `metricDeltas`). No discriminated union is needed in the comparison
contract. The economics boundary is defined as an explicit allowlist —
comparable means explicitly economics-backed, not merely "not reserve." This
keeps the design fail-closed: a future non-economics override type fails to
`unsupported_override_type` automatically rather than accidentally passing
through.

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

**2a. Define an explicit economics allowlist** — positive membership, not
negated exclusion:

```ts
const ECONOMICS_COMPARISON_OVERRIDE_TYPES = [
  'fee_profile',
  'allocation',
  'sector_profile',
  'methodology',
] as const;

type EconomicsComparisonOverrideType =
  (typeof ECONOMICS_COMPARISON_OVERRIDE_TYPES)[number];

function isEconomicsComparisonOverrideType(
  overrideType: string
): overrideType is EconomicsComparisonOverrideType {
  return (ECONOMICS_COMPARISON_OVERRIDE_TYPES as readonly string[]).includes(
    overrideType
  );
}
```

**2b. Gate flip** (line ~312) — use the positive allowlist:

```ts
// Before
if (scenarioSet.variants.some((v) => v.override.overrideType !== 'fee_profile')) {

// After
if (
  scenarioSet.variants.some(
    (v) => !isEconomicsComparisonOverrideType(v.override.overrideType)
  )
) {
```

**2c. Replace `feeProfileVariants()` with `economicsVariants()`:**

```ts
type EconomicsCalculationVariant = Extract<
  FundScenarioCalculationVariantV1,
  { overrideType: EconomicsComparisonOverrideType }
>;

function isEconomicsVariant(
  variant: FundScenarioCalculationVariantV1
): variant is EconomicsCalculationVariant {
  return isEconomicsComparisonOverrideType(variant.overrideType);
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

**2d. Defensive snapshot check in `buildComparableComparison`** — the gate
checks `scenarioSet.variants` (DB rows), but `economicsVariants()` operates on
the latest `SCENARIOS` snapshot payload. A corrupt/stale snapshot could
mismatch. Add before building the comparable response:

```ts
const scenarioVariants = input.scenarioPayload.variants;

if (
  scenarioVariants.length === 0 ||
  scenarioVariants.some((variant) => !isEconomicsVariant(variant))
) {
  return comparisonWithStatus(
    comparisonBase,
    'unsupported_override_type',
    'UNSUPPORTED_OVERRIDE_TYPE'
  );
}
```

**2e. Callsite in `buildComparableComparison`:**

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
  Keep the same `comparable`/`baseline`/`variants` checks. Include the positive
  allowlist guard from Section 2 as a defensive check.
- Expand `VARIANT_OVERRIDE_TYPE_BADGE_LABELS` to match Section 3a.
- Update user-visible copy from "fee-profile variants" to "scenario variants" or
  "comparable variants" — avoid "economics-backed" as product copy
  (implementation jargon). Exact string:
  `Showing N comparable variants across M scenario sets.`
- Update the renamed predicate in all three consumer files:
  `CrossSetScenarioComparisonTable.tsx`, `fund-model-results.tsx`, and
  `client/src/components/fund-results/index.ts`.

Resulting behavior on the results page:

- 2+ comparable economics sets → cross-set table
- 1 comparable economics set → single-set table
- Non-comparable / reserve / unsupported → single-set fallback card

---

## Section 4: Tests

### 4a. `tests/unit/contract/fund-scenario-comparison.test.ts` (new file)

Pure contract boundary test, independent of React fixtures:

- `FundScenarioComparisonV1Schema` accepts variants with
  `overrideType: 'fee_profile'`
- `FundScenarioComparisonV1Schema` accepts variants with
  `overrideType: 'allocation'`
- `FundScenarioComparisonV1Schema` accepts variants with
  `overrideType: 'sector_profile'`
- `FundScenarioComparisonV1Schema` accepts variants with
  `overrideType: 'methodology'`
- `FundScenarioComparisonV1Schema` rejects variants with
  `overrideType: 'reserve_allocation'`

### 4b. `tests/unit/services/fund-scenario-comparison-service.test.ts`

The existing test file already has allocation/sector-profile cases asserting
`unsupported_override_type` — flip those to `comparable`. Add:

- Methodology set returns `comparable` with correct metric deltas
- Allocation set returns `comparable`
- Sector profile set returns `comparable`
- Reserve allocation still returns `unsupported_override_type`
- Mixed economics + reserve (defensive/corrupt-data guard) returns
  `unsupported_override_type`
  - The `CreateFundScenarioSetV1Schema` enforces homogeneous `overrideType` at
    the API layer; this test covers the DB/snapshot boundary directly.
- Corrupt snapshot (snapshot contains reserve variants despite set metadata
  claiming economics) returns `unsupported_override_type`

**Payload helper parameterization:** The existing `scenarioPayload()` helper
likely hard-codes `sync_fee_profile` / `overrideType: 'fee_profile'`. It must be
parameterized so `calculationMode` matches the variant's `overrideType` —
otherwise tests fail contract parsing even if the comparison logic is correct:

```ts
function calculationModeFor(
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology'
) {
  switch (overrideType) {
    case 'fee_profile':
      return 'sync_fee_profile';
    case 'allocation':
      return 'sync_allocation';
    case 'sector_profile':
      return 'sync_sector_profile';
    case 'methodology':
      return 'sync_methodology';
  }
}
```

### 4c. `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`

Add fixture variants with `overrideType: 'methodology'` / `'allocation'` /
`'sector_profile'`. Assert badge labels render as `METHODOLOGY`, `ALLOCATION`,
`SECTOR PROFILE`.

### 4d. `tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx`

Add a methodology set fixture with `economicsSummary` populated. Assert "Best
TVPI" renders. Mirrors existing fee_profile/allocation/sector_profile test
shape.

### 4e. `CrossSetScenarioComparisonTable` tests

Scope: this component only — do not assert parent-panel routing behavior here.

- Comparable methodology/allocation/sector_profile variants render with correct
  badge labels.
- The empty/no-comparable state still renders correctly when no comparable
  columns are passed.

### 4f. `fund-model-results.tsx` / `ScenarioComparisonPanel` tests

Scope: the parent panel that splits comparable vs non-comparable.

- `reserve_allocation` unsupported comparisons are excluded from cross-set
  grouping.
- `reserve_allocation` unsupported comparisons render as single-set fallback
  cards.

### 4g. `tests/unit/pages/fund-scenario-workspace.test.tsx`

- Extend `scenariosPayload()` to include a methodology calculated set.
- Assert the workspace renders "Best TVPI" / economics metrics for the
  methodology set.
- Add mock comparison handlers for **every calculated set in
  `scenariosPayload()`** — fee_profile, allocation, sector_profile, and
  methodology. The page queries comparisons for every calculated set; missing
  mocks cause silent React Query errors and noisy unexpected fetches.

---

## Gates

### Focused (run after each implementation task)

```powershell
# Server-side: contract + service
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native `
  tests/unit/contract/fund-scenario-comparison.test.ts `
  tests/unit/services/fund-scenario-comparison-service.test.ts `
  --project=server

# Client-side: components + workspace
& .\scripts\windows-node-env.ps1 npx.cmd vitest run --config vitest.config.mjs --configLoader native `
  tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx `
  tests/unit/components/fund-results/ScenarioSetsSummary.test.tsx `
  tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx `
  tests/unit/pages/fund-scenario-workspace.test.tsx `
  --project=client
```

### Required before PR

```
npm run test:scenario-release-gate
npm run check
npm run lint
```
