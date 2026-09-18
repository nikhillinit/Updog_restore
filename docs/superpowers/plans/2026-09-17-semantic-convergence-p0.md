# Semantic Convergence P0 Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 confirmed-live P0 defects where the codebase reports
inconsistent or fabricated financial data as valid.

**Architecture:** Each task is an independent branch from `origin/main`, not
stacked. Every fix is small, targeted, and TDD: failing test first, minimal
implementation, passing test, commit. Tasks 2 and 4 touch calculation paths, so
`npm run phoenix:truth` is required.

**Tech Stack:** TypeScript, Vitest, Decimal.js, Drizzle ORM, PostgreSQL, Zod

**Spec:** `docs/superpowers/specs/2026-09-17-semantic-convergence.md`

## Global Constraints

- `TZ=UTC` required for all test runs
- Conventional commits (`feat:`, `fix:`, `refactor:`)
- `npm run phoenix:truth` must pass before merging calculation changes
- No emoji in code, docs, or logs
- All mutations must have idempotency
- All updates must use optimistic locking
- Primary accent is charcoal `#292929`, never blue (DESIGN.md)
- `npm run docs:routing:generate` after adding any `docs/**/*.md` file
- Each task = own branch + own PR (never stacked; owner merges out of order)
- User merges PRs manually (squash) — never merge/push main yourself

---

### Task 1: Kill CohortEngine `Math.random()` Projections

**Files:**

- Modify: `shared/core/cohorts/CohortEngine.ts` (entire file — lines 26-94 use
  `Math.random()`)
- Modify: `shared/types.ts:157-218` (CohortOutputSchema, CohortSummarySchema —
  add unavailable variant)
- Modify: `server/routes/engine-summaries.ts:165-218` (consumer — returns JSON;
  must return 422 when unavailable)
- Modify:
  `server/services/projected-metrics-calculator.ts:105-119,257-294,350-380`
  (consumer — `calculateCohorts` returns `CohortResults | null`, BUT the `null`
  path currently fabricates: `:117-119` fall back to `config.targetTVPI ?? 2.5`
  / `?? 0.25` / `?? 1.0`, and `buildDistributionProjection`/`buildNAVProjection`
  at `:353-380` synthesize hardcoded J-curve and linear-NAV arrays. All of those
  must become explicit unavailability, not synthesized numbers)
- Modify: `shared/types/metrics.ts:129-156` (`ProjectedMetrics` — widen
  cohort-sourced fields to nullable; add unavailability marker)
- Modify: `server/services/variance-calculator.ts:124-143`
  (`calculateTVPIVariance` reads `projected.expectedTVPI` — must handle null)
- Modify: `server/services/metrics-aggregator.ts:327,352-383,410-419` (owns
  `ProjectedMetricsCalculator` at `:247`; set `projectedStatus = 'partial'` +
  warning when cohort projections unavailable; make `quality` treat `'partial'`
  as `'partial'` not `'fallback'`)
- Modify: `client/src/core/cohorts/CohortEngine.ts` (re-export — type change
  propagates)
- Modify: `client/src/core/cohorts/index.ts` (re-export — includes
  `compareCohorts` which has no callers beyond this re-export)
- Test: `tests/unit/engines/cohort-engine.test.ts` (migrate — line 38 asserts
  `result.cohortId` on the old shape)
- Test: `tests/api/cohort-engine.test.ts` (migrate — line 26 asserts
  `toHaveProperty('cohortId')` on the old shape)
- Test: `tests/unit/services/projected-metrics-calculator.test.ts` (add — PMC
  propagates unavailability instead of synthesizing)
- Test: `tests/unit/services/metrics-aggregator-projected-unavailable.test.ts`
  (create — `_status.engines.projected === 'partial'`, warning present, no
  fabricated `expectedTVPI`)
- Delete: `tests/unit/engines/cohort-engine.legacy-characterization.test.ts`
  (characterizes random behavior — no value once random is removed)

**Interfaces:**

- Consumes: `CohortInputSchema` (unchanged), `CohortOutputSchema` (modified),
  `CohortSummarySchema` (modified)
- Produces: On the **deletion path** (default), `CohortEngine` and all exports
  are removed; consumers that called it get a compile error pointing them to the
  cleanup. On the **stub path**, `CohortEngine(input)` returns `null` (not a
  discriminated union — YAGNI for a single reason code on a 5-user tool).
  `generateCohortSummary(input)` returns `null`. Consumers null-check.
- Produces: `ProjectedMetrics` (in `shared/types/metrics.ts`) cohort-sourced
  fields become nullable: `expectedTVPI: number | null`,
  `expectedIRR: number | null`, `expectedDPI: number | null`,
  `projectedDistributions: number[] | null`, `projectedNAV: number[] | null`. No
  new `cohortProjections` field — `_status.engines.projected === 'partial'`
  (already in the union at `shared/types/metrics.ts:351`) is the signal.
  `VarianceMetrics['tvpiVariance'].projected` and `.varianceVsProjected` become
  `number | null`.

**Why the aggregator must change too:** `calculateCohorts` returning `null` is
not enough. `ProjectedMetricsCalculator.calculate`
(`server/services/projected-metrics-calculator.ts:105-119`) reads
`cohortResults?.expectedTVPI ?? config.targetTVPI ?? 2.5` (and `?? 0.25`,
`?? 1.0`), and `buildDistributionProjection` / `buildNAVProjection` (`:353-380`)
return a hardcoded J-curve array `[0,0,0,0,0,0,0,0,1e6,2e6,5e6,1e7]` and a
linear 10M -> 50M NAV ramp when `cohortResults` is `null`. `MetricsAggregator`
(`server/services/metrics-aggregator.ts:247`) then returns those as `projected`
with `_status.engines.projected === 'success'`. That is exactly the "fabricated
data presented as valid" failure this task exists to remove. The engine stub
alone would move the fabrication one layer up, not eliminate it.

- [ ] **Step 0: Gate — delete (default) or stub? (ask owner before
      implementing)**

**Default: delete.** Remove `CohortEngine`, `generateCohortSummary`,
`compareCohorts`, the `/engine-summaries/cohorts/analysis` route, client
re-exports, and all test files that exercise them. This is the smaller diff (~80
lines deleted, 0 added). Cost of being wrong: ~30min to re-add the stub if item
8 (Construction Forecast) revives cohort projections. Cost of the stub:
indefinite maintenance of dead code returning a permanent 422.

**Fallback: stub.** Only if owner confirms item 8 has a committed timeline. In
that case, proceed with Steps 1-14 as written below. If no timeline or unknown,
delete.

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/p0a-kill-random-projections origin/main
```

- [ ] **Step 2: Write failing test — CohortEngine returns unavailable; migrate
      old-shape assertions**

Two existing suites assert the old `CohortOutput` shape and will break when the
engine returns a discriminated union. Migrate both in this step (do not leave
them red for a later step):

- `tests/unit/engines/cohort-engine.test.ts:38` — `expect(result.cohortId)...`
  on the direct engine result. Replace with `.available === false` + `reason`
  assertions (below).
- `tests/api/cohort-engine.test.ts:26` —
  `expect(...).toHaveProperty('cohortId')` on the route response. Replace with a
  422 assertion (see Step 11).

Add to `tests/unit/engines/cohort-engine.test.ts` (replacing the `cohortId`
assertions):

```typescript
import {
  CohortEngine,
  generateCohortSummary,
} from '@shared/core/cohorts/CohortEngine';

describe('CohortEngine unavailability', () => {
  it('returns unavailable with reason when projections are not backed by real data', () => {
    const input = { fundId: 1, vintageYear: 2023, cohortSize: 5 };
    const result = CohortEngine(input);
    expect(result).toEqual({
      available: false,
      reason: 'cohort-projections-not-implemented',
    });
  });

  it('generateCohortSummary returns unavailable with reason', () => {
    const input = { fundId: 1, vintageYear: 2023, cohortSize: 5 };
    const result = generateCohortSummary(input);
    expect(result).toEqual({
      available: false,
      reason: 'cohort-projections-not-implemented',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/engines/cohort-engine.test.ts
```

Expected: FAIL — current `CohortEngine` returns a `CohortOutput` object, not an
`{ available: false }` shape.

- [ ] **Step 4: (Stub path only) No new types needed**

On the **deletion path** (default), skip this step entirely — the types are
removed with the engine. On the **stub path**, `CohortEngine` and
`generateCohortSummary` return `CohortOutput | null` and `CohortSummary | null`
respectively. No new discriminated union types — `null` is sufficient for one
reason code on a 5-user internal tool. The existing `CohortOutput` /
`CohortSummary` types remain for the future item 8 revival; consumers
null-check.

- [ ] **Step 5: Rewrite CohortEngine to return unavailable**

Replace the body of `shared/core/cohorts/CohortEngine.ts`:

```typescript
import type {
  CohortInput,
  CohortResult,
  CohortSummaryResult,
} from '@shared/types';
import { CohortInputSchema } from '@shared/types';

export function CohortEngine(input: unknown): CohortResult {
  CohortInputSchema.parse(input);
  return {
    available: false,
    reason: 'cohort-projections-not-implemented',
  };
}

export function generateCohortSummary(input: CohortInput): CohortSummaryResult {
  return CohortEngine(input) as CohortSummaryResult;
}

export function compareCohorts(cohorts: CohortInput[]): CohortResult {
  if (cohorts.length === 0) {
    throw new Error('At least one cohort required for comparison');
  }
  return { available: false, reason: 'cohort-projections-not-implemented' };
}
```

Delete `generateMockCompanies`, `calculateRuleBasedCohortMetrics`,
`calculateMLBasedCohortMetrics`, `isAlgorithmModeEnabled`,
`validateCohortInput`, `validateCohortOutput`.

- [ ] **Step 6: Update engine-summaries route**

In `server/routes/engine-summaries.ts`, the route at line 165 calls
`generateCohortSummary(cohortInput)` at line 217 and returns
`res.json(summary)`. Replace:

```typescript
// Before (line 217-218):
const summary: CohortSummary = generateCohortSummary(cohortInput);
return res.json(summary);

// After:
const result = generateCohortSummary(cohortInput);
if (!result.available) {
  return res.status(422).json({
    error: 'Cohort projections unavailable',
    reason: result.reason,
  });
}
return res.json(result.data);
```

Update the import from `CohortSummary` to include `CohortSummaryResult`, and
change the type annotation accordingly.

- [ ] **Step 7: Update projected-metrics-calculator — propagate unavailability,
      delete synthesis**

In `server/services/projected-metrics-calculator.ts`, the `calculateCohorts`
method at line 259 calls `generateCohortSummary(cohortInput)` at line 277 and
maps the result. It already returns `CohortResults | null`. Change the
`CohortResults` type to carry the reason and stop the `null` path from
fabricating:

**7a. `calculateCohorts` (lines 259-294):**

```typescript
// Before (line 277):
const summary: CohortSummary = generateCohortSummary(cohortInput);

// After:
const result = generateCohortSummary(cohortInput);
if (!result.available) {
  return { available: false, reason: result.reason };
}
const summary = result.data;
```

Change the method's return type from `Promise<CohortResults | null>` to
`Promise<CohortResults | { available: false; reason: string }>`, and make the
existing `catch` at line 291-293 return
`{ available: false, reason: 'cohort-calculation-error' }` instead of `null` (so
an exception is also labeled, not silently defaulted).

**7b. `calculate` (lines 105-119):** replace the fabricating fallbacks:

```typescript
// Before (lines 113-119):
const projectedDistributions = this.buildDistributionProjection(cohortResults);
const projectedNAV = this.buildNAVProjection(cohortResults);
const expectedTVPI = cohortResults?.expectedTVPI ?? config.targetTVPI ?? 2.5;
const expectedIRR = cohortResults?.expectedIRR ?? config.targetIRR ?? 0.25;
const expectedDPI = cohortResults?.expectedDPI ?? config.targetDPI ?? 1.0;

// After:
const projectedDistributions =
  cohortResults != null ? cohortResults.distributionSchedule : null;
const projectedNAV =
  cohortResults != null ? cohortResults.navProgression : null;
const expectedTVPI = cohortResults != null ? cohortResults.expectedTVPI : null;
const expectedIRR = cohortResults != null ? cohortResults.expectedIRR : null;
const expectedDPI = cohortResults != null ? cohortResults.expectedDPI : null;
```

No new `cohortProjections` field — `_status.engines.projected === 'partial'`
(set in Step 7e) is the only signal consumers need.

**Construction path (`calculateConstructionForecast`, return at `:463-470`):**
No change needed — no `cohortProjections` field exists on `ProjectedMetrics`.
The J-curve path's `projectedDistributions` / `projectedNAV` / `expectedTVPI`
are real J-curve outputs and remain non-null.

(The `config.targetIRR ?? 0.25` default on this path is a separate pre-existing
fabrication — record it in the deferred table, do not fix it in this task.)
Delete the fallback branches inside `buildDistributionProjection` (hardcoded
`[0,0,0,0,0,0,0,0,1000000,2000000,5000000,10000000]`) and `buildNAVProjection`
(10M -> 50M linear ramp) at lines 353-380 — with the `null` path removed above
they are dead code, and they are the fabrication the spec calls out.

**7c. `shared/types/metrics.ts:129-156` — `ProjectedMetrics`:** widen
`projectedDistributions: number[] | null`, `projectedNAV: number[] | null`,
`expectedTVPI: number | null`, `expectedIRR: number | null`,
`expectedDPI: number | null`. No new fields —
`_status.engines.projected === 'partial'` is the unavailability signal. Update
the JSDoc on each widened field to say `null when projections are unavailable`.
`client/src/lib/demo-data.ts` constructs `ProjectedMetrics` literals (12 refs) —
the numeric fields remain valid under the widened type (no changes needed).

**7d. `server/services/variance-calculator.ts:124-143` —
`calculateTVPIVariance`:**

```typescript
const projectedTVPI = projected.expectedTVPI; // now number | null
const varianceVsProjected =
  projectedTVPI === null ? null : actualTVPI - projectedTVPI;
```

Widen `VarianceMetrics['tvpiVariance']` (`shared/types/metrics.ts:266-274`) so
`projected: number | null` and `varianceVsProjected: number | null`.
`calculateTVPIVariance` is the only variance method that reads a cohort-sourced
field (verified: `variance-calculator.ts` references `projected.expectedTVPI` at
`:130` and `projected.deploymentPace` at `:153` only). Do NOT substitute `0` or
the target value for a null projected figure.

**7e. `server/services/metrics-aggregator.ts`:** after `projected` is computed
(line 370-376), check whether the cohort-sourced fields are all null (meaning
the engine returned nothing):

```typescript
if (
  projected.expectedTVPI == null &&
  projected.projectedDistributions == null
) {
  projectedStatus = 'partial';
  warnings.push('Cohort projections unavailable');
}
```

And fix the `quality` derivation at lines 411-419 so `'partial'` maps to
`'partial'` (today the expression falls through to `'fallback'` for any
non-success status other than failed/skipped):

```typescript
: projectedStatus === 'failed' || projectedStatus === 'skipped' || projectedStatus === 'partial'
  ? 'partial'
  : 'fallback';
```

`getDefaultProjectedMetrics` (line 1461-1473, used only on the `skipProjections`
and `failed` paths) still returns `config.targetTVPI ?? 2.5` — those paths are
already labeled `'skipped'`/`'failed'` in `_status.engines.projected`. Set its
cohort-sourced fields to `null` so the widened type is honored end to end; this
is a one-object change, not a redesign.

Callers of `UnifiedFundMetrics.projected` in `client/src` do not read
`expectedTVPI`/`projectedNAV`/`projectedDistributions` directly (verified by
grep — only `demo-data.ts` references them, as a literal producer).
`projected?: Partial<ProjectedMetrics>` at `shared/types/performance-api.ts:33`
is already optional. So the client change is limited to `demo-data.ts` literals
plus any `tsc` fallout in `npm run check:client`.

- [ ] **Step 8: Update client re-exports**

In `client/src/core/cohorts/CohortEngine.ts`, update re-exports:

```typescript
export {
  CohortEngine,
  generateCohortSummary,
  compareCohorts,
} from '@shared/core/cohorts/CohortEngine';
export type { CohortResult, CohortSummaryResult } from '@shared/types';
```

In `client/src/core/cohorts/index.ts`, update re-exports similarly.

- [ ] **Step 9: Run test to verify it passes**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/engines/cohort-engine.test.ts
```

Expected: PASS

- [ ] **Step 10: Delete legacy characterization test**

```bash
rm tests/unit/engines/cohort-engine.legacy-characterization.test.ts
```

- [ ] **Step 11: Write consumer tests — route, PMC, aggregator all surface
      unavailability**

**11a. Route:** `tests/api/cohort-engine.test.ts` has NO HTTP scaffolding — it
imports `CohortEngine` / `generateCohortSummary` / `compareCohorts` directly
from `client/src/core/cohorts/CohortEngine` and calls them as functions
(`:1-26`). It is also outside the unit config's `include`
(`vitest.config.mjs:101-108` — `tests/api` runs only under
`vitest.config.int.ts`). So:

- **Direct-engine migration stays in that file:** replace
  `expect(result).toHaveProperty('cohortId')` and any other success-shape
  assertions with
  `expect(result).toEqual({ available: false, reason: 'cohort-projections-not-implemented' })`
  (same shape as Step 4). Run it with `--config vitest.config.int.ts` in
  Step 12.
- **HTTP 422 assertion goes in the existing
  `tests/unit/routes/engine-summaries.test.ts`** (or
  `tests/api/cohort-engine.test.ts` if no route test exists). No separate file —
  consolidate into the nearest existing test. Use `express` + `supertest`
  pattern from `tests/unit/routes/allocation-scenarios-api.test.ts:1-3`. Assert:

```typescript
expect(response.status).toBe(422);
expect(response.body).toMatchObject({
  error: 'Cohort projections unavailable',
});
```

**11b. PMC (add to
`tests/unit/services/projected-metrics-calculator.test.ts`):** that file already
constructs a `ProjectedMetricsCalculator` with mocked engines (see its existing
`vi.mock` of `construction-forecast-calculator` and the fund/company fixtures).
Add a describe block that calls `calculate(fund, companies, config)` on the
non-construction path and asserts:

```typescript
expect(result.expectedTVPI).toBeNull();
expect(result.expectedIRR).toBeNull();
expect(result.expectedDPI).toBeNull();
expect(result.projectedDistributions).toBeNull();
expect(result.projectedNAV).toBeNull();
```

Also add a construction-path case
(`calculate(fund, companies, config, { useConstructionForecast: true })` with
the existing `construction-forecast-calculator` mock) asserting:

```typescript
expect(result.projectedDistributions).not.toBeNull();
expect(result.projectedNAV).not.toBeNull(); // J-curve path returns a real NAV array (:468)
// Regression guard: the old J-curve fallback must not come back.
expect(result.projectedDistributions).not.toEqual([
  0, 0, 0, 0, 0, 0, 0, 0, 1000000, 2000000, 5000000, 10000000,
]);
```

Pass a `config` with `targetTVPI: 2.5` set so the test proves the target value
is NOT leaking into `expectedTVPI`.

**11c. Aggregator (create
`tests/unit/services/metrics-aggregator-projected-unavailable.test.ts`):** copy
the `vi.mock` scaffolding from
`tests/unit/services/metrics-aggregator-dual-forecast.test.ts` (it already mocks
`server/storage`, `actual-metrics-calculator`, `projected-metrics-calculator`,
`variance-calculator`). Have the `projected-metrics-calculator` mock return a
`ProjectedMetrics` with null cohort-sourced fields (`expectedTVPI: null`,
`projectedDistributions: null`, etc.), then assert on
`getUnifiedMetrics(fundId, { skipCache: true })`:

```typescript
expect(metrics._status.engines.projected).toBe('partial');
expect(metrics._status.quality).toBe('partial');
expect(metrics._status.warnings).toEqual(
  expect.arrayContaining([
    expect.stringContaining('Cohort projections unavailable'),
  ])
);
expect(metrics.projected.expectedTVPI).toBeNull();
expect(metrics.variance.tvpiVariance.projected).toBeNull();
expect(metrics.variance.tvpiVariance.varianceVsProjected).toBeNull();
```

(If the `variance-calculator` mock in the copied scaffolding returns a fixed
object, either un-mock it for this file or make the mock forward
`projected.expectedTVPI` — the point is that a null projection reaches the API
payload unaltered.)

- [ ] **Step 12: Run full affected test suite**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/engines/ tests/unit/services/projected-metrics-calculator.test.ts tests/unit/services/metrics-aggregator-projected-unavailable.test.ts tests/unit/services/metrics-aggregator-dual-forecast.test.ts tests/unit/services/metrics-aggregator-config.test.ts
# tests/api is excluded from the unit config; run the migrated direct-engine test under the integration config:
TZ=UTC npx vitest run --config vitest.config.int.ts --configLoader native tests/api/cohort-engine.test.ts
npm run check
```

Expected: all pass. No `Math.random()` calls remain in `CohortEngine.ts`. Then
`npm run check` (client/server/shared compile separately) — the
`ProjectedMetrics` widening will surface every consumer that assumed non-null;
fix each by handling null, never by `?? <number>`.

- [ ] **Step 13: Verify no remaining Math.random in CohortEngine**

```bash
grep -n "Math.random" shared/core/cohorts/CohortEngine.ts
```

Expected: no output.

- [ ] **Step 14: Commit**

```bash
git add shared/core/cohorts/CohortEngine.ts shared/types.ts shared/types/metrics.ts server/routes/engine-summaries.ts server/services/projected-metrics-calculator.ts server/services/metrics-aggregator.ts server/services/variance-calculator.ts client/src/core/cohorts/ client/src/lib/demo-data.ts tests/unit/engines/ tests/api/cohort-engine.test.ts tests/unit/services/projected-metrics-calculator.test.ts tests/unit/services/metrics-aggregator-projected-unavailable.test.ts
git commit -m "$(cat <<'EOF'
fix(cohort): replace Math.random() projections with explicit unavailable

CohortEngine reported fabricated financial data (random valuations,
random IRR/multiple/DPI) as valid projections. Replace with typed
unavailable result carrying a reason code. ProjectedMetricsCalculator
no longer substitutes target/2.5x defaults or synthetic J-curve and
NAV arrays when cohorts are unavailable; MetricsAggregator marks the
projected engine 'partial' and carries the reason in warnings.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

> **Owner decision: stub or delete?** Step 0 defaults to **deletion** (ponytail
> rung 1). Steps 1-14 above are the stub path, used only if owner confirms item
> 8 (Construction Forecast) has a committed timeline. On the deletion path, skip
> Steps 1-14 entirely: `rm` the engine, route, re-exports, and test files; null
> out the cohort-sourced fields in `ProjectedMetrics`; set
> `_status.engines.projected = 'partial'`. ~80 lines deleted, ~30min to re-add
> if item 8 revives. net: -125 lines vs stub path.

---

### Task 2: Fix MOIC Coercion + Stage Default Bypass

**Files:**

- Modify: `shared/core/reserves/DeterministicReserveEngine.ts:526,785`
- Modify: `server/services/reserve-input-builder.ts:82-120`
  (investmentRowToPortfolioWithProvenance) AND `:122-164`
  (companyRowToPortfolioWithProvenance) — BOTH have identical `'seed'` default
  bug; plus `:166-175` (`toLegacyReservePortfolio`) to exclude stage-unavailable
  rows from the legacy engine input
- Modify: `shared/contracts/reserve-input-provenance.contract.ts:29-31`
  (`ReserveCompanyInputWithProvenanceSchema` — allow empty `stage` only on the
  provenance-carrying record)
- Test: `tests/unit/engines/deterministic-reserve-engine.test.ts` (exists —
  extend)
- Test: `tests/unit/services/reserve-input-builder.provenance.test.ts` (exists —
  extend, and migrate the `REGRESSION` case at `:103-129` that currently pins
  the `'seed'` default)
- Test: `tests/unit/services/reserves/facts-reserve-input-adapter.test.ts`
  (exists — verify the `missing_stage` exclusion still fires; likely no edit)

**Interfaces:**

- Consumes: `PortfolioCompany` from `@shared/schemas/reserves-schemas` (field
  `currentMOIC: z.number().min(0).optional()`); `ReserveCompanyInput` from
  `@shared/types` (`stage: z.string().min(1)`, consumed by
  `generateReserveSummary`); `ReserveCompanyInputWithProvenance` from
  `@shared/contracts/reserve-input-provenance.contract`.
- Produces: `calculateProjectedMOIC` returns
  `this.calculateCurrentMOIC(company)` when `currentMOIC` is null/undefined and
  trusts 0 as a legitimate write-off. `reserve-input-builder` marks companies
  with **missing** stage as `'unavailable'` in provenance, emits `stage: ''` on
  the provenance record, and **omits them from `portfolio`** (the array
  `generateReserveSummary` consumes) so they receive no reserve allocation.
  `buildReserveInputTrustSummary` already counts `'unavailable'` and fails
  `trustedForActivation`; `facts-reserve-input-adapter.ts:107` already excludes
  them with `missing_stage`.

**Key discovery (corrected in review round 1):** the builder's `portfolio`
output does NOT feed the DRE. `reserve-calculation-service.ts:261,266` passes
`legacy.portfolio` to `ReserveEngine.generateReserveSummary`, whose rule-based
path (`ReserveEngine.ts:36-53`) keys `stageMultipliers` by **display names**
(`'Seed'`, `'Series A'`, `'Series B'`, `'Series C'`, `'Growth'`) with
`stageMultipliers[stage] || 2.0`. The same table is mirrored as
`RESERVE_ASSUMPTIONS` in
`shared/core/reserves/reserve-substrate-adapter.ts:112-120` and is hashed into
the reserve receipt (`admitForHashing(RESERVE_ASSUMPTIONS)`, `:184`), with a
parity suite at
`tests/unit/engines/deterministic-reserve-engine.parity.test.tsx`. Consequences:

1. The fabricated 2.0x for a missing round is the `|| 2.0` fallback, hit because
   `'seed'` (lowercase) is not a key in the display-name table — not
   `DEFAULT_STAGE_STRATEGIES[0].reserveMultiple`.
2. **Do NOT canonicalize** observed rounds to snake_case (`'Series A'` ->
   `'series_a'`). That would move every real company onto the `|| 2.0` fallback
   and silently change production reserve amounts. Observed rounds pass through
   verbatim, exactly as today.
3. `matchStageCompatibilityAlias` (`shared/schemas/stage.ts:177`) is therefore
   **not needed** and `stage.ts` is not touched by this task.
4. Rounds that are present but not in the display-name table (e.g. `'Bridge'`)
   still receive `stageMultiplierDefault: 2.0`. That is ReserveEngine's own
   hashed assumption; changing it would alter the assumptions hash and the
   parity suite and is **out of scope** here. **Owner decision (round 2):** the
   round-1 exclusion decision applies to _missing_ stage only.
   Unrecognized-but-present rounds keep today's behavior in this task and are
   tracked as deferred item 10 below. Do not extend the exclusion here.

> **Owner decision (round 1):** a company with no stage is _excluded_ from
> reserve allocation and its provenance is `'unavailable'`. No placeholder
> stage, no fabricated multiplier.

**Critical: two code paths, not one.**
`buildReservePortfolioInputWithProvenanceFromRows` at line 48-50 routes: if
`investments.length > 0`, uses `investmentRowToPortfolioWithProvenance`; else
`companyRowToPortfolioWithProvenance`. Prod fund has 14 investment rows, so the
**investment path is live**. Both functions have the same `'seed'` default bug.
Fix both.

**The spec references `adapter.ts:377`** — this file does not exist. The 2.0x
multiplier is the `ReserveEngine.ts:53` fallback described above.

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/p0b-moic-coercion-stage-default origin/main
```

- [ ] **Step 2: Write failing test — 0x MOIC must not become 1x**

`tests/unit/engines/deterministic-reserve-engine.test.ts` already exists with
`createCompany`, `createGraduationMatrix`, `createStageStrategies`, and
`createAllocationInput` factories (lines ~29-120). Reuse them — do not invent a
parallel fixture shape. Facts that constrain the fixtures:

- `PortfolioCompany` (`shared/schemas/reserves-schemas.ts:28`) fields are `id`
  (uuid string), `name`, `sector`, `currentStage`, `totalInvested`,
  `currentValuation`, `ownershipPercentage`, `investmentDate`, `isActive`,
  optional `currentMOIC`. The public method is
  `calculateOptimalReserveAllocation(input: ReserveAllocationInput): Promise<ReserveCalculationResult>`
  (DRE:92) and each `result.allocations[i]` carries `companyId` and
  `expectedMOIC` (= `projectedMOIC.toNumber()`, DRE:709).
- The `|| 1` at DRE:526 is only reached when `findStageStrategy` (DRE:645-653)
  finds nothing in **both** `input.stageStrategies` and
  `DEFAULT_STAGE_STRATEGIES` (`reserves-schemas.ts:393`, stages `seed`,
  `series_a`, ...). A fixture with `currentStage: 'seed'` finds a default
  strategy and never exercises the bug. Use a stage with no strategy anywhere,
  e.g. `'pre_seed_bridge'`, and pass `stageStrategies: []`.
- The DRE **throws** `ReserveCalculationError('INVALID_COMPANY_DATA')` for
  `totalInvested <= 0` (DRE:588-594) and for `currentValuation <= 0`
  (DRE:626-638). A write-off fixture with `currentValuation: 0` therefore never
  reaches the MOIC branch. Model the write-off as `currentMOIC: 0` with a tiny
  positive `currentValuation` (the explicit MOIC is what the engine must
  honour), and turn the zero-investment case into a rejection test.
- `it()` callbacks that `await` must be `async`.

```typescript
import { describe, it, expect } from 'vitest';
import { DeterministicReserveEngine } from '@shared/core/reserves/DeterministicReserveEngine';
import { ReserveCalculationError } from '@shared/schemas/reserves-schemas';
// createCompany / createAllocationInput are the factories already in this file.

// `currentStage` is `StageSchema = CanonicalStageSchema` (shared/schemas/reserves-schemas.ts:16,33),
// so the value MUST be a canonical stage — a made-up string fails Zod validation before
// the engine runs. Use a canonical stage and pass `stageStrategies: []` so no strategy
// matches and the engine's MOIC-from-fundamentals path is exercised.
const NO_STRATEGY_STAGE = 'series_b';
// `createAllocationInput` defaults `minAllocationThreshold: 100000` (test file :110-113).
// A single small company can fall under that and be filtered out before `toBeDefined()`,
// so pass an explicit low threshold on the positive-path case.
const LOW_THRESHOLD = 1_000;

describe('MOIC handling in DeterministicReserveEngine', () => {
  it('preserves an explicit 0x MOIC as a write-off instead of coercing to 1x', async () => {
    const engine = new DeterministicReserveEngine();
    const writeOff = createCompany({
      id: '11111111-1111-4111-8111-111111111111',
      currentStage: NO_STRATEGY_STAGE,
      totalInvested: 1_000_000,
      currentValuation: 1, // positive to pass DRE:626 validation; MOIC is explicit below
      currentMOIC: 0,
    });
    const result = await engine.calculateOptimalReserveAllocation(
      createAllocationInput({ portfolio: [writeOff], stageStrategies: [] })
    );

    const alloc = result.allocations.find((a) => a.companyId === writeOff.id);
    // With projectedMOIC = 0 the allocation score is 0, so either no allocation
    // is produced or it carries expectedMOIC 0. Either way, never 1.
    expect(alloc?.expectedMOIC ?? 0).toBe(0);
  });

  it('derives MOIC from fundamentals when currentMOIC is undefined', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      id: '22222222-2222-4222-8222-222222222222',
      currentStage: NO_STRATEGY_STAGE,
      totalInvested: 2_500_000,
      currentValuation: 5_000_000,
      currentMOIC: undefined,
    });
    const result = await engine.calculateOptimalReserveAllocation(
      createAllocationInput({
        portfolio: [company],
        stageStrategies: [],
        minAllocationThreshold: LOW_THRESHOLD,
      })
    );

    const alloc = result.allocations.find((a) => a.companyId === company.id);
    expect(alloc).toBeDefined();
    expect(alloc!.expectedMOIC).toBeCloseTo(2.0, 6); // 5M / 2.5M, not the || 1 fallback
  });

  it('rejects zero totalInvested instead of producing Infinity or a 1x placeholder', async () => {
    const engine = new DeterministicReserveEngine();
    const company = createCompany({
      id: '33333333-3333-4333-8333-333333333333',
      currentStage: NO_STRATEGY_STAGE,
      totalInvested: 0,
      currentValuation: 1_000_000,
      currentMOIC: undefined,
    });

    await expect(
      engine.calculateOptimalReserveAllocation(
        createAllocationInput({ portfolio: [company], stageStrategies: [] })
      )
    ).rejects.toBeInstanceOf(ReserveCalculationError);
  });
});
```

> **Why the third test is a rejection, not a `Decimal(0)` check:**
> `calculateCurrentMOIC` (DRE:515) runs unguarded for every active company at
> DRE:195 _before_ `calculateProjectedMOIC`, and `calculateExpectedValue` throws
> for `totalInvested <= 0`. The engine's contract for zero-investment rows is
> "reject", and the Step 4 guard exists to keep the private helper safe, not to
> change that contract.

- [ ] **Step 3: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/engines/deterministic-reserve-engine.test.ts
```

Expected: FAIL — `|| 1` coerces 0 to 1.

- [ ] **Step 4: Fix the MOIC coercion at line 526**

In `shared/core/reserves/DeterministicReserveEngine.ts`, change line 526:

```typescript
// Before:
return new Decimal(company.currentMOIC || 1);

// After:
if (company.currentMOIC != null) {
  return new Decimal(company.currentMOIC);
}
if (company.totalInvested <= 0) {
  return new Decimal(0);
}
return this.calculateCurrentMOIC(company);
```

`calculateCurrentMOIC` at line 515 derives `currentValuation / totalInvested`.
When `currentMOIC` is explicitly 0 (write-off), `Decimal(0)` is correct. When
`currentMOIC` is null/undefined, derive from fundamentals. Guard:
`totalInvested <= 0` returns `Decimal(0)` to prevent Decimal.js `Infinity` from
division by zero cascading through reserve calculations.

- [ ] **Step 5: Fix the underwater check at line 785**

```typescript
// Before:
if (company.currentMOIC && company.currentMOIC < 1) {

// After:
if (company.currentMOIC != null && company.currentMOIC < 1) {
```

The `&&` short-circuits on 0 (falsy), skipping the underwater multiplier for
write-off companies. `!= null` correctly enters the block for
`currentMOIC === 0`.

- [ ] **Step 6: Run test to verify MOIC fixes pass**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/engines/deterministic-reserve-engine.test.ts
```

Expected: PASS

- [ ] **Step 7: Write failing test — missing stage must be excluded, not
      defaulted to seed**

Extend `tests/unit/services/reserve-input-builder.provenance.test.ts`. First,
**migrate the `REGRESSION` case at `:103-129`**: it currently asserts
`legacy[0]?.stage === 'seed'`. Replace those assertions with the "excluded"
behaviour below (keep the `sector === 'unknown'` and `ownership === null`
assertions — those defaults are unchanged by this task). Then add:

```typescript
import {
  buildReservePortfolioInputWithProvenanceFromRows,
  buildReserveInputTrustSummary,
  buildReservePortfolioInputWithTrustFromRows, // export it if it is not already
} from '../../../server/services/reserve-input-builder';
import { generateReserveSummary } from '@shared/core/reserves/ReserveEngine';

describe('reserve-input-builder stage handling', () => {
  // --- Investment path (investments populated — THIS IS THE LIVE PROD PATH) ---

  it('marks a null round as unavailable and excludes the company from the engine portfolio', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: null,
          sector: 'SaaS',
        },
        {
          id: 2,
          company_id: 11,
          amount: '200000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });

    expect(built.provenancePortfolio).toHaveLength(2);
    expect(built.provenancePortfolio[0].provenance.stage).toEqual({
      status: 'unavailable',
      source: 'investments.round',
      reason:
        'No round recorded; company excluded from reserve allocation (no default is substituted)',
    });
    expect(built.provenancePortfolio[0].stage).toBe('');
    // The engine-facing portfolio omits the company entirely.
    expect(built.portfolio.map((c) => c.id)).toEqual([11]);
    expect(built.reserveInputTrustSummary.trustedForActivation).toBe(false);
    expect(built.reserveInputTrustSummary.unavailableFields).toContain('stage');
  });

  it('treats a blank round the same as null', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: '   ',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });
    expect(built.provenancePortfolio[0].provenance.stage.status).toBe(
      'unavailable'
    );
    expect(built.portfolio).toEqual([]);
  });

  it('passes an observed round through verbatim so ReserveEngine display-name multipliers still match', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });
    expect(built.portfolio[0]).toMatchObject({ id: 10, stage: 'Series A' });
    expect(built.provenancePortfolio[0].provenance.stage.status).toBe(
      'observed'
    );
  });

  it('a missing-stage company receives no reserve allocation from generateReserveSummary', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [
        {
          id: 1,
          company_id: 10,
          amount: '100000',
          ownership_percentage: '0.1',
          round: null,
          sector: 'SaaS',
        },
        {
          id: 2,
          company_id: 11,
          amount: '100000',
          ownership_percentage: '0.1',
          round: 'Series A',
          sector: 'SaaS',
        },
      ],
      companies: [],
    });
    // ReserveOutput carries no companyId; allocations are positional over `portfolio`.
    const summary = generateReserveSummary(1, built.portfolio);
    expect(summary.allocations).toHaveLength(1);
    // Regression guard: with the old 'seed' default the excluded company hit the
    // || 2.0 fallback and added 100000 * 2.0 * <sector factor> to totalAllocation.
    const onlyObserved = generateReserveSummary(1, [built.portfolio[0]]);
    expect(summary.totalAllocation).toBe(onlyObserved.totalAllocation);
  });

  // --- Company path (investments: [], companies populated) ---

  it('marks a null company stage as unavailable and excludes it (company path)', () => {
    const built = buildReservePortfolioInputWithTrustFromRows({
      investments: [],
      companies: [
        { id: 101, investment_amount: '500000', stage: null, sector: 'SaaS' },
      ],
    });
    expect(built.provenancePortfolio[0].provenance.stage).toEqual({
      status: 'unavailable',
      source: 'portfolio_companies.stage',
      reason:
        'No stage recorded; company excluded from reserve allocation (no default is substituted)',
    });
    expect(built.portfolio).toEqual([]);
  });
});
```

`generateReserveSummary` seeds its calculation context with `seed: 42` and
`asOf: new Date()`; `totalAllocation` is deterministic for a given portfolio so
the equality assertion above is stable.

- [ ] **Step 8: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/reserve-input-builder.provenance.test.ts
```

Expected: FAIL — currently defaults missing stage to `'seed'`, keeps the company
in `portfolio`, and `generateReserveSummary` allocates `100000 * 2.0 * 1.1` to
it.

- [ ] **Step 9: Allow an empty `stage` on the provenance-carrying record only**

`ReserveCompanyInputWithProvenanceSchema`
(`shared/contracts/reserve-input-provenance.contract.ts:29-31`) extends
`ReserveCompanyInputSchema`, whose `stage` is `z.string().min(1)`. The
engine-facing `ReserveCompanyInput` must keep `min(1)` — an empty stage must
never reach `generateReserveSummary`. Only the provenance record needs to carry
the excluded row:

```typescript
export const ReserveCompanyInputWithProvenanceSchema =
  ReserveCompanyInputSchema.extend({
    // Empty only when provenance.stage.status === 'unavailable'; such rows are
    // excluded from the engine-facing portfolio by toLegacyReservePortfolio.
    stage: z.string(),
    provenance: ReserveCompanyInputProvenanceSchema,
  }).strict();
```

`facts-reserve-input-adapter.ts:107` already treats
`company.stage.trim().length === 0` as `missing_stage`, so the facts path needs
no change.

- [ ] **Step 10: Fix reserve-input-builder stage logic — BOTH builder functions,
      plus the legacy projection**

**(a) In `investmentRowToPortfolioWithProvenance` (line 82)** — THIS IS THE LIVE
PROD PATH (14 investment rows). Replace the hardcoded seed default:

```typescript
function investmentRowToPortfolioWithProvenance(
  row: InvestmentPortfolioRow
): ReserveCompanyInputWithProvenance {
  const ownershipMissing = row.ownership_percentage == null;
  const observedRound =
    row.round != null && row.round.trim().length > 0 ? row.round : null;
  const sectorMissing = row.sector == null || row.sector.trim().length === 0;

  return {
    id: row.company_id ?? row.id,
    invested: toNumber(row.amount),
    ownership: ownershipMissing ? null : toNumber(row.ownership_percentage),
    stage: observedRound ?? '',
    sector:
      row.sector != null && row.sector.trim().length > 0
        ? row.sector
        : 'unknown',
    provenance: {
      invested: fieldProvenance('observed', 'investments.amount', null),
      ownership: ownershipMissing
        ? fieldProvenance(
            'unavailable',
            'investments.ownership_percentage',
            'Ownership percentage is not recorded; no default is substituted (ADR-054)'
          )
        : fieldProvenance('observed', 'investments.ownership_percentage', null),
      stage:
        observedRound == null
          ? fieldProvenance(
              'unavailable',
              'investments.round',
              'No round recorded; company excluded from reserve allocation (no default is substituted)'
            )
          : fieldProvenance('observed', 'investments.round', null),
      sector: sectorMissing
        ? fieldProvenance(
            'defaulted',
            'system_default_sector',
            'Missing sector uses unknown legacy default'
          )
        : fieldProvenance('observed', 'portfolio_companies.sector', null),
    },
  };
}
```

Note `observedRound` is passed through **untrimmed and uncanonicalized** —
exactly what the current code does for a present round — so `ReserveEngine`'s
display-name multipliers and the hashed `RESERVE_ASSUMPTIONS` keep matching.

**(b) In `companyRowToPortfolioWithProvenance` (line 122)**, apply the same
pattern with `row.stage`, source `'portfolio_companies.stage'`, and reason
`'No stage recorded; company excluded from reserve allocation (no default is substituted)'`.
Leave the `invested` (defaulted) and `ownership` (unavailable, ADR-054)
provenance as-is.

**(c) In `toLegacyReservePortfolio` (line 166)** — this is the exclusion. The
engine-facing array drops any row whose stage is unavailable:

```typescript
function toLegacyReservePortfolio(
  provenancePortfolio: ReserveCompanyInputWithProvenance[]
): ReserveCompanyInput[] {
  return provenancePortfolio
    .filter((company) => company.provenance.stage.status !== 'unavailable')
    .map(({ id, invested, ownership, stage, sector }) => ({
      id,
      invested,
      ownership,
      stage,
      sector,
    }));
}
```

`provenancePortfolio` (consumed by `facts-reserve-input-adapter.ts:77`) still
contains the row so the facts path can emit an `excluded` candidate with
`missing_stage`, and `buildReserveInputTrustSummary` still counts it. Also
export `buildReservePortfolioInputWithTrustFromRows` if the test needs it.

> **Why `'unavailable'` not `'excluded'`:** `'excluded'` is not in the
> `fieldProvenance` status type union
> (`'observed' | 'approved_assumption' | 'estimated' | 'defaulted' | 'unavailable'`).
> `'unavailable'` is already in the union, already counted in the trust summary
> (lines 62-63, `trustedForActivation` = false), and already mapped to
> `missing_stage` by the facts adapter. Same semantics, no union change.

- [ ] **Step 11: Run test to verify it passes**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/reserve-input-builder.provenance.test.ts tests/unit/services/reserves/facts-reserve-input-adapter.test.ts tests/unit/engines/deterministic-reserve-engine.parity.test.tsx tests/unit/services/reserve-calculation-facts-inputs.test.ts
```

Expected: PASS. The parity suite must be untouched — if it fails, an observed
round was altered on the way to `generateReserveSummary`, which is exactly the
regression this task must not introduce.

- [ ] **Step 12: Run phoenix:truth**

```bash
npm run phoenix:truth
```

Expected: all truth cases pass (MOIC and stage changes affect reserve
calculations). Also confirm the reserve receipt assumptions hash is unchanged
(`RESERVE_ASSUMPTIONS` was not edited).

- [ ] **Step 13: Commit**

```bash
git add shared/core/reserves/DeterministicReserveEngine.ts shared/contracts/reserve-input-provenance.contract.ts server/services/reserve-input-builder.ts tests/unit/engines/deterministic-reserve-engine.test.ts tests/unit/services/reserve-input-builder.provenance.test.ts
git commit -m "$(cat <<'EOF'
fix(reserves): stop coercing 0x MOIC to 1x and exclude missing stages

DeterministicReserveEngine.ts:526 used || 1 which coerced legitimate 0x
write-offs to 1x MOIC. Line 785 used && which skipped the underwater
multiplier for 0x companies. reserve-input-builder silently defaulted a
missing stage to 'seed', which missed ReserveEngine's display-name
multiplier table and landed on the || 2.0 fallback; companies with no
recorded stage are now marked unavailable and excluded from the
engine-facing portfolio. Observed rounds pass through unchanged.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Fix AI Abort/Retry Stacking

**Files:**

- Modify: `server/services/ai-orchestrator.ts:199-235`
- Test: `tests/unit/services/ai-orchestrator.test.ts` (or create)

**Interfaces:**

- Consumes: `CONFIG.timeout`, provider SDK clients (Anthropic, OpenAI, Gemini)
- Produces: `withRetryAndTimeout<T>(fn)` — simplified to single-attempt with
  timeout race. `_model` parameter removed (was unused after retry-loop
  deletion). Custom retry loop removed; SDK built-in retries handle transient
  failures. `AbortController.signal` is NOT passed to `fn` because: (a)
  Anthropic's `messages.create` is the hot path and its SDK accepts signal, but
  the call sites pass a pre-built request object as a closure; (b) the
  `Promise.race` timeout already rejects our side, and the orphaned SDK call
  terminates naturally or via SDK timeout. Passing signal is a nice-to-have for
  clean cancellation — not P0. Update all call sites to drop the second
  argument.

**Background on SDKs:**

- `anthropic.messages.create(request)` — Anthropic SDK has built-in retries with
  exponential backoff (2 retries by default). SDK instance at line 36 does NOT
  set `maxRetries`, so default applies.
- `openai.chat.completions.create(...)` — OpenAI SDK has built-in retries (2
  retries by default). SDK instances at lines 40/48 do NOT set `maxRetries`, so
  defaults apply.
- `@google/generative-ai` — does NOT have built-in retry. However, for a 5-user
  internal tool, SDK-level retry for Gemini is YAGNI. If Gemini calls fail, the
  AI orchestrator already returns an error response to the caller. **Note:**
  Gemini IS exercised in production (`askAll` defaults include `'gemini'` at
  line 466). Removing the custom retry loop means Gemini calls fail on any
  transient error (429, 500, 503) with zero retry, while Claude and GPT still
  have SDK-level retry. Accepted for a 5-user internal tool. If Gemini transient
  failures become noticeable, add a single-retry wrapper for the Gemini path
  only.
- Verified: `CONFIG.maxRetries = 2` (line 30) is the CUSTOM retry loop's config,
  not an SDK setting. Removing the custom loop leaves SDK-level retries intact.

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/p0-ai-abort-retry origin/main
```

- [ ] **Step 2: Write failing test — custom retries do not stack on SDK
      retries**

In `tests/unit/services/ai-orchestrator.test.ts` (create if absent). Two timing
constraints shape this test:

- `CONFIG.timeout` is `AI_TIMEOUT_MS ?? 90000` (`ai-orchestrator.ts:29`), read
  once at module load. The vitest `testTimeout` is 30000
  (`vitest.config.mjs:95`). A real-clock timeout test would time out the runner
  before the orchestrator times out, so **use fake timers** and advance them
  past 90s.
- The current retry loop sleeps `2^attempt * 1000` ms between attempts (1s +
  2s). Under fake timers the first test must advance those too, otherwise it
  hangs waiting for the backoff.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetryAndTimeout } from '../../../server/services/ai-orchestrator';

describe('withRetryAndTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fn exactly once — no custom retry loop', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('transient');
      return 'ok';
    };
    // Attach the rejection handler BEFORE advancing timers so an early rejection
    // is never observed as unhandled.
    const pending = expect(withRetryAndTimeout(fn)).rejects.toThrow(
      'transient'
    );
    // Before the fix the loop sleeps 1s then 2s between attempts; advance far enough
    // that the old code finishes its retries and the assertion below fails on callCount.
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(callCount).toBe(1);
  });

  it('rejects on timeout without waiting a real 90s', async () => {
    const fn = () =>
      new Promise<string>((resolve) =>
        setTimeout(() => resolve('late'), 999_999)
      );
    const pending = expect(withRetryAndTimeout(fn)).rejects.toThrow(/timeout/i);
    // Just past CONFIG.timeout (90000ms default). Before the fix this only ends the
    // first attempt; the loop then backs off and re-races, so the old code needs
    // 3 x 90s + 3s to reject — advance in a loop so the failing run also terminates.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(91_000);
    }
    await pending;
  });
});
```

Do not set `AI_TIMEOUT_MS` in the test to shorten the window: the env is parsed
at import time and other suites may import the module first; fake timers make
the real value irrelevant.

- [ ] **Step 3: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/ai-orchestrator.test.ts
```

Expected: FAIL — the first test fails on `callCount` (current code retries
`maxRetries` times, so `callCount === 2` once the second attempt resolves `'ok'`
and the promise actually _fulfils_, making the `rejects` assertion fail too).
The second test passes under both old and new code because the timers are
advanced far enough for either to reject — it is a regression guard for the
fake-timer wiring, not a red/green pair.

- [ ] **Step 4: Export and replace withRetryAndTimeout with single-attempt
      timeout**

In `server/services/ai-orchestrator.ts`, export the function and replace lines
199-235:

```typescript
export async function withRetryAndTimeout<T>(fn: () => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error(`Timeout after ${CONFIG.timeout}ms`))
        );
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Removes: the `for` retry loop, the exponential backoff sleep, the auth-error
retry exemption (SDK handles this), `lastError` tracking, and the unused
`_model` parameter. Update all call sites (`askClaude`, `askGPT`, `askGemini`)
to drop the second argument.

- [ ] **Step 5: Run test to verify it passes**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/ai-orchestrator.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/ai-orchestrator.ts tests/unit/services/ai-orchestrator.test.ts
git commit -m "$(cat <<'EOF'
fix(ai): remove custom retry loop that stacked on SDK built-in retries

withRetryAndTimeout had exponential-backoff retries that stacked on top
of the Anthropic and OpenAI SDKs' own retry logic. Simplified to
single-attempt with timeout race. SDK retries handle transient failures
natively.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Type Position Value as Nullable Instead of Coercing Null to $0

**Files:**

- Modify: `server/services/position-value.ts` (all 16 lines)
- Modify:
  `server/services/performance-calculator.ts:138-141,406-413,421-435,440-450,470-505`
  (`computePositionValue(...).toNumber()` callers; group Map type;
  breakdown/totals assembly)
- Modify: `shared/types/performance-api.ts:74-89`
  (`BreakdownGroup.currentValue/moic/unrealizedGain`,
  `BreakdownTotals.currentValue/averageMOIC` become `number | null`)
- Modify: `server/services/portfolio-overview-service.ts:60-90` (per-row
  value/MOIC, aggregates, and `returnPct` at `:88-90` which calls
  `totalValue.minus(...)`)
- Modify: `shared/contracts/portfolio-overview-v1.contract.ts:19-45`
  (`currentValue`, `moic`, `totalValue`, `averageMOIC`, `returnPct` become
  nullable)
- Modify: `server/services/fund-metrics-calculator.ts:13-35,117-120,145-182`
  (`CalculatedFundMetrics` type; `totalValue` reduce uses
  `toDecimal(company.currentValuation || 0)` — this is a separate null-to-zero
  coercion, NOT a `computePositionValue` caller; MOIC/TVPI/IRR terminal-value
  derivations)
- Modify: `server/services/fund-metrics-attribution-service.ts:31-90`
  (`formatDecimal(calculatedMetrics.totalValue, 2)` at `:59` writes a required
  string into `fund_metrics.totalvalue`, which is `NOT NULL` at
  `shared/schema.ts:385`)
- Modify:
  `client/src/components/portfolio/tabs/OverviewTab.tsx:60-70,104-112,253-256`
  (`toNumber()` helper coerces null to 0 BEFORE any render guard — row/KPI
  conversion must preserve null)
- Modify: `client/src/utils/pdf/templates/QuarterlyTemplate.tsx:178`
  (`.reduce((sum, co) => sum + co.value, 0)` — null + number = NaN)
- Modify:
  `client/src/components/modeling-wizard/steps/capital-allocation/CompanyDialog.tsx:127`
  (`watch('currentValue') || 0` masks null — use `?? 0`)
- Modify: `client/src/utils/pdf/templates/TearSheetTemplate.tsx:176-178,206`
  (`formatCurrency(metrics.currentValue)` and
  `metrics.currentValue > metrics.totalInvested` — null crashes PDF generation)
- Test: `tests/unit/services/position-value.test.ts` (existing — 93 lines,
  includes conservation-sum test at line 78)
- Test: `tests/unit/services/fund-metrics-attribution*.test.ts` (new or extend —
  'unavailable' outcome when `totalValue` is null)

**Interfaces:**

- Consumes: `Decimal`, `toDecimal` from `@shared/lib/decimal-utils`
- Produces: `computePositionValue(opts)` returns `Decimal | null`. `null` means
  valuation data is missing — callers MUST skip null results in sums rather than
  treating as $0. Explicit $0 valuation (a real data point) returns
  `Decimal(0)`.
- Contract change: `PortfolioOverviewCompanySchema.currentValue` and `.moic`
  become `DecimalStringSchema.nullable()`.
  `PortfolioOverviewMetricsSchema.totalValue`, `.averageMOIC`, and `.returnPct`
  become `DecimalStringSchema.nullable()`. This is a V1 contract version bump —
  client must handle null values.
- Type change: `BreakdownGroup.currentValue`, `.moic`, `.unrealizedGain` and
  `BreakdownTotals.currentValue`, `.averageMOIC` become `number | null`
  (`shared/types/performance-api.ts`).
- Type change: `CalculatedFundMetrics.totalValue`, `.moic`, `.tvpi` become
  `number | null` (`fund-metrics-calculator.ts:13`). `irr` is already
  `number | null`.
- Attribution outcome: `ensureAttributedFundMetricsForCalcRun` returns
  `row | null`. When `totalValue` is null it returns `null` and does NOT insert
  a `fund_metrics` row (column is `NOT NULL`; no schema migration in this task).
  No discriminated union — one reason code on a 5-user tool = YAGNI.

> **Owner decision (round 1):** when fund-level `totalValue` is null,
> attribution skips persistence and reports an `'unavailable'` outcome. No
> `fund_metrics` row is written; no `0` is substituted; no schema migration to
> make `totalvalue` nullable. The caller (`variance-alert-automation.ts:324`)
> must tolerate the unavailable outcome and continue to baseline creation (log
> at info level).

**Why `Decimal | null` instead of a discriminated union:** 5-user internal tool,
one reason for unavailability (missing valuation), consumers just need
null-check. YAGNI on reason codes.

**Aggregate rule:** If ANY company in the aggregate has null valuation, the
aggregate is null (not a misleading number that silently omits unknowns). GP
fixes the one company instead of seeing a confidently wrong total. One rule,
four consumers, same pre-scan pattern.

- [ ] **Step 0: Aggregate null rule — strict API + annotated client (resolved)**

**Decision (dialectical synthesis):** strict API layer (any-null = all-null for
the aggregate number) **plus** annotated client display. The contract carries
`valuedCount` and `totalCount` alongside the nullable aggregate fields. When all
companies are valued, the client shows `$47M`. When 12/13 are valued, the API
returns `totalValue: null` but also `valuedCount: 12, totalCount: 13`; the
client shows `$47M (12 of 13 valued)` using a partial sum it computes from
per-row values. This avoids presenting a confidently wrong total while still
giving the GP actionable information.

**Contract addition** (`shared/contracts/portfolio-overview-v1.contract.ts`):
add `valuedCount: z.number()` and `totalCount: z.number()` to
`PortfolioOverviewMetricsSchema`. Service populates from the `computed` array.
Client uses these to decide between `N/A` and the annotated partial display.
Steps 8-11 proceed with strict null on the aggregate fields as written.

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/p0c-position-value-null origin/main
```

- [ ] **Step 2: Write failing test — null valuation returns null, not
      Decimal(0)**

In `tests/unit/services/position-value.test.ts`, update the existing
null-valuation tests:

```typescript
it('returns null when valuation is null', () => {
  const result = computePositionValue({
    currentValuation: null,
    ownershipCurrentPct: '0.25',
  });
  expect(result).toBeNull();
});

it('returns null when both are null', () => {
  const result = computePositionValue({
    currentValuation: null,
    ownershipCurrentPct: null,
  });
  expect(result).toBeNull();
});

it('returns Decimal(0) when valuation is explicitly 0 (real data point)', () => {
  const result = computePositionValue({
    currentValuation: 0,
    ownershipCurrentPct: '0.10',
  });
  expect(result).not.toBeNull();
  expect(result!.equals(new Decimal('0'))).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/position-value.test.ts
```

Expected: FAIL — current function returns `Decimal(0)` for null valuation.

- [ ] **Step 4: Implement nullable position value**

Rewrite `server/services/position-value.ts`:

```typescript
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';

type DecimalLike = Decimal | number | string;

export function computePositionValue(opts: {
  currentValuation: DecimalLike | null | undefined;
  ownershipCurrentPct: DecimalLike | null | undefined;
}): Decimal | null {
  if (opts.currentValuation == null) {
    return null;
  }
  const companyValuation = toDecimal(opts.currentValuation);
  const ownership =
    opts.ownershipCurrentPct == null
      ? null
      : toDecimal(opts.ownershipCurrentPct);
  return ownership != null && ownership.gt(0)
    ? companyValuation.times(ownership)
    : companyValuation;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/position-value.test.ts
```

Expected: PASS (after updating the test expectations in Step 2).

- [ ] **Step 6: Update conservation-sum test**

The existing test at line 78 (`is order-independent for group sums`) sums all
companies including one with `null` valuation. Update it to exclude null
results:

```typescript
it('is order-independent for group sums (null valuations excluded)', () => {
  const companies = [
    { currentValuation: '10000000', ownershipCurrentPct: '0.15' },
    { currentValuation: null, ownershipCurrentPct: null },
    { currentValuation: '8000000', ownershipCurrentPct: '0' },
  ];

  const sum = (list: typeof companies) =>
    list.reduce((acc, c) => {
      const v = computePositionValue(c);
      return v != null ? acc + v.toNumber() : acc;
    }, 0);

  const forward = sum(companies);
  const reversed = sum([...companies].reverse());

  expect(forward).toBe(reversed);
  // null company excluded: 1,500,000 + 8,000,000 = 9,500,000
  expect(forward).toBe(1500000 + 8000000);
});
```

- [ ] **Step 7: Update portfolio-overview contract schema**

In `shared/contracts/portfolio-overview-v1.contract.ts`, make nullable every
field that can be unknown when a company has no valuation. `returnPct` is
derived from `totalValue` (`portfolio-overview-service.ts:88-90` calls
`totalValue.minus(totalInvested)`), so it MUST be nullable too — otherwise the
service either crashes on `null.minus` or fails contract validation:

```typescript
// In PortfolioOverviewCompanySchema (line 19):
currentValue: DecimalStringSchema.nullable(),
moic: DecimalStringSchema.nullable(),

// In PortfolioOverviewMetricsSchema (line 33):
totalValue: DecimalStringSchema.nullable(),
averageMOIC: DecimalStringSchema.nullable(),
returnPct: DecimalStringSchema.nullable(),
```

This is a V1 contract version bump. Client code that does
`parseFloat(company.currentValue)` will get `NaN` for null — Step 12 updates the
client so null survives conversion instead of being coerced to zero.

- [ ] **Step 8: Update performance-calculator.ts — cashflow builder (line 138)**

In `buildCompanyCashflows`, add an aggregate pre-scan. If ANY company has null
valuation, the fund-level IRR is meaningless — return empty cashflows so the
caller gets null IRR. The pre-scan does NOT change the TypeScript return type of
`computePositionValue` (still `Decimal | null`), so the existing `.toNumber()`
chain at `:138-141` will not compile — guard the returned Decimal explicitly:

```typescript
function buildCompanyCashflows(
  companies: PerformanceCompany[],
  distributionsByCompany: Map<number, DistributionRecord[]>,
  asOfDate: string
): XirrCashFlow[] {
  // Aggregate null rule: one unknown valuation invalidates the whole IRR
  const anyNullValuation = companies.some((c) => c.currentValuation == null);
  if (anyNullValuation) {
    return [];
  }

  const terminalDate = new Date(asOfDate);
  const cashflows: XirrCashFlow[] = [];

  for (const company of companies) {
    const investmentDate = company.investmentDate ?? company.createdAt;
    const investmentAmount = Number(company.investmentAmount) || 0;
    const positionValue = computePositionValue({
      currentValuation: company.currentValuation,
      ownershipCurrentPct: company.ownershipCurrentPct,
    });
    // Pre-scan guarantees non-null at runtime; the type guard keeps tsc honest
    // and makes an unexpected null a skipped terminal cashflow, not a crash.
    const currentValue = positionValue != null ? positionValue.toNumber() : 0;

    // ... rest of function unchanged
```

The `currentValue > 0` check at line 162 still holds (explicit
$0 → no terminal cashflow, which is correct for a real $0 position).

- [ ] **Step 9: Update performance-calculator.ts — group accumulation and
      breakdown assembly (lines 406-505)**

Three type sites must widen, not just the initializer cast (casting
`0 as number | null` does nothing to the Map's declared value type at
`:406-413`):

**(a) Widen `shared/types/performance-api.ts:74-89`:**

```typescript
export interface BreakdownGroup {
  group: string;
  companyCount: number;
  totalDeployed: number;
  /** Current value of holdings in this group (null when any company lacks a valuation) */
  currentValue: number | null;
  /** Multiple on Invested Capital (null when currentValue is null) */
  moic: number | null;
  /** Internal Rate of Return (null when truthful IRR is unavailable) */
  irr: number | null;
  /** Unrealized gain (null when currentValue is null) */
  unrealizedGain: number | null;
  percentOfPortfolio: number;
}

export interface BreakdownTotals {
  companyCount: number;
  totalDeployed: number;
  currentValue: number | null;
  averageMOIC: number | null;
  portfolioIRR: number | null;
}
```

**(b) Widen the group Map type (`performance-calculator.ts:406-413`) and
accumulate with null propagation (`:421-435`):**

```typescript
const groups = new Map<
  string,
  {
    companies: typeof filteredCompanies;
    totalDeployed: number;
    currentValue: number | null;
  }
>();

for (const company of filteredCompanies) {
  // ... groupKey unchanged
  const existing = groups.get(groupKey) || {
    companies: [],
    totalDeployed: 0,
    currentValue: 0 as number | null,
  };

  existing.companies.push(company);
  existing.totalDeployed += Number(company.investmentAmount) || 0;

  const groupPositionValue = computePositionValue({
    currentValuation: company.currentValuation,
    ownershipCurrentPct: company.ownershipCurrentPct,
  });
  // Aggregate null rule: once null, the group stays null
  existing.currentValue =
    groupPositionValue == null || existing.currentValue == null
      ? null
      : existing.currentValue + groupPositionValue.toNumber();
  groups.set(groupKey, existing);
}
```

**(c) Totals loop (`:440-450`):**

```typescript
let totalDeployedSum = 0;
let totalCurrentValue: number | null = 0;
let totalCompanyCount = 0;

for (const [, group] of groups) {
  totalDeployedSum += group.totalDeployed;
  totalCurrentValue =
    group.currentValue == null || totalCurrentValue == null
      ? null
      : totalCurrentValue + group.currentValue;
  totalCompanyCount += group.companies.length;
}
```

**(d) Breakdown assembly, sort, and totals (`:470-505`):**

```typescript
for (const [groupName, group] of groups) {
  const moic =
    group.currentValue == null
      ? null
      : group.totalDeployed > 0
        ? group.currentValue / group.totalDeployed
        : 0;
  const irr = calculateCanonicalIrr(
    buildCompanyCashflows(group.companies, distributionsByCompany, asOfDate)
  );

  breakdown.push({
    group: groupName,
    companyCount: group.companies.length,
    totalDeployed: group.totalDeployed,
    currentValue: group.currentValue,
    moic,
    irr,
    unrealizedGain:
      group.currentValue == null
        ? null
        : group.currentValue - group.totalDeployed,
    percentOfPortfolio:
      totalDeployedSum > 0 ? (group.totalDeployed / totalDeployedSum) * 100 : 0,
  });
}

// Sort by MOIC descending; null MOIC sorts last (unknown, not zero)
breakdown.sort((a, b) => {
  if (a.moic == null && b.moic == null) return 0;
  if (a.moic == null) return 1;
  if (b.moic == null) return -1;
  return b.moic - a.moic;
});

const totals: BreakdownTotals = {
  companyCount: totalCompanyCount,
  totalDeployed: totalDeployedSum,
  currentValue: totalCurrentValue,
  averageMOIC:
    totalCurrentValue == null
      ? null
      : totalDeployedSum > 0
        ? totalCurrentValue / totalDeployedSum
        : 0,
  portfolioIRR,
};
```

Run `npm run check` after this step — any remaining consumer of
`BreakdownGroup.moic`/`currentValue` that assumed `number` (e.g. client
breakdown charts) will surface as a type error and must be null-guarded, not
coerced.

- [ ] **Step 10: Update portfolio-overview-service.ts (lines 60-90)**

Per-row null:

```typescript
const computed = companies.map((company) => {
  const invested = toDecimal(company.investmentAmount ?? '0');
  const currentValue = computePositionValue({
    currentValuation: company.currentValuation,
    ownershipCurrentPct: company.ownershipCurrentPct,
  });
  const moic =
    currentValue == null
      ? null
      : invested.lte(0)
        ? new Decimal(0)
        : currentValue.dividedBy(invested);
  return { company, invested, currentValue, moic };
});
```

Row mapping:

```typescript
currentValue: currentValue != null ? currentValue.toFixed() : null,
moic: moic != null ? moic.toFixed() : null,
```

Aggregate null rule — if any company has null `currentValue`, `totalValue`,
`averageMOIC`, AND `returnPct` are all null (`returnPct` is derived from
`totalValue`; the current code at `:88-90` would throw on `null.minus`):

```typescript
const companyCount = computed.length;
const totalInvested = sum(computed.map((entry) => entry.invested));
const anyNullValue = computed.some((entry) => entry.currentValue == null);

const totalValue = anyNullValue
  ? null
  : sum(computed.map((entry) => entry.currentValue as Decimal));
const averageMOIC =
  anyNullValue || companyCount === 0
    ? anyNullValue
      ? null
      : new Decimal(0)
    : sum(computed.map((entry) => entry.moic as Decimal)).dividedBy(
        companyCount
      );
const returnPct =
  totalValue == null
    ? null
    : totalInvested.lte(0)
      ? new Decimal(0)
      : totalValue.minus(totalInvested).dividedBy(totalInvested).times(100);
```

Format for response:

```typescript
totalValue: totalValue != null ? totalValue.toFixed() : null,
averageMOIC: averageMOIC != null ? averageMOIC.toFixed() : null,
returnPct: returnPct != null ? returnPct.toFixed() : null,
```

The deterministic input hash at `:95+` includes `currentValuation` from the raw
company rows, so null vs `0` already hash differently — no change needed there.

- [ ] **Step 11: Update fund-metrics-calculator.ts and
      fund-metrics-attribution-service.ts**

`fund-metrics-calculator.ts:117-120` does NOT call `computePositionValue`; it
has its own null-to-zero coercion (`toDecimal(company.currentValuation || 0)`).
Apply the same aggregate null rule and propagate through every metric that
depends on terminal value — MOIC, TVPI, and IRR (the IRR terminal cashflow at
`:170-175` pushes `totalValue` as a positive flow):

**(a) Widen `CalculatedFundMetrics` (`:13-35`):**

```typescript
/** Current total value of all portfolio holdings (null when any company lacks a valuation) */
totalValue: number | null;
/** Multiple on Invested Capital (null when totalValue is null) */
moic: number | null;
/** Total Value to Paid-In (null when totalValue is null) */
tvpi: number | null;
// irr is already number | null; dpi does not depend on valuation and stays number
```

**(b) Replace the reduce (`:117-120`):**

```typescript
const anyNullValuation = portfolioCompanies.some(
  (company) => company.currentValuation == null
);
const totalValue = anyNullValuation
  ? null
  : portfolioCompanies.reduce((sum, company) => {
      return (
        sum + toDecimal(company.currentValuation as string | number).toNumber()
      );
    }, 0);
```

**(c) Derived metrics (`:145-182`):**

```typescript
const moic =
  totalValue == null
    ? null
    : totalInvested > 0
      ? totalValue / totalInvested
      : 0;
const dpi = totalInvested > 0 ? totalDistributions / totalInvested : 0;
const tvpi =
  totalValue == null
    ? null
    : totalInvested > 0
      ? (totalDistributions + totalValue) / totalInvested
      : 0;

// IRR: a missing terminal value means the IRR is unknown, not "IRR of flows so far"
const irr = totalValue == null ? null : calculateCanonicalIrr(cashflows);
```

Keep the `if (totalValue > 0)` terminal push, but guard it as
`if (totalValue != null && totalValue > 0)` so tsc is satisfied.

**(d) Attribution — 'unavailable' outcome instead of a `NOT NULL` violation
(`fund-metrics-attribution-service.ts:31-90`):**

`fund_metrics.totalvalue` is `NOT NULL` (`shared/schema.ts:385`). Per owner
decision, do NOT migrate the column and do NOT substitute `0`. Change the return
type to a discriminated result and short-circuit before the insert:

```typescript
export async function ensureAttributedFundMetricsForCalcRun(
  runId: number
): Promise<typeof fundMetrics.$inferSelect | null> {
  // ... run lookup unchanged

  if (existingMetrics) {
    return existingMetrics;
  }

  const calculatedMetrics = await calculateFundMetrics(run.fundId);

  if (calculatedMetrics.totalValue == null) {
    // fund_metrics.totalvalue is NOT NULL; a fabricated 0 would be a lie.
    return null;
  }

  // ... insert unchanged; return createdMetrics (or concurrentMetrics in unique-violation branch)
}
```

Update the caller at `variance-alert-automation.ts:324-326`:

```typescript
const attribution = await withTimeout(
  'ensureAttributedFundMetricsForCalcRun',
  () => ensureAttributedFundMetricsForCalcRun(runId)
);
if (attribution == null) {
  log.info(
    { event: 'alert.calc_run.skipped', runId, fundId },
    'Skipped calc-run alert automation: fund metrics unavailable (totalValue null)'
  );
  this.healthState.counters.skipped += 1;
  return;
}
const baseline = await withTimeout('createBaselineFromCalcRun', () =>
  this.baselines.createBaselineFromCalcRun(runId)
);
// ... existing rules query + evaluation loop unchanged ...
```

(`log` is the module-level `logger.child(...)` at
`variance-alert-automation.ts:45`; there is no bare `logger` symbol in scope.
The counters type at `:37-42` is closed — reuse `skipped`, do not add a field.)

**(d2) Automation test (`tests/unit/services/variance-alert-automation.test.ts`
— extend existing):** mock `ensureAttributedFundMetricsForCalcRun` to resolve
`null`; assert `createBaselineFromCalcRun` and `evaluateVarianceAlerts` are NOT
called and `runCalcRunCompletion` resolves without throwing.

**(e) Test (`tests/unit/services/fund-metrics-attribution-service.test.ts` — new
or extend existing):**

- Mock `calculateFundMetrics` to return `totalValue: null`; assert the result is
  `null` and `db.insert` was NOT called.
- Mock a non-null `totalValue`; assert the result is the inserted row and the
  `values` call received the formatted `totalValue`.
- Grep before writing: `grep -rn "ensureAttributedFundMetricsForCalcRun" tests/`
  — migrate any existing assertion that expects a different return shape.

- [ ] **Step 12: Add client-side null guards**

The V1 contract now has nullable
`currentValue`/`moic`/`totalValue`/`averageMOIC`. Client components that use
`PortfolioOverviewResponseV1` will break without null guards — Zod parse
succeeds (fields are `.nullable()`), but downstream JS operations on null
produce NaN or TypeError.

**(a) `OverviewTab.tsx`** — the render-site guards below are necessary but NOT
sufficient. `buildPortfolioRow` (`:104-112`) and the KPI memo (`:253-256`) pass
every value through the local `toNumber()` helper (`:60-71`), which returns `0`
for null. Any guard placed after that point sees `0`, never `null` — the
fabricated zero is baked in before rendering. Fix conversion first, then
rendering:

1. Add a null-preserving helper next to `toNumber` (`:60`):

```typescript
function toNullableNumber(
  value: string | number | null | undefined
): number | null {
  if (value == null) return null;
  return toNumber(value);
}
```

2. Widen `PortfolioRow` (`:49-57`) —
   `currentValue: number | null; moic: number | null;` — and use the new helper
   in `buildPortfolioRow` (`:111-112`):

```typescript
currentValue: toNullableNumber(company.currentValue),
moic: toNullableNumber(company.moic),
```

3. Widen the KPI memo shape and conversion (`:253-256`):

```typescript
totalValue: toNullableNumber(metrics.totalValue),
averageMOIC: toNullableNumber(metrics.averageMOIC),
returnPct: toNullableNumber(metrics.returnPct),
```

4. Guard EVERY consumer of those fields — desktop table (`:682,685`), mobile
   card (`:177,181`), KPI summary cards (`:339-353`), KPI header (`:625-633`),
   and CSV export (`:291-292`). Pattern:

```typescript
// Currency
{row.currentValue != null ? formatCurrency(row.currentValue) : 'N/A'}
// Multiple
{row.moic != null ? `${row.moic.toFixed(2)}x` : 'N/A'}
// Percent delta (KPI header / cards)
delta={portfolioMetrics.returnPct != null
  ? `${portfolioMetrics.returnPct >= 0 ? '+' : ''}${portfolioMetrics.returnPct.toFixed(1)}%`
  : 'N/A'}
intent={portfolioMetrics.returnPct == null ? 'neutral' : portfolioMetrics.returnPct >= 0 ? 'positive' : 'negative'}
// CSV export: emit empty string, not 0
'Current value': row.currentValue ?? '',
MOIC: row.moic ?? '',
```

`npm run check` after this step surfaces any remaining site that still assumes
`number`; fix each with a guard, never with `?? 0`.

**(b) `QuarterlyTemplate.tsx:178`** — `.reduce((sum, co) => sum + co.value, 0)`
produces NaN if any `co.value` is null. Use `?? 0`:

```typescript
// Before:
portfolioCompanies.reduce((sum, co) => sum + co.value, 0);

// After:
portfolioCompanies.reduce((sum, co) => sum + (co.value ?? 0), 0);
```

**(c) `CompanyDialog.tsx:127`** — `watch('currentValue') || 0` coerces both null
AND legitimate `0` to zero. Use nullish coalescing:

```typescript
// Before:
watch('currentValue') || 0;

// After:
watch('currentValue') ?? 0;
```

**(d) `TearSheetTemplate.tsx:176-178,206`** —
`formatCurrency(metrics.currentValue)`,
`metrics.currentValue > metrics.totalInvested`, and
`metrics.currentValue - metrics.totalInvested` crash or give wrong results when
`currentValue` is null (`null > number` is `false`, silently hiding the trend
indicator; `formatCurrency(null)` may NaN; `null - number` = `NaN`):

```typescript
// Before (lines 176-178):
value={formatCurrency(metrics.currentValue, { compact: true })}
trend={metrics.currentValue > metrics.totalInvested ? 'up' : 'down'}

// After:
value={metrics.currentValue != null ? formatCurrency(metrics.currentValue, { compact: true }) : 'N/A'}
trend={metrics.currentValue != null && metrics.currentValue > metrics.totalInvested ? 'up' : 'neutral'}

// Before (line 206 — unrealized gain):
{formatCurrency(metrics.currentValue - metrics.totalInvested, { compact: true })}

// After:
{metrics.currentValue != null
  ? formatCurrency(metrics.currentValue - metrics.totalInvested, { compact: true })
  : 'N/A'}
```

> **Note:** `PortfolioTable.tsx` in the modeling-wizard uses its own local
> `CompanyData` Zod schema (CompanyDialog.tsx:45), not the V1 contract. Its
> `currentValue` is a user-entered number field, not server-derived. No change
> needed there. `FundConstructionKpiHeader.tsx:198` references `'currentValue'`
> as a watch key string, not a value — no arithmetic, no change needed.

- [ ] **Step 13: Run all affected tests**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/position-value.test.ts tests/unit/services/performance-calculator tests/unit/services/portfolio-overview tests/unit/services/fund-metrics tests/unit/services/variance-alert
npm run check
```

Expected: all pass.

- [ ] **Step 14: Run phoenix:truth**

```bash
npm run phoenix:truth
```

Expected: all truth cases pass. If any truth case depended on null-becomes-zero,
update the truth fixture to reflect the correct behavior (aggregate null when
any input null). Step 13 in the spec ("update the truth fixture to reflect
correct behavior") means: inspect the fixture, decide whether it encoded the
null-to-$0 bug, and if so update it with a comment explaining why the expected
value changed.

- [ ] **Step 15: Commit**

```bash
git add server/services/position-value.ts server/services/performance-calculator.ts server/services/portfolio-overview-service.ts server/services/fund-metrics-calculator.ts server/services/fund-metrics-attribution-service.ts server/services/variance-alert-automation.ts shared/contracts/portfolio-overview-v1.contract.ts shared/types/performance-api.ts client/src/components/portfolio/tabs/OverviewTab.tsx client/src/utils/pdf/templates/QuarterlyTemplate.tsx client/src/components/modeling-wizard/steps/capital-allocation/CompanyDialog.tsx client/src/utils/pdf/templates/TearSheetTemplate.tsx tests/unit/services/
git commit -m "$(cat <<'EOF'
fix(position-value): return null for missing valuation, propagate to aggregates

computePositionValue returned Decimal(0) when currentValuation was null,
making missing data indistinguishable from genuine $0 positions. Now
returns null. Aggregate rule: if any company has null valuation, the
aggregate (IRR, totalValue, averageMOIC, returnPct, MOIC, TVPI) is null
rather than a misleading number. V1 contract updated — currentValue, moic,
totalValue, averageMOIC, returnPct now nullable. BreakdownGroup/Totals and
CalculatedFundMetrics widened. Fund-metrics attribution returns an
'unavailable' outcome and skips the NOT NULL fund_metrics row when
totalValue is null. Client conversion preserves null before render guards.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add Calc Version to CF V2 Receipt Predicate

**Files:**

- Modify: `server/services/current-forecast-v2-service.ts:329-341` (CF V2
  receipt predicate)
- Test: `tests/unit/services/current-forecast-v2-service.test.ts` (or create)

**Interfaces:**

- Consumes: `CURRENT_FORECAST_V2_CALC_VERSION` (`'cf-v2/1.0.0'`),
  `fundSnapshots.calcVersion` (varchar(20) column, already exists in schema at
  `shared/schema/fund.ts:189`)
- Produces: `currentForecastReceiptPredicate` now includes
  `eq(fundSnapshots.calcVersion, CURRENT_FORECAST_V2_CALC_VERSION)`. A version
  bump immediately invalidates cached CF V2 results.

**Scenario run identity (P0-D) — NOT a bug (inputHash embeds version):** Traced
`fund-scenario-calculation-service.ts:610-627`: `hashEnvelopeBase` includes
`engineVersion: FUND_SCENARIO_CALC_VERSION` which flows into
`createScenarioInputHash(...)`. The `inputHash` is part of
`ScenarioCalculationRunIdentity` (line 630-641) and is matched by
`findCompletedScenarioRun`. A calc version bump changes the hash, so no stale
completed run is found — the safety net works at BOTH the run level (hash
mismatch) and the snapshot level (`findReusableScenarioSnapshot:537`). The P0-D
spec claim was incorrect: there is no version gap in the scenario reuse path. No
code change needed for scenarios.

- [ ] **Step 1: Create branch**

```bash
git checkout -b fix/p0e-cf-v2-calc-version-predicate origin/main
```

- [ ] **Step 2: Write failing test — CF V2 receipt predicate includes
      calcVersion**

In `tests/unit/services/current-forecast-v2-service.test.ts` (create if absent):

```typescript
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  currentForecastReceiptPredicate,
  CURRENT_FORECAST_V2_CALC_VERSION,
} from '../../../server/services/current-forecast-v2-service';

describe('currentForecastReceiptPredicate', () => {
  it('includes calcVersion in the predicate SQL and binds the version as a parameter', () => {
    // currentForecastReceiptPredicate must be exported (add `export` keyword
    // at line 329: `export function currentForecastReceiptPredicate`)
    const predicate = currentForecastReceiptPredicate({
      fundId: 1,
      financialFactsSnapshotId: 42,
      currentPlanVersionId: 7,
      clock: '2026-01-01T00:00:00.000Z',
    });
    // Drizzle SQL has no .toSQL() — use PgDialect to serialize.
    // Drizzle parameterizes values: the SQL text contains the column reference
    // and a `$n` placeholder; the literal version lives in `params`, NOT in `sql`.
    const dialect = new PgDialect();
    const { sql: sqlString, params } = dialect.sqlToQuery(predicate!);
    expect(sqlString).toContain('"fund_snapshots"."calc_version"');
    expect(sqlString).not.toContain(CURRENT_FORECAST_V2_CALC_VERSION);
    expect(params).toContain(CURRENT_FORECAST_V2_CALC_VERSION);
  });
});
```

> **Implementation note:** `currentForecastReceiptPredicate` is NOT exported
> (plain `function` at line 329). Add `export` keyword.
> `CURRENT_FORECAST_V2_CALC_VERSION` IS already exported (line 45). The lookup
> function is `findCurrentForecastV2Receipt` (line 344), not
> `findExistingCurrentForecastV2Snapshot` (that name does not exist). Drizzle's
> `SQL` type has no `.toSQL()` method -- use
> `new PgDialect().sqlToQuery(predicate)`. The installed Drizzle emits
> `"fund_snapshots"."calc_version" = $n` with the version in `params` (e.g.
> `['cf-v2/1.0.0']`); asserting `toContain('cf-v2/1.0.0')` on the SQL string
> would fail even after a correct implementation. Assert the column in `.sql`
> and the version in `.params`.

- [ ] **Step 3: Run test to verify it fails**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/current-forecast-v2-service.test.ts
```

Expected: FAIL — current predicate does not filter on `calcVersion`, so
old-version row still matches.

- [ ] **Step 4: Export and fix CF V2 receipt predicate**

In `server/services/current-forecast-v2-service.ts`:

First, export the predicate (line 329) so the test can access it:

```typescript
// Before:
function currentForecastReceiptPredicate(input: {

// After:
export function currentForecastReceiptPredicate(input: {
```

Then add `calcVersion` to the `and()` clause (around line 335-341):

```typescript
// Add this line to the and() clause:
eq(fundSnapshots.calcVersion, CURRENT_FORECAST_V2_CALC_VERSION),
```

Full predicate after fix:

```typescript
return and(
  eq(fundSnapshots.fundId, input.fundId),
  eq(fundSnapshots.type, 'CURRENT_FORECAST_V2'),
  eq(fundSnapshots.calcVersion, CURRENT_FORECAST_V2_CALC_VERSION),
  sql`${fundSnapshots.payload}->>'financialFactsSnapshotId' = ${String(input.financialFactsSnapshotId)}`,
  sql`${fundSnapshots.payload}->>'currentPlanVersionId' = ${String(input.currentPlanVersionId)}`,
  eq(fundSnapshots.snapshotTime, new Date(input.clock))
);
```

One line added.

- [ ] **Step 5: Run test to verify it passes**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/current-forecast-v2-service.test.ts
```

Expected: PASS

- [ ] **Step 6: Run full CF V2 test suite**

```bash
TZ=UTC npx vitest run --config vitest.config.mjs --configLoader native tests/unit/services/current-forecast
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add server/services/current-forecast-v2-service.ts tests/
git commit -m "$(cat <<'EOF'
fix(cf-v2): add calcVersion to receipt reuse predicate

CF V2 receipt predicate matched on fundId/type/facts/plan/clock but
excluded calcVersion despite writing it on insert. A methodology
version bump would silently serve stale results. One-line fix adds
eq(fundSnapshots.calcVersion, CURRENT_FORECAST_V2_CALC_VERSION) to
the and() clause.

Scenario reuse path (P0-D) verified as NOT a bug: inputHash already
embeds engineVersion via hashEnvelopeBase, so version bumps produce
different hashes and no stale run is matched.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Items 6-10 (Not Scoped Here)

These items need separate brainstorm+plan each. Included for traceability:

| #   | Item                                                                                                 | Notes                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | Prod release of items 1-5                                                                            | Follow `docs/workflows/PRODUCTION_SCRIPTS.md`. Owner-gated.                                                                                                                    |
| 7   | P1 semantic primitives (stage enum, MOIC type, coverage object)                                      | Needs design brainstorm — touches all calculator consumers. ~1wk. Scenario run calc_version NOT needed (inputHash already embeds version).                                     |
| 8   | Construction Forecast completion                                                                     | Builds on existing construction infrastructure. ~2wk.                                                                                                                          |
| 9   | Current vs Construction workspace                                                                    | New decision surface UI. ~1wk.                                                                                                                                                 |
| 10  | Unrecognized-but-present reserve rounds (e.g. `'Bridge'`) hit ReserveEngine `\|\| 2.0`               | Changing alters `RESERVE_ASSUMPTIONS` hash + parity suite. Owner-scoped out of P0 (round 2). Decide: exclude with `'unavailable'` provenance vs explicit per-round multiplier. |
| 11  | Construction J-curve `expectedIRR: config.targetIRR ?? 0.25` (`projected-metrics-calculator.ts:470`) | Same fabrication class as P0-A but on the construction path; J-curve engine does not compute IRR. Make nullable with provenance or compute.                                    |
| 12  | Reserve Decision Center                                                                              | Highest-value net-new product capability. ~2wk.                                                                                                                                |

## Dual `FUND_SCENARIO_CALC_VERSION` Note

Both `fund-scenario-calculation-service.ts:52` and
`fund-scenario-reserve-snapshot-store.ts:14` define
`FUND_SCENARIO_CALC_VERSION = process.env['ALG_FUND_SCENARIO_VERSION'] ?? 'fund-scenarios-v1'`.
Identical expression, same env var, same default — NOT a drift bug today. Both
feed into `createScenarioInputHash` via `hashEnvelopeBase.engineVersion`, so the
inputHash is version-safe. Consolidating to a single shared constant is a P1
cleanup.
