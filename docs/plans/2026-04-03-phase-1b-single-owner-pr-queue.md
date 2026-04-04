---
last_updated: 2026-04-03
---

# Phase 1B: Dual-Forecast Dashboard Single-Owner PR Queue

## Purpose

This document turns `Phase 1B` into a single-owner execution board with:

- one active implementation lane
- PR-sized slice boundaries
- explicit acceptance criteria
- explicit validation gates
- explicit rollback notes

It assumes `Phase 1A.2` rollout is temporarily blocked on local Docker/runtime
availability and should not hold up deterministic forecasting work.

## Proof-Backed Revision Notes (2026-04-03 Sandbox Synthesis)

The sign-off proof lanes for PR 1, PR 2, and PR 3 produced three important queue
corrections:

1. PR 1 proved that the dead `/model` route story is broader than
   `client/src/config/routes.ts` alone. Stale `/model` metadata still remains in
   `client/src/core/routes/ia.ts`, and dormant internal links still point to
   `/forecasting` and `/scenario-builder` in
   `client/src/components/insights/data-driven-insights.tsx`.
2. PR 2 proved that the active deterministic dashboard slice no longer needs to
   hardcode fund `1`, but repo-level fallback paths still exist: `FundContext`
   can still synthesize `DEMO_FUND.id = 1`, and server-side default-fund
   behavior still exists in `performance-metrics.ts` and `engine-summaries.ts`.
3. PR 3 proved that a narrow comparison contract/service/route already exists at
   `GET /api/funds/:id/results-comparison` and passes integration coverage. The
   queue should therefore validate/narrow/document the current mounted slice
   rather than describe PR 3 as creating a brand-new proof-only route from
   scratch.

## Pre-Signoff Gate And Resume Trigger

This queue is not sign-off ready until:

1. proof artifacts exist for PR 1, PR 2, and PR 3 risk lanes,
2. the queue incorporates any required revisions surfaced by those proofs, and
3. broader production implementation remains deferred beyond the proof slices.

Sign-off on this queue therefore means:

- approve the **overall sequence** only after proof-backed revision,
- keep `Scenario Builder` as an explicit later gate,
- do not treat this as approval for full PR 4 wiring, PR 6 consolidation, or
  broader implementation beyond the proof lanes.

Resume rule:

- once the gating item or prerequisite exposed by the proof work is completed,
  continue planning from the updated repo state rather than from the original
  unrevised queue assumptions.

## Locked Decisions

These decisions are part of the strategy unless a later review explicitly
changes them.

1. Canonical deterministic forecasting surface:
   - `client/src/pages/financial-modeling.tsx`
   - this is the target canonical surface, not yet the truthful routed surface
2. Canonical probabilistic comparison surface:
   - `client/src/pages/sensitivity-analysis.tsx`
3. Legacy deterministic surfaces to narrow or retire after parity:
   - `client/src/pages/forecasting.tsx`
   - `client/src/pages/scenario-builder.tsx`
4. Empty-fund / construction-mode behavior is a non-regression requirement.
   - Existing behavior comes from `server/services/metrics-aggregator.ts` and
     `server/services/projected-metrics-calculator.ts`.
5. `Scenario Builder` must not be silently collapsed into Monte Carlo
   backtesting without an explicit product decision.

## Operating Rules

1. Keep exactly one implementation PR in progress.
2. Prep/spec work is allowed only while the active PR is waiting on review,
   validation, or a product decision.
3. Do not start `1C.2`, full `Phase 3`, or full `Phase 4` from this board.
4. Do not broaden `dashboard-summary` unless the added fields are truly generic.
   Prefer a dedicated forecast comparison read model.
5. Unified metrics remains the authoritative source for actual metrics and
   construction-mode behavior. Any new deterministic forecast route must compose
   from that path and add only narrowly scoped enrichment.
6. If a data source is not trustworthy yet, the UI must hide or relabel the
   feature rather than fabricate it.

## Current Surface Risk Inventory

This queue exists because the repo currently exposes overlapping, partially
truthful modeling surfaces:

- `client/src/pages/financial-modeling.tsx`
- `client/src/pages/forecasting.tsx`
- `client/src/pages/scenario-builder.tsx`
- `client/src/pages/sensitivity-analysis.tsx`

Known current issues:

- `DualForecastDashboard` no longer hardcodes fund `1` in the active proof
  slice, but provider/server-level fund-1 fallbacks still exist and must remain
  explicit queue caveats.
- `/forecasting` still uses a default fund and synthetic forecast generation.
- `ConstructionActualComparison` still renders sample data.
- `financial-modeling` still contains placeholder KPI cards and charts.
- `financial-modeling`, `forecasting`, and `scenario-builder` are not mounted in
  the current routed app shell, but stale route maps still point them to a dead
  `/model` target.
- internal links still reference `/forecasting` and `/scenario-builder`, so the
  perimeter is inconsistent even though the active sidebar hides those entries.
- stale route-story metadata in `client/src/core/routes/ia.ts` still maps
  deterministic surfaces to `/model`.
- the comparison read-model route already exists and is mounted at
  `/api/funds/:id/results-comparison`, so PR 3 is a validation/narrowing task,
  not a pure greenfield spike.
- `analytics` remains visibly sample-heavy near adjacent forecasting surfaces.

## PR Queue

### PR 1: Canonical Surface Decision And Perimeter Freeze

Status: `[ ] Ready`

Goal:

- freeze which modeling/comparison surfaces are canonical
- clean the stale deterministic-surface perimeter
- avoid doing deeper data work against dead or inconsistent route semantics

Primary write scope:

- `client/src/App.tsx`
- `client/src/config/routes.ts`
- `client/src/components/LegacyRouteRedirector.tsx`
- `client/src/components/insights/data-driven-insights.tsx`
- `client/src/core/routes/ia.ts`
- `client/src/components/layout/navigation-config.ts` only if labels or route
  ownership notes need tightening
- this plan doc and, if useful, the parent roadmap

Checklist:

- [ ] inventory `financial-modeling`, `forecasting`, `scenario-builder`, and
      `sensitivity-analysis`
- [ ] mark each surface as `canonical`, `legacy`, `redirect`, `hide`, or
      `deprecate`
- [ ] make route/perimeter behavior explicit: - remove or correct dead `/model`
      mappings - clear stale `/model` route-story metadata in
      `client/src/core/routes/ia.ts` - remove or relabel dangling internal links
      to legacy deterministic pages - keep only intentional deep links alive
- [ ] document deterministic vs probabilistic surface responsibilities
- [ ] decide whether `financial-modeling` remains an unmounted canonical target
      until PR 4 or is re-mounted earlier behind truthful perimeter behavior
- [ ] link this queue from the parent roadmap

Acceptance criteria:

- one canonical deterministic forecasting surface is named
- one canonical probabilistic comparison surface is named
- stale route maps no longer imply a working `/model` destination
- stale route-story metadata no longer implies `/financial-modeling` or
  `/forecasting` resolve through a live `/model` surface
- internal links no longer route users into dead or accidental deterministic
  surfaces
- no route is removed yet unless it is truly dead and unreferenced

Validation:

- `npm run check`
- route/perimeter smoke check in the app shell
- add or update a small route-focused client test if redirects or archived
  behavior change
- keep the focused legacy-route-map proof coverage that enumerates current
  `/model`-mapped deterministic surfaces and their final disposition
- run `npm test` before merge because this PR touches route/perimeter behavior

Rollback notes:

- restore prior redirect/perimeter behavior only
- keep the docs and surface decisions unless the decision itself is wrong

Out of scope:

- backend contracts
- forecast data changes
- comparison widget changes

Suggested PR title:

- `chore(modeling): freeze deterministic surface perimeter and route semantics`

### PR 2: Active-Fund Scoping And Truthful Empty States

Status: `[ ] Ready`

Goal:

- remove hardcoded fund defaults from the deterministic forecast path
- make missing active-fund context explicit instead of silently using fund `1`

Primary write scope:

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/pages/financial-modeling.tsx`
- `client/src/pages/forecasting.tsx` if it remains reachable after PR 1

Checklist:

- [ ] remove `/api/dashboard-summary/1`
- [ ] remove `/api/fund-metrics/1`
- [ ] remove `DEFAULT_FUND` / `fundId || 1` behavior on active deterministic
      surfaces
- [ ] use `FundContext` consistently
- [ ] add truthful blocked or empty states when no fund is active
- [ ] record whether `FundContext` demo fallback (`DEMO_FUND.id = 1`) is an
      allowed non-production behavior, a gated caveat, or a blocker before
      sign-off
- [ ] inspect server-side default-fund behavior in
      `server/routes/performance-metrics.ts` and
      `server/routes/engine-summaries.ts`; either prove those routes are out of
      scope for the active deterministic path or carry them forward as explicit
      caveats/blockers

Implementation note (2026-04-03 tranche execution):

- `FundContext` demo fallback is being resolved now for the active deterministic
  path so the surface does not silently synthesize fund `1`.
- `server/routes/performance-metrics.ts` and `server/routes/engine-summaries.ts`
  still contain default-fund behavior, but they are quarantined as
  non-production-only / out-of-scope for this PR2 tranche because the active
  deterministic surface does not consume them.

Acceptance criteria:

- no active `1B` surface fetches fund `1` by default
- missing active-fund context produces a truthful UI state
- no hidden fallback keeps the old fund-1 behavior alive
- the queue explicitly distinguishes active-surface proof completion from any
  remaining provider/server-level fallback paths that still need separate
  treatment

Validation:

- `npm run check`
- add targeted client tests with mocked `FundContext`
- verify at least:
  - active fund fetches the correct route
  - missing fund does not fetch a hardcoded route
  - error state still renders cleanly
- inspect and document provider/server-level default-fund backdoors even if they
  remain out of scope for the proof slice

Rollback notes:

- revert query and context wiring only
- do not roll back PR 1 surface decisions unless scoping changes force it

Out of scope:

- new backend routes
- current-forecast math cleanup

Suggested PR title:

- `refactor(modeling): scope deterministic forecast surfaces to active fund`

### PR 3: Forecast Comparison Read Contract Validation And Narrowing

Status: `[ ] Ready`

Goal:

- validate and narrow the existing backend comparison contract for deterministic
  forecast rendering
- avoid growing unrelated summary routes into a second ad hoc forecast API
- avoid treating the currently mounted route as an automatic live-surface
  commitment before sign-off

Primary write scope:

- `shared/contracts/fund-results-comparison-v1.contract.ts`
- `server/services/fund-results-comparison-service.ts`
- the mounted route in `server/routes/fund-config.ts`
- focused integration tests for the comparison route
- optional client hook for consuming the route

Recommended contract fields:

- fund summary
- mode: `construction` | `live`
- actual metrics summary
- deterministic forecast summary
- forecast time series used by the UI
- fund-level comparison groups for construction-vs-actual v1
- provenance metadata per section
- capability flags for drift visibility

Checklist:

- [ ] decide authoritative sources for: - current actual metrics - construction
      forecast - current forecast - construction-vs-actual comparison inputs
- [ ] resolve the `Scenario Builder` product decision before finalizing the
      contract shape, so deterministic scenario comparison is either explicitly
      in scope or explicitly deferred
- [ ] validate the current mounted route/contract against proof criteria before
      treating it as the Phase `1B` answer
- [ ] document the mismatch between “proof-only spike” intent and the current
      repo reality that the route already exists in the mounted runtime
- [ ] keep any further narrowing or shape changes non-expansive; do not widen it
      into a broader live-surface contract before sign-off
- [ ] add or adjust shared typing only if needed to tighten the existing shape
- [ ] do not overload `dashboard-summary` unless the new field is truly generic
- [ ] compose from unified metrics as the authoritative source for actual
      metrics and construction-mode behavior
- [ ] add only minimal comparison-specific enrichment that unified metrics does
      not already expose
- [ ] keep construction-vs-actual comparison at fund level only in v1

Acceptance criteria:

- deterministic forecasting no longer depends on unrelated generic routes for
  missing forecast fields
- the validated route remains a thin composition layer over persisted sources
  plus narrowly scoped enrichment, not a parallel aggregation stack
- the returned payload makes provenance explicit enough to gate drift and
  construction-mode UI
- the route has truthful no-data and not-found behavior
- the queue explicitly records that this route already exists and that broader
  client surfacing remains out of scope until later sign-off

Validation:

- `npm run check`
- run focused integration coverage for
  `tests/integration/fund-results-comparison-route.test.ts`
- add unit tests for empty-fund construction mode and no-data mode
- run `npm test` before merge if shared test fixtures or route wiring change

Rollback notes:

- revert only any proof-driven narrowing or test changes
- do not introduce new client consumers here
- if the current mounted route shape is unacceptable, revise the queue instead
  of silently expanding implementation scope

Out of scope:

- UI migration
- redirecting old routes

Suggested PR title:

- `refactor(modeling): validate existing forecast comparison contract for sign-off`

### PR 4: Canonical Financial Modeling Wiring

Status: `[ ] Ready`

Goal:

- make the `financial-modeling` forecast tab truthful end-to-end using the
  contract from PR 3

Primary write scope:

- `client/src/components/dashboard/dual-forecast-dashboard.tsx`
- `client/src/pages/financial-modeling.tsx`
- optional client hook from PR 3

Checklist:

- [ ] treat this as a surface build, not a wiring-only pass
- [ ] replace placeholder KPI cards, placeholder charts, and hardcoded
      scenario/modeling values on the canonical forecast path
- [ ] mount or re-enable the canonical deterministic surface intentionally if PR
      1 left it as a documented target rather than a live route
- [ ] wire loading, error, no-data, and construction-mode states explicitly
- [ ] preserve existing construction-view messaging when the fund has no
      investments
- [ ] remove or relabel KPI cards that remain hardcoded on the canonical surface

Acceptance criteria:

- the forecast tab uses the canonical contract rather than synthetic series
- empty funds still render a construction-mode experience
- hardcoded values are removed from the canonical surface
- route/perimeter behavior for the canonical deterministic surface is explicit
  and intentional
- if current forecast is not trustworthy yet, it is hidden or clearly deferred

Validation:

- `npm run check`
- component tests for:
  - construction mode
  - live mode
  - loading state
  - missing fund / no-data state
- run `npm test` before merge because this PR changes a canonical routed surface
  and likely adds shared client test fixtures

Rollback notes:

- revert only the canonical-surface consumer wiring
- keep PR 3 contract in place unless it is itself defective

Out of scope:

- legacy route consolidation
- comparison/drift widget migration

Suggested PR title:

- `feat(modeling): render canonical financial modeling forecast from real data`

### PR 5: Fund-Level Construction-Vs-Actual Comparison And Drift V1

Status: `[ ] Ready`

Goal:

- replace sample comparison rows with real data
- expose drift only where provenance is stable
- ship a truthful fund-level comparison first; defer round/stage/valuation
  breakdowns

Primary write scope:

- `client/src/components/forecasting/construction-actual-comparison.tsx`
- `client/src/components/forecasting/projected-performance.tsx` if still live
- `client/src/pages/forecasting.tsx` if still live
- the comparison-capable parts of the PR 3 contract

Checklist:

- [ ] remove all baked-in comparison arrays from the component
- [ ] drive rows from canonical backend data
- [ ] narrow the widget to fund-level metrics that the backend can truthfully
      provide in v1
- [ ] define drift only for metrics marked drift-capable by the server
- [ ] hide drift where the baseline or forecast source is not stable
- [ ] render truthful unavailable states instead of zeros or placeholders
- [ ] explicitly defer round-level, entry-stage, and valuation-tier comparison
      breakdowns to later analytics work

Acceptance criteria:

- no sample comparison rows remain on any live surface
- the shipped comparison is fund-level only unless a later approved contract
  adds truthful lower-level aggregation
- drift is shown only when its numerator/denominator/source are stable
- the comparison widget behaves correctly in both construction and live modes

Validation:

- `npm run check`
- component tests for:
  - populated comparison data
  - unavailable comparison data
  - drift hidden when capability flag is false
- route/service tests for comparison payload shape

Rollback notes:

- revert the comparison component and any comparison-specific contract fields
- keep the rest of PR 3 and PR 4 intact if still valid

Out of scope:

- route redirects
- analytics cleanup

Suggested PR title:

- `refactor(modeling): make construction-vs-actual comparison fund-backed at fund level`

### PR 6: Route Consolidation

Status: `[ ] Ready`

Goal:

- collapse legacy deterministic routes only after the canonical surface is
  truthful

Primary write scope:

- `client/src/pages/forecasting.tsx`
- `client/src/pages/scenario-builder.tsx`
- `client/src/config/navigation.ts`
- `client/src/config/routes.ts`
- `client/src/App.tsx`

Checklist:

- [ ] redirect `/forecasting` to `/financial-modeling` if parity is reached
- [ ] decide whether `scenario-builder` redirects, stays mounted but deprecated,
      or remains as a distinct deterministic authoring tool
- [ ] update navigation to match the final surface story
- [ ] preserve deep-link behavior intentionally

Acceptance criteria:

- one truthful deterministic entry path exists
- one truthful Monte Carlo entry path exists
- route behavior is explicit rather than accidental
- no “zombie” nav entry points remain

Validation:

- `npm run check`
- route tests for redirects or deprecation behavior
- manual smoke check of deep links

Rollback notes:

- restore prior route mounts and navigation entries
- keep the canonical financial-modeling improvements from earlier PRs

Out of scope:

- full Monte Carlo comparison expansion
- analytics cleanup

Suggested PR title:

- `refactor(routes): consolidate deterministic forecasting entry points`

### PR 7: Adjacent Truthfulness Cleanup

Status: `[ ] Ready`

Goal:

- remove or relabel nearby sample-heavy panels that would undermine the new
  truthful surface

Primary write scope:

- `client/src/pages/financial-modeling.tsx`
- `client/src/pages/analytics.tsx`

Checklist:

- [ ] remove or relabel placeholder charts on `financial-modeling`
- [ ] remove or relabel hardcoded KPI cards adjacent to the shipped forecast tab
- [ ] eliminate `currentFund?.id || 1` behavior on still-visible adjacent charts
- [ ] do not expand into full `Phase 4` analytics replacement

Acceptance criteria:

- no adjacent live-looking panel still presents obvious sample numbers as real
- any remaining sample-only area is clearly marked or hidden
- the canonical deterministic surface is not visually undermined by nearby fake
  metrics

Validation:

- `npm run check`
- light component tests where useful
- manual smoke pass across `financial-modeling` and `analytics`

Rollback notes:

- restore labels/placeholders if needed
- do not roll back canonical forecast data wiring

Out of scope:

- MOIC adapter work
- IRR unification
- full analytics rewrite

Suggested PR title:

- `chore(modeling): remove misleading placeholder forecasting and analytics panels`

## Dependency Graph

- PR 1 -> should land before PR 4 and PR 6
- PR 2 -> should land before PR 4
- PR 3 -> required before PR 4 and PR 5
- PR 4 -> should land before PR 6
- PR 5 -> can land before or after PR 4 only if PR 3 already exists and the live
  comparison surface has a decided home
- PR 7 -> last

Recommended merge order:

1. PR 1
2. PR 2
3. PR 3
4. PR 4
5. PR 5
6. PR 6
7. PR 7

## Validation Matrix

For every PR:

- run `npm run check`
- run the smallest relevant targeted test set
- add new tests for any new state or route contract introduced

Targeted validation by PR:

- PR 1:
  - route/perimeter smoke checks
  - `npm test`
- PR 2:
  - client tests with mocked `FundContext`
- PR 3:
  - route integration test for the new forecast comparison route
  - `npm test` if shared fixtures or route wiring change
- PR 4:
  - component tests for construction mode, live mode, and missing-fund behavior
  - `npm test`
- PR 5:
  - component tests for comparison data and drift visibility
- PR 6:
  - redirect/deprecation route tests
- PR 7:
  - smoke validation for nearby panels and labels

## Narrowing Rules

If implementation reality contradicts the ideal `1B` scope, narrow the shipped
feature instead of faking missing parts.

Examples:

- if there is no trustworthy current-forecast source, ship actual +
  construction-mode only and defer current-forecast drift
- if the backend cannot truthfully provide round-level comparison data, ship
  fund-level comparison only and defer lower-level breakdowns
- if deterministic scenario authoring is still materially different from Monte
  Carlo backtesting, keep `Scenario Builder` distinct and deprecated rather than
  redirecting it prematurely
- if adjacent analytics cards remain sample-only, hide or relabel them instead
  of leaving them visually “live”

## Rollback Strategy

Global rollback rule:

- prefer reverting the newest PR only
- do not unwind earlier canonical-surface and data-contract decisions unless the
  newer PR depends on them being wrong

Safe rollback anchors:

- PR 1: nav/perimeter only
- PR 2: client fund scoping only
- PR 3: dedicated route/service/contract only
- PR 4: canonical surface consumer only
- PR 5: comparison widget only
- PR 6: redirects/navigation only
- PR 7: labels/placeholders only

## Non-Implementation Lanes

These may progress only when they do not interrupt the active `1B` PR.

### Phase 0.5 Prep

- restore contract alignment
- snapshot lifecycle contract
- zero-snapshot bootstrap definition

### Phase 1A.2 Ops Checklist

- deploy behind `ALLOW_METRIC_FALLBACK=1`
- run scoped backfill
- manually promote any needed default baselines
- remove the flag
- rerun the Docker-backed migrated Postgres suite when container runtime is
  available

### Phase 4 Prep Only

- inventory non-canonical IRR paths
- define golden coverage before any consolidation refactor

## Exit Criteria For Closing Phase 1B

- one canonical deterministic forecasting surface is live and truthful
- one canonical probabilistic comparison surface is live and truthful
- no active deterministic surface silently falls back to fund `1`
- empty-fund construction-mode behavior is preserved
- construction-vs-actual comparison is fund-backed or explicitly unavailable
- drift is shown only where provenance is stable
- duplicate legacy deterministic route exposure is removed or clearly deprecated
- adjacent live-looking placeholder panels no longer undermine the surface
