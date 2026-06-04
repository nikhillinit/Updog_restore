---
status: ACTIVE
last_updated: 2026-06-02
owner: Core Team
phase:
  Scenario comparison + evidence + analytics pilot + forecast modes + cohort
  readiness
implementation: dispatched via Hermes after review (Claude plans/verifies only)
already_shipped: >-
  R3A/R3B single-set increments landed on main ahead of this plan's sequence:
  percentageDelta surfacing (6028c9b3) and the single-set metric x variant
  matrix (3d5feb19 + test a059d3d4). This plan's "matrix mode" deferral (section
  5.2) predates that work; the single-set matrix is retained for the 1-set case
  (section 3.13) and is the foundation for PR A's cross-set table. Nothing in PR
  A conflicts with it.
next_pr: PR A (Cross-Set Side-by-Side Scenario Comparison, section 3)
---

# Updog Restore: Standalone Implementation Plan

**Artifact purpose:** This plan is a self-contained implementation blueprint for
the `Updog_restore` scenario-comparison, evidence, analytics-pilot,
forecast-mode, and cohort-readiness workstream.

**Repository:** `nikhillinit/Updog_restore`  
**Primary live surface:** `/fund-model-results/:fundId`  
**Primary product invariant:** user-visible analytics must be truthful,
source-scoped, contract-backed, and explicit about stale, unavailable,
unsupported, or mixed-source states.

---

## 0. Executive Summary

This workstream should be implemented as a sequenced set of scoped PRs rather
than one broad redesign. The first implementation PR should ship the cross-set
scenario-comparison table and its immediate evidence/source-config guardrails.
Later PRs should expand evidence coverage, run a narrow analytics pilot, harden
forecast-mode actuals, and keep cohort readiness experimental until snapshot and
backfill proof exists.

### Recommended PR sequence

1. **PR A — Cross-set side-by-side scenario comparison**
   - New grouped table that compares multiple calculated fee-profile scenario
     sets.
   - Shows all fee-profile variants or requires an explicit selector.
   - Keeps each set’s delta scoped to that set’s own pinned authoritative
     baseline.
   - Adds direction-aware delta copy and source-config warnings.
   - Does not add a backend batch endpoint unless a 10-set check proves it
     necessary.

2. **PR B — R4 non-scenario evidence completion**
   - Extends truthful evidence headers to non-scenario result sections.
   - Prevents overclaiming section provenance from top-level lifecycle.
   - Ensures section-specific evidence always wins over page-level lifecycle
     evidence.
   - Adds a small scorecard source-summary contract only if required.

3. **PR C — R5 analytics pilot under #763**
   - Narrow pilot: scenario comparison evidence/source bands plus the cross-set
     table.
   - Defers density switch / small multiples / metric matrix to a follow-up
     unless the first table proves unusable.
   - Does not introduce driver narratives without contract-backed driver data.

4. **PR D — Forecast modes**
   - Keeps forecast modes isolated to `/api/funds/:fundId/dual-forecast`.
   - Protects scenario contracts from actuals / forecast-mode contamination.
   - Verifies quarter-zero actuals and future forecast-point semantics.

5. **PR E+ — Cohort promotion staging**
   - Keeps cohort experimental until real cohort snapshots, result-contract
     support, and a backfill plan exist.
   - Only then promotes cohort to authoritative readiness.

---

## 1. Source Evidence Reviewed

This plan was built from repository files, existing contracts, previous plan
drafts, and the attached critical-review comments.

### Live product and routing context

- `README.md`
  - Authoritative user flow:
    `/fund-setup -> review -> publish -> /fund-model-results/:fundId`.
  - Older planning/KPI surfaces are archived or intentionally narrow.
- `client/src/pages/fund-model-results.tsx`
  - Existing live results page.
  - Already fetches scenario-set comparisons per set.
  - Already has a reusable `SectionRenderer`.
- `client/src/components/fund-results/ScenarioComparisonTable.tsx`
  - Existing single-set comparison UI.
  - Renders baseline plus every variant in a scenario set.
- `client/src/components/fund-results/ScenarioSetsSummary.tsx`
  - Existing scenario set summary cards and scenario evidence.
- `client/src/components/results/EvidenceHeader.tsx`
  - Current generic lifecycle evidence rail.
- `client/src/components/results/ScenarioEvidenceHeader.tsx`
  - Scenario-specific evidence rail.
- `client/src/components/results/scenario-evidence.ts`
  - Scenario evidence model and aggregation rules.

### Scenario contracts and services

- `shared/contracts/fund-scenario-comparison-v1.contract.ts`
  - Strict comparison contract.
  - Fixed comparison metric keys.
  - Baseline/variant/metric-delta schema.
- `shared/contracts/fund-scenario-sets-v1.contract.ts`
  - Scenario sets allow 1–5 variants.
  - All variants in a set must share the same override type.
  - Active scenario sets are capped elsewhere at 10 per fund.
- `server/services/fund-scenario-comparison-service.ts`
  - Loads the latest scenario snapshot.
  - Supports fee-profile comparisons only.
  - Loads authoritative economics baseline for the scenario set’s own pinned
    source config.
  - Uses `scenario_set_id IS NULL` for authoritative baseline snapshots.
  - Produces metric deltas, including non-drift-capable per-metric deltas.
- `server/routes/fund-scenario-sets.ts`
  - Existing comparison route:
    `/api/funds/:fundId/scenario-sets/:scenarioSetId/comparison`.

### Fund results and evidence contracts

- `shared/contracts/fund-results-v1.contract.ts`
  - Top-level result status is lifecycle-derived.
  - Sections independently advertise `available`, `pending`, `unavailable`, or
    `failed`.
  - Reserve/pacing use available-section wrappers with snapshot source.
  - Scorecard is mixed-source at field level.
  - Waterfall setup is config-backed.
  - Economics has its own section-level `source`, `configVersion`, and
    `calculatedAt`.

### Analytics doctrine

- `docs/design/analytics-visualization-principles.md`
  - Truthfulness beats polish.
  - Evidence travels with the number.
  - Comparison is the default analytical act.
  - Production analytics must label stale, unavailable, failed, demo, and
    pending states.
- `docs/design/analytics-visualization-rollout.md`
  - Sequencing: make result true, scoped, traceable, comparable, then beautiful.
  - Keep this cycle narrow: one evidence primitive, one live pilot, one
    contract-dependency list.
  - Scenario comparison/workspace is the correct live pilot.
  - Do not start broad visualization redesign before the data layer is ready.

### Forecast and cohort guardrails

- `shared/types/dual-forecast.ts`
  - Dual-forecast response already carries construction/current/actual source
    metadata.
  - Each forecast point carries `actual`, `currentMode`, and `current`.
- `server/services/metrics-aggregator.ts`
  - Dual forecast uses actual metrics for the as-of point and projected metrics
    for future points.
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
  - Dashboard already charts actuals separately from current forecast values.
- `shared/contracts/fund-authoritative-calculations.contract.ts`
  - Reserve and pacing are authoritative.
  - Cohort and economics are experimental.
- `shared/contracts/fund-state-read-v1.contract.ts`
  - Expected snapshot types derive from authoritative snapshot types.
  - Adding a new expected snapshot type requires backfill planning.
- `workers/cohort-worker.ts`
  - Cohort worker still uses mock company inputs and does not write
    authoritative snapshots.
- `server/routes/cohort-analysis.ts`
  - Cohort routes adapt body/query `fundId` into fund-access middleware.
  - Cohort analysis route loads fund-scoped cohort inputs and validates its
    response.

### Attached comments incorporated

The attached comments were accepted with amendments:

- Multi-variant fee-profile handling is now a blocking design requirement.
- R5 is narrowed to evidence/source bands plus cross-set comparison.
- Metric extensibility is handled through compile-time strictness, not generic
  runtime unknown-key rendering.
- Cell-level delta-unavailable behavior remains necessary for comparable
  payloads with non-drift-capable metric deltas.
- A 10-set performance check and error-isolation consideration are added.
- Section-specific evidence wins over lifecycle evidence.

---

## 2. Global Architecture Rules

These rules apply to every PR in this sequence.

### 2.1 Do not compare across source configs by normalizing baselines

Each scenario set is pinned to a `sourceConfigId` and `sourceConfigVersion` at
creation time. Cross-set side-by-side display may show values beside each other,
but metric deltas must remain scoped to each set’s own authoritative economics
baseline.

Correct:

```text
Set A variant - Set A authoritative baseline
Set B variant - Set B authoritative baseline
```

Incorrect:

```text
Set A variant - Set B baseline
Set B variant - Set A baseline
Global baseline shared across all sets
```

### 2.2 Do not silently omit variants

Scenario sets can contain up to five homogeneous variants. A cross-set
comparison must either:

- render every comparable fee-profile variant, or
- require an explicit user selection control that clearly shows omitted
  variants.

No “first variant,” “best variant,” or implicit default is allowed.

### 2.3 Do not widen scenario comparison beyond fee-profile in this workstream

The current comparison service supports fee-profile variants only. Unsupported
types must remain explicit:

- `reserve_allocation`
- `allocation`
- `sector_profile`

Any broadening requires a separate contract/server decision.

### 2.4 Section evidence must not be self-certifying

The UI may not infer evidence, access scope, or source truth from route shape
alone. If a section carries section-level source/config/calculated data, use it.
If it does not, label provenance honestly as mixed, unavailable, or
lifecycle-only.

### 2.5 Forecast actuals belong to dual forecast, not scenario contracts

Actuals and forecast modes stay on:

- `shared/types/dual-forecast.ts`
- `server/services/metrics-aggregator.ts`
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`

They must not be added to scenario set or scenario comparison contracts.

### 2.6 Cohort remains experimental until proof exists

Cohort must not become authoritative until:

- the worker uses real fund-scoped data,
- cohort snapshots are written,
- result-contract support exists,
- an idempotent backfill plan exists,
- readiness and calc-run completion are re-proven.

---

## 3. PR A — Cross-Set Side-by-Side Scenario Comparison

### 3.1 Goal

Add a live, contract-backed cross-set scenario comparison table in the Scenario
Analysis section of `/fund-model-results/:fundId`.

The table should allow a user to compare fee-profile scenario outcomes across
multiple scenario sets while preserving source-config and baseline boundaries.

### 3.2 Scope

In scope:

- New cross-set comparison component.
- Reuse existing per-set comparison fetches.
- Show all fee-profile variants or explicit selection UI.
- Direction-aware delta text.
- Source-config version labels and warnings.
- Fallback cards for non-comparable scenario sets.
- Targeted client tests.
- Focused performance/error-isolation checks.

Out of scope:

- Backend batch endpoint unless a 10-set check fails.
- New scenario comparison contracts.
- Reserve/allocation/sector comparison semantics.
- Small multiples/density toggle.
- Driver/assumption-diff narratives.
- Cohort or dual-forecast changes.

### 3.3 Primary files

Add:

- `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`
- `tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx`

Modify:

- `client/src/components/fund-results/index.ts`
- `client/src/pages/fund-model-results.tsx`
- `tests/unit/pages/fund-model-results.test.tsx`
- Possibly `tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx`

### 3.4 Data contract

Use existing:

```ts
FundScenarioComparisonV1;
ScenarioComparisonMetricKey;
ScenarioComparisonMetricDeltaV1;
ScenarioComparisonMetricMap;
ScenarioComparisonVariantV1;
SCENARIO_COMPARISON_METRIC_KEYS;
```

Do not alter `fund-scenario-comparison-v1.contract.ts` for PR A.

### 3.5 Component API

```ts
export interface CrossSetScenarioComparisonTableProps {
  comparisons: FundScenarioComparisonV1[];
  maxVisibleVariantColumns?: number;
}
```

`comparisons` should already be filtered to comparable fee-profile comparisons
by the caller, but the component should defensively ignore non-comparable inputs
and render an honest empty state if no comparable variants exist.

### 3.6 Derived view model

Create internal view-model types:

```ts
interface CrossSetVariantColumn {
  scenarioSetId: string;
  scenarioSetName: string;
  sourceConfigId: number;
  sourceConfigVersion: number;
  stalenessLabel: string;
  calculatedAt: string | null;
  baselineLabel: string;
  variantId: string;
  variantName: string;
  metrics: ScenarioComparisonMetricMap;
  metricDeltas: ScenarioComparisonMetricDeltaV1[];
}

interface MetricRowView {
  metric: ScenarioComparisonMetricKey;
  label: string;
  kind: ScenarioComparisonMetricKind;
  cells: CrossSetMetricCell[];
}

interface CrossSetMetricCell {
  column: CrossSetVariantColumn;
  baselineValue: number | null;
  scenarioValue: number | null;
  absoluteDelta: number | null;
  percentageDelta: number | null;
  driftCapable: boolean;
  driftReason: ScenarioComparisonMetricDeltaV1['driftReason'];
}
```

### 3.7 Multi-variant display rule

Default MVP behavior:

- Flatten every comparable fee-profile variant into a visible variant column.
- Group variant columns under scenario-set headers.
- Sticky first column for metric labels if horizontal overflow is needed.

Example:

```text
| Metric | Fee sensitivity · Source config v4        | Carry sensitivity · Source config v5       |
|--------|-------------------------------------------|--------------------------------------------|
|        | Lower fee              | Higher carry   | Lower fee             | Higher carry     |
| TVPI   | 2.10x / +0.30x         | 1.95x / +0.15x | 1.50x / +0.30x        | 1.40x / +0.20x   |
```

No implicit variant selection is allowed.

### 3.8 Column explosion rule

The bounded maximum is 10 active scenario sets × 5 variants = 50 variant
columns. The UI must not pretend this is a normal-width table.

Default rule:

- `variantColumnCount <= 8`: render full grouped table.
- `variantColumnCount > 8`: render horizontal scroll with sticky metric column
  and visible count copy.

Visible count copy:

```text
Showing 12 fee-profile variants across 4 scenario sets.
```

Optional follow-up:

- Add explicit scenario-set or variant selector if real fixture data shows
  horizontal scroll is not usable.

### 3.9 Source-config warning rule

If all comparable variants share the same
`{sourceConfigId, sourceConfigVersion}`, show normal source labels.

If not all comparable variants share the same source config identity, show a
warning/caption:

```text
Scenario sets use different source configs. Values are shown side-by-side, but each delta is calculated against that set’s own pinned authoritative baseline.
```

This copy should be visible near the table header, not only in a tooltip.

### 3.10 Metric definitions

Use a compile-time exhaustive map:

```ts
type MetricDirection = 'higher_better' | 'lower_better' | 'neutral';

interface MetricDefinition {
  label: string;
  kind: 'percent' | 'money' | 'multiple';
  direction: MetricDirection;
}

const METRIC_DEFINITIONS = {
  lpNetIrr: {
    label: 'Net LP IRR',
    kind: 'percent',
    direction: 'higher_better',
  },
  gpNetIrr: {
    label: 'Net GP IRR',
    kind: 'percent',
    direction: 'higher_better',
  },
  totalManagementFees: {
    label: 'Management Fees',
    kind: 'money',
    direction: 'lower_better',
  },
  totalGpCarryDistributed: {
    label: 'GP Carry',
    kind: 'money',
    direction: 'neutral',
  },
  totalGpFeeIncome: {
    label: 'GP Fee Income',
    kind: 'money',
    direction: 'neutral',
  },
  finalDpi: { label: 'DPI', kind: 'multiple', direction: 'higher_better' },
  finalTvpi: { label: 'TVPI', kind: 'multiple', direction: 'higher_better' },
  finalClawbackDue: {
    label: 'Clawback Due',
    kind: 'money',
    direction: 'lower_better',
  },
} satisfies Record<ScenarioComparisonMetricKey, MetricDefinition>;
```

Do not add generic unknown-metric rendering under the current strict contract.
Unknown metric keys should fail contract parsing instead of silently rendering.

Add a test that `Object.keys(METRIC_DEFINITIONS)` matches
`SCENARIO_COMPARISON_METRIC_KEYS`.

### 3.11 Delta copy and semantics

Avoid using green/red as universal good/bad.

Cell copy should distinguish arithmetic movement from interpretation:

- `Higher by +0.30x`
- `Lower by -$500K`
- `No change`
- `Delta unavailable`
- `Baseline unavailable`
- `Scenario value unavailable`
- `Baseline is zero; percentage delta unavailable`

For neutral metrics such as GP carry and GP fee income:

- show arithmetic direction but avoid “better/worse” treatment.

Recommended footnote:

```text
Direction labels show arithmetic movement. They do not imply a universal good/bad judgment across LP and GP perspectives.
```

### 3.12 Cell-level delta unavailable behavior

Keep cell-level delta-unavailable handling. It is required because a comparison
can be `comparable` while individual metric deltas are not drift-capable.

Use:

- `delta.driftCapable`
- `delta.driftReason`
- `delta.absoluteDelta`
- `delta.percentageDelta`

Do not remove this state merely because non-comparable comparisons render
fallback cards.

### 3.13 Panel integration

Modify `ScenarioComparisonPanel` in `fund-model-results.tsx`.

Current behavior:

- maps each comparison to a separate `ScenarioComparisonTable`.

New behavior:

1. Split comparisons into:
   - `comparableFeeProfileComparisons`
   - `nonComparableComparisons`
2. If `comparableFeeProfileComparisons.length >= 2`, render
   `CrossSetScenarioComparisonTable`.
3. If exactly one comparable comparison, render existing
   `ScenarioComparisonTable`.
4. Render non-comparable comparisons as existing fallback/status cards.
5. Keep loading and error copy.

Pseudo-code:

```tsx
const comparable = state.comparisons.filter(isComparableFeeProfileComparison);
const nonComparable = state.comparisons.filter((comparison) => !isComparableFeeProfileComparison(comparison));

return (
  <div className="space-y-4">
    {state.kind === 'loading' && ...}
    {state.kind === 'error' && ...}

    {comparable.length >= 2 ? (
      <CrossSetScenarioComparisonTable comparisons={comparable} />
    ) : comparable.length === 1 ? (
      <ScenarioComparisonTable comparison={comparable[0]} />
    ) : null}

    {nonComparable.map((comparison) => (
      <ScenarioComparisonTable key={comparison.scenarioSet.scenarioSetId} comparison={comparison} />
    ))}
  </div>
);
```

### 3.14 Fetch strategy

Keep the existing per-set comparison route and parallel fetch logic for PR A.

Do not add a backend batch endpoint unless the 10-set performance check fails.

Implementation check:

- fixture or seed data with 10 scenario sets,
- measure request count and perceived render delay,
- if unacceptable, file or implement follow-up batch route:
  `GET /api/funds/:fundId/scenario-comparisons?scenarioSetIds=...`

### 3.15 Error isolation consideration

Current `Promise.all` behavior means one comparison fetch failure rejects the
entire batch. For PR A, decide explicitly:

Option A, preferred if low-risk:

- Change to `Promise.allSettled`.
- Render successful comparable comparisons.
- Render failed sets as compact unavailable cards.

Option B:

- Keep existing `Promise.all`.
- Add follow-up issue for error isolation.

Do not silently hide failed comparison requests.

### 3.16 Tests for PR A

Add `CrossSetScenarioComparisonTable.test.tsx` with:

1. **renders multiple scenario sets side-by-side**
   - two comparable sets,
   - each with one variant,
   - table appears once.

2. **renders all fee-profile variants**
   - one set has two variants,
   - another set has two variants,
   - all four variant names are visible.

3. **does not silently omit variants**
   - assert omitted variant names are not absent.
   - optionally assert visible count.

4. **shows source config versions**
   - Set A `Source config v4`,
   - Set B `Source config v5`.

5. **warns on differing source configs**
   - visible warning copy appears.

6. **keeps deltas scoped to each set baseline**
   - Set A baseline TVPI 1.80, variant 2.10, delta +0.30.
   - Set B baseline TVPI 1.20, variant 1.50, delta +0.30.
   - Assert both deltas are +0.30.
   - Assert the table does not compute cross-set delta.

7. **renders lower-better metrics without misleading color semantics**
   - management fees lower by -$500K,
   - copy says lower by,
   - not generic red/green good/bad only.

8. **renders non-drift-capable cells**
   - zero baseline or missing metric,
   - copy explains reason.

9. **column explosion behavior**
   - > 8 variant columns,
   - visible count appears,
   - table has horizontal-scroll/sticky-column container.

10. **metric definition exhaustiveness**
    - `Object.keys(METRIC_DEFINITIONS)` equals
      `SCENARIO_COMPARISON_METRIC_KEYS`.

Update `fund-model-results.test.tsx`:

- two scenario set IDs in `sections.scenarios`,
- two comparison responses,
- cross-set table appears once,
- old per-set comparable tables do not duplicate,
- non-comparable comparisons still render status cards.

### 3.17 PR A validation

Focused:

```bash
cross-env TZ=UTC vitest run tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/pages/fund-model-results.test.tsx --project=client
```

Closeout:

```bash
npm run validate:core
git diff --check
git status --short --branch
```

### 3.18 PR A acceptance criteria

- Multiple calculated fee-profile scenario sets render in one side-by-side
  comparison table.
- Every comparable fee-profile variant is visible or explicitly user-selected.
- Each scenario-set group shows its own source config version.
- Differing source configs trigger visible warning copy.
- Deltas are calculated only against each set’s own authoritative baseline.
- Direction-aware delta copy is used.
- Cell-level unavailable delta reasons render.
- Unsupported override types remain visible and explicit.
- Existing single-set behavior still works.
- Targeted tests and `npm run validate:core` pass.

---

## 4. PR B — R4 Non-Scenario Evidence Completion

### 4.1 Goal

Extend truthful evidence headers to non-scenario sections on
`/fund-model-results/:fundId` without overclaiming that top-level lifecycle
evidence is section-specific evidence.

### 4.2 Scope

In scope:

- Extend `EvidenceHeader` props/model to represent section provenance.
- Add a section evidence normalizer in `fund-model-results.tsx`.
- Mount evidence on Overview, Waterfall Setup, and GP Economics.
- Preserve existing Reserve and Pacing behavior.
- Keep Scenario Analysis on scenario-specific evidence.
- Optional small scorecard source-summary contract.

Out of scope:

- Access-scope field unless server emits it.
- Major evidence rail redesign.
- New analytics primitives.
- Scenario comparison changes.

### 4.3 Primary files

Modify:

- `client/src/pages/fund-model-results.tsx`
- `client/src/components/results/EvidenceHeader.tsx`
- `tests/unit/components/results/EvidenceHeader.test.tsx`
- `tests/unit/pages/fund-model-results.test.tsx`

Maybe modify:

- `shared/contracts/fund-results-v1.contract.ts`
- server results assembler for scorecard source summary
- contract tests for fund results if scorecard source summary is added

### 4.4 Evidence provenance model

Add:

```ts
type EvidenceProvenanceLevel =
  | 'lifecycle_backed_result'
  | 'section_backed_result'
  | 'config_backed_setup'
  | 'mixed_scorecard_sources'
  | 'scenario_evidence';
```

Extend evidence object:

```ts
export interface EvidenceHeaderLifecycle {
  status: LifecycleStatus | 'ready' | 'unavailable';
  configVersion: number | null;
  runId?: number | null;
  lastCalculatedAt: string | null;
  publishedVersion?: number | null;
  source?: string | null;
  provenanceLevel?: EvidenceProvenanceLevel;
  sourceLabel?: string | null;
}
```

Important:

- `runId` should be optional for config-backed/mixed sections.
- Do not display `RUN UNAVAILABLE` for sections where a run is not applicable.
- Do display “run unavailable” only when a run is applicable but missing.

### 4.5 Section evidence precedence

Rule:

```text
Section-specific evidence wins over top-level lifecycle evidence.
```

This means:

- section `source` beats lifecycle `source`,
- section `configVersion` beats lifecycle `configVersion`,
- section `calculatedAt` or `publishedAt` beats lifecycle `lastCalculatedAt`,
- top-level lifecycle may provide overall freshness only when not conflicting.

### 4.6 Section-specific behavior

#### Reserve Allocation

Use lifecycle-backed result evidence:

- status from lifecycle,
- config version from lifecycle,
- run ID from lifecycle,
- calculated timestamp from lifecycle,
- source from section when available, otherwise `/api/funds/:id/results`.

#### Deployment Pacing

Same as Reserve Allocation.

#### GP Economics

Use section-backed evidence:

- source: section `source` (`fund_snapshots`),
- config version: section `configVersion`,
- calculated timestamp: section `calculatedAt`,
- status may use lifecycle freshness only if it does not override section
  identity.

Do not replace economics section evidence with top-level lifecycle values.

#### Waterfall Setup

Use config-backed setup evidence:

- source: `fund_config`,
- config version: section `configVersion`,
- timestamp: `publishedAt`,
- no calculation run display.

Suggested label:

```text
CONFIG-BACKED · CONFIG v12 · PUBLISHED 2026-06-02 ... · SOURCE fund_config
```

#### Overview / Scorecard

Use mixed-source evidence:

- Scorecard payload contains field-level sources:
  - `funds`,
  - `fund_snapshots`,
  - `fund_state`.
- If no section-level source summary exists yet, display:

```text
MIXED SOURCES · FUNDS / FUND_SNAPSHOTS / FUND_STATE
```

Do not claim scorecard as solely `fund_snapshots`.

#### Scenario Analysis

Do not mount generic lifecycle evidence as the main evidence header. Keep
existing scenario-specific evidence:

- scenario set ID,
- calculation mode,
- source config version,
- current published config version,
- calculated timestamp,
- source,
- staleness state.

### 4.7 Optional scorecard contract change

Only add if needed:

```ts
const ScorecardSourceSummarySchema = z
  .object({
    sources: z.array(z.enum(['funds', 'fund_snapshots', 'fund_state'])).min(1),
    calculatedAt: z.string().datetime().nullable(),
  })
  .strict();
```

Then:

```ts
const ScorecardSectionSchema = z.union([
  z
    .object({
      status: z.literal('available'),
      sourceSummary: ScorecardSourceSummarySchema.optional(),
      payload: ScorecardPayloadSchema,
    })
    .strict(),
  SectionUnavailableSchema,
]);
```

This should be a small contract slice, not a wider result-contract migration.

### 4.8 Tests for PR B

Add/update tests:

1. **Reserve evidence remains lifecycle-backed**
   - shows config version,
   - shows run ID,
   - shows lifecycle calculated timestamp.

2. **Pacing evidence remains lifecycle-backed**
   - same as reserve.

3. **GP Economics uses section evidence**
   - shows economics section `configVersion`,
   - shows economics section `calculatedAt`,
   - shows `SOURCE fund_snapshots`,
   - does not use a conflicting lifecycle config version.

4. **Waterfall setup is config-backed**
   - shows `SOURCE fund_config`,
   - shows section config version,
   - shows published timestamp,
   - does not show `RUN UNAVAILABLE`.

5. **Overview is mixed-source**
   - shows mixed-source evidence,
   - does not claim `fund_snapshots` as the only source.

6. **Scenario Analysis remains scenario-specific**
   - generic evidence header is not mounted for scenario section,
   - scenario evidence headers remain visible in scenario summary cards.

7. **Unavailable sections remain visible**
   - evidence does not hide explanatory panels.

### 4.9 PR B validation

Focused:

```bash
cross-env TZ=UTC vitest run tests/unit/components/results/EvidenceHeader.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/pages/fund-model-results.test.tsx --project=client
```

If contract changed:

```bash
cross-env TZ=UTC vitest run tests/unit/contract/fund-results-v1.contract.test.ts --project=server
npm run validate:schema-drift
```

Closeout:

```bash
npm run validate:core
git diff --check
git status --short --branch
```

### 4.10 PR B acceptance criteria

- Every material non-scenario section has truthful evidence or truthful
  mixed-source copy.
- Top-level lifecycle data does not overwrite section-specific evidence.
- Waterfall does not claim a calculation run.
- Overview does not claim a single false source.
- Scenario Analysis continues to use scenario evidence.
- Tests cover available and unavailable states.
- `npm run validate:core` passes.

---

## 5. PR C — R5 Analytics Pilot Under #763

### 5.1 Goal

Run a narrow live analytics pilot on scenario comparison, using contract-backed
data and truthful evidence. The pilot should refine, not redesign, the product.

### 5.2 Scope

In scope:

- Scenario comparison evidence/source bands.
- Cross-set table from PR A.
- Source-config warning and grouping.
- Unsupported comparison visibility.
- Basic labels/captions near data.
- Chart-review checklist applied to this one surface.

Out of scope for first R5 PR:

- `ComparisonBand`
- `SmallMultipleGrid`
- metric×variant matrix mode
- broad chart redesign
- chart-library migration
- driver narratives without contract-backed driver data
- scenario override expansion

### 5.3 Primary files

Modify:

- `client/src/components/fund-results/ScenarioComparisonTable.tsx`
- `client/src/components/fund-results/CrossSetScenarioComparisonTable.tsx`
- `client/src/pages/fund-scenario-workspace.tsx`
- `client/src/pages/fund-model-results.tsx`
- tests for those components/pages

Read before implementation:

- `docs/design/analytics-visualization-principles.md`
- `docs/design/analytics-visualization-rollout.md`

### 5.4 Pilot deliverables

#### Deliverable 1 — Evidence/source bands

Every scenario comparison surface should show:

- scenario set name,
- source config version,
- comparison status,
- staleness,
- calculated timestamp if available,
- baseline source note,
- unsupported reason if unsupported.

#### Deliverable 2 — Cross-set comparison

Reuse PR A behavior:

- all fee-profile variants visible or explicit selector,
- deltas scoped to per-set baseline,
- source-config warnings,
- direction-aware deltas.

#### Deliverable 3 — Honest unsupported states

Unsupported types should remain visible with copy:

- reserve-allocation comparison not supported yet,
- allocation comparison not supported yet,
- sector-profile comparison not supported yet,
- baseline missing,
- scenario results not calculated.

#### Deliverable 4 — Contract dependency list

Add a short implementation note or docs update listing deferred contract
dependencies:

- comparison drivers / assumption-diff data,
- non-fee-profile comparison semantics,
- access-scope evidence field,
- scorecard source summary if not already implemented.

### 5.5 Deferrals

Move these to a follow-up:

- density switch,
- small multiples,
- matrix mode,
- shared-scale chart component,
- assumption-diff rail,
- driver narratives.

Only pull one of these into PR C if fixture data proves the basic grouped
cross-set table is unusable.

### 5.6 Tests for PR C

Focused:

```bash
cross-env TZ=UTC vitest run tests/unit/components/fund-results/ScenarioComparisonTable.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/components/fund-results/CrossSetScenarioComparisonTable.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/pages/fund-scenario-workspace.test.tsx --project=client
cross-env TZ=UTC vitest run tests/unit/pages/fund-model-results.test.tsx --project=client
```

Assertions:

- evidence/source bands visible,
- source config version visible,
- staleness visible,
- unsupported types visible,
- no sample/demo data,
- no driver narrative appears without driver data,
- cross-set table remains source-config honest.

### 5.7 PR C validation

```bash
npm run lint
npm run validate:core
git diff --check
git status --short --branch
```

### 5.8 PR C acceptance criteria

- The pilot improves one live scenario-comparison surface only.
- Every material number has nearby provenance.
- Unsupported/unavailable states remain visible.
- No broad redesign or new charting stack is introduced.
- Deferred contract dependencies are explicitly listed.
- Tests and validation pass.

---

## 6. PR D — Forecast Modes

### 6.1 Goal

Keep the dual-forecast surface truthful about actuals versus forward-looking
forecast values without contaminating scenario contracts.

### 6.2 Scope

In scope:

- Ensure `DualForecastPoint` semantics are enforced:
  - quarter 0 is actual,
  - future quarters are forecast,
  - `current` remains compatibility field.
- Strengthen service, route, hook, and dashboard tests.
- Update labels and captions if needed.

Out of scope:

- scenario contracts,
- new route family,
- new stores,
- new dependencies,
- cohort readiness,
- reserve optimization,
- migrations.

### 6.3 Primary files

Modify if needed:

- `shared/types/dual-forecast.ts`
- `server/services/metrics-aggregator.ts`
- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/hooks/useDualForecast.ts`

Tests:

- `tests/unit/services/metrics-aggregator-dual-forecast.test.ts`
- `tests/unit/routes/dual-forecast-route.test.ts`
- `tests/unit/hooks/useDualForecast.test.tsx`
- `tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx`

### 6.4 Contract semantics

For every `DualForecastPoint`:

- `construction` is always present.
- `current` is always present.
- `actual` is present only for the as-of point.
- `currentMode` is either `actual` or `forecast`.

Quarter 0:

```ts
point.actual !== null;
point.currentMode === 'actual';
point.current === point.actual; // compatibility behavior
```

Future quarters:

```ts
point.actual === null
point.currentMode === 'forecast'
point.current comes from projected metrics
```

### 6.5 Scenario-contract protection

Add/maintain tests that:

- scenario override payloads reject `forecastMode`,
- scenario comparison contract does not include actuals,
- scenario set payloads do not include dual-forecast actual/mode fields.

### 6.6 Dashboard behavior

The dashboard must label:

- Construction Plan,
- Actuals,
- Current Forecast.

It must not use misleading live/real-time language unless a live transport
exists.

Captions should explain:

```text
Construction Plan: original construction forecast.
Actuals: as-of metrics from actual metrics calculator.
Current Forecast: projected future values after actuals.
```

### 6.7 Tests for PR D

Focused:

```bash
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/services/metrics-aggregator-dual-forecast.test.ts tests/unit/routes/dual-forecast-route.test.ts
npx vitest run --config vitest.config.mjs --configLoader native --project=client tests/unit/hooks/useDualForecast.test.tsx tests/unit/components/dashboard/dual-forecast-dashboard.test.tsx
```

Add assertions:

- every point has `currentMode`,
- quarter zero actual is non-null,
- future actuals are null,
- labels distinguish actuals from current forecast,
- old misleading live/real-time labels are absent,
- scenario contracts reject forecast-mode contamination.

### 6.8 PR D validation

```bash
npm run check
npm run lint
npm run test:scenario-release-gate
git diff --check
git status --short --branch
```

Conditional:

```bash
npm run test:integration:routes
```

Only if route behavior changes.

### 6.9 PR D acceptance criteria

- Dual forecast is truthful about as-of actuals and future forecast points.
- Existing route URL and compatibility fields remain intact.
- Scenario contracts remain unchanged.
- Dashboard labels are clear and non-misleading.
- Focused tests and closeout checks pass.

---

## 7. PR E+ — Cohort Promotion Staging

### 7.1 Goal

Prevent unsafe cohort promotion while creating a clear path to eventual
authoritative cohort readiness.

### 7.2 Current status

Cohort is currently experimental. It must not satisfy or block authoritative
fund readiness.

The current cohort worker is not promotion-ready because it still processes mock
companies and does not write authoritative snapshots.

### 7.3 Stage 0 — Preserve experimental status

In scope:

- Keep cohort experimental.
- Add/maintain regression tests proving cohort is excluded from authoritative
  readiness.

Tests:

- `EXPERIMENTAL_ENGINE_KEYS` includes `cohort`.
- `EXPERIMENTAL_SNAPSHOT_TYPES` includes `COHORT`.
- `AUTHORITATIVE_ENGINE_KEYS` equals `['reserve', 'pacing']`.
- `AUTHORITATIVE_SNAPSHOT_TYPES` excludes `COHORT`.
- `RESERVE + COHORT` does not complete a run without `PACING`.

Focused command:

```bash
npx vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/contract/fund-authoritative-calculations.test.ts tests/unit/phase2a/config-invariants.test.ts tests/unit/services/post-calc-trigger.test.ts tests/unit/phase2b/lifecycle-derivation.test.ts tests/unit/phase2a/calc-runs-publish.test.ts
```

### 7.4 Stage 1 — Make cohort output real but experimental

Replace worker mock behavior with real fund-scoped inputs:

- no mock companies,
- load actual fund-scoped companies/investments/lots/taxonomy,
- deterministic analysis,
- schema-validated output,
- clear taxonomy/version attribution,
- preserve route/fund-access guardrails.

Do not yet make cohort authoritative.

### 7.5 Stage 2 — Add fund-results contract support

Add a cohort section only after the payload shape is stable:

```ts
cohort: CohortResultsSectionSchema;
```

The section should support:

- `available`,
- `pending`,
- `unavailable`,
- `failed`.

Available section should include:

- `source: 'fund_snapshots'`,
- `configVersion`,
- `calculatedAt`,
- `payload`,
- taxonomy version,
- cohort definition metadata,
- `legacyEvidence` if relevant.

Do not let cohort affect top-level readiness yet.

### 7.6 Stage 3 — Snapshot writer and backfill plan

Before changing cohort authority:

- implement cohort snapshot writer,
- prove snapshot attribution,
- define which funds need backfilled `COHORT` snapshots,
- define target config versions,
- write idempotent backfill,
- prove existing ready funds do not regress unexpectedly,
- prove calc-run completion semantics with cohort after backfill.

### 7.7 Stage 4 — Authoritative promotion

Only after Stages 1–3:

- change cohort authority to `authoritative`,
- verify `EXPECTED_SNAPSHOT_TYPES` includes `COHORT`,
- update calc-run completion tests,
- update lifecycle derivation tests,
- update fund-results contract tests,
- update UI diagnostics,
- update ADR/docs.

### 7.8 Promotion-stage tests

Required:

- cohort snapshot writer test,
- cohort result-contract schema test,
- backfill idempotency test,
- lifecycle derivation with and without COHORT,
- calc-run completion requiring COHORT after promotion,
- fund-results rendering for cohort available/pending/unavailable/failed,
- regression proving scenario contracts are unaffected.

### 7.9 Cohort closeout validation

```bash
npm run check
npm run lint
npm run test:scenario-release-gate
npm run docs:routing:generate
npm run docs:routing:check
git diff --check
git status --short --branch
```

Conditional:

```bash
npm run calc-gate
```

Only if calculation engine behavior changes beyond metadata.

### 7.10 Cohort acceptance criteria

Cohort is not authoritative until:

- real fund-scoped cohort computation exists,
- snapshots exist,
- fund-results contract support exists,
- backfill exists,
- readiness and completion semantics are re-proven,
- docs/ADR updates exist,
- tests pass.

---

## 8. Combined Risk Register

| Risk                                            | Area  | Mitigation                                                                             |
| ----------------------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| Cross-set deltas use the wrong baseline         | PR A  | Use each set’s own `metricDeltas`; never recompute across sets                         |
| Multiple variants silently omitted              | PR A  | Render all variants or explicit selector with omitted-count copy                       |
| Table becomes unreadable with many columns      | PR A  | >8 variant columns use horizontal scroll/sticky metric column and visible count        |
| One failed comparison breaks all rendering      | PR A  | Prefer `Promise.allSettled`; otherwise document follow-up                              |
| Metric definitions drift from contract          | PR A  | `satisfies Record<ScenarioComparisonMetricKey, MetricDefinition>` plus metric-key test |
| UI implies lower/higher is universally good/bad | PR A  | Direction copy is arithmetic, not investment advice; neutral GP metrics                |
| Evidence header overclaims source               | PR B  | Section-specific evidence wins over lifecycle evidence                                 |
| Scorecard source is over-simplified             | PR B  | Mixed-source copy or small `sourceSummary` contract                                    |
| R5 turns into broad redesign                    | PR C  | Only evidence/source bands + cross-set table in first pilot PR                         |
| Driver explanations use absent data             | PR C  | No driver narrative until contract includes driver/assumption-diff data                |
| Actuals leak into scenario contracts            | PR D  | Add scenario-contract rejection tests                                                  |
| Cohort breaks readiness                         | PR E+ | Keep experimental until snapshots/backfill/result contract proof                       |

---

## 9. Issue / PR Checklist Template

Use this checklist for each PR in the sequence.

### Scope

- [ ] PR maps to exactly one plan phase.
- [ ] Out-of-scope items are explicitly not implemented.
- [ ] No unrelated visual redesign is included.

### Contract truthfulness

- [ ] New UI fields are backed by existing contract fields or a tested contract
      change.
- [ ] No source/access/evidence state is inferred from route shape alone.
- [ ] Unsupported/unavailable states remain visible.

### Scenario-specific guardrails

- [ ] Fee-profile-only comparison boundary is preserved.
- [ ] All fee-profile variants are visible or explicitly selected.
- [ ] Deltas are scoped to each set’s own baseline.
- [ ] Source config differences are labeled.

### Evidence guardrails

- [ ] Section-specific evidence wins over lifecycle evidence.
- [ ] Config-backed sections do not show fake calculation runs.
- [ ] Mixed-source sections are labeled as mixed.

### Forecast/cohort guardrails

- [ ] Forecast actuals are not added to scenario contracts.
- [ ] Cohort remains experimental unless promotion proof is explicitly in scope.

### Tests

- [ ] Targeted unit/component tests added or updated.
- [ ] Contract tests added if a shared schema changes.
- [ ] Error/unavailable paths tested.
- [ ] `git diff --check` passes.

### Validation

- [ ] Focused tests pass.
- [ ] `npm run validate:core` or phase-specific closeout command passes.
- [ ] Docs routing generated/checked if docs changed.
- [ ] Final status is clean or intentionally documented.

---

## 10. Final Definition of Done for the Workstream

The full workstream is complete when:

1. Cross-set scenario comparison renders multiple calculated fee-profile
   scenario sets side-by-side.
2. Every comparable fee-profile variant is visible or explicitly user-selected.
3. Source config versions are visible and cross-source-config warnings render
   when needed.
4. Per-set deltas remain tied to each set’s own authoritative baseline.
5. Direction-aware delta copy is used without misleading universal good/bad
   semantics.
6. Non-comparable scenario sets remain visible as honest status cards.
7. Non-scenario evidence headers are truthful and do not overclaim provenance.
8. R5 analytics pilot stays narrow and contract-backed.
9. Forecast modes remain isolated to the dual-forecast surface.
10. Cohort remains experimental until real snapshots, result-contract support,
    and backfill proof exist.
11. Focused tests, closeout tests, and `npm run validate:core` pass for the
    relevant PRs.
