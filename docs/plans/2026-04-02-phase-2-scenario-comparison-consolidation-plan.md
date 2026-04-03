---
last_updated: 2026-04-03
---

# Phase 2: Scenario Comparison Consolidation Plan

Date: `2026-04-02` Owner: Codex Status: Implemented through Slice `2` runtime
cleanup; Slice `3` and Slice `4` remain

## Goal

Phase 2 should leave the product with one real comparison workflow instead of
multiple half-live surfaces:

1. one routed comparison workspace
2. one fund-backed comparison backend
3. one truthful test story
4. no dead hooks or dormant contracts pretending saved comparison CRUD exists

## Recommendation

Use the existing backtesting stack as the canonical comparison backend and wire
it into a real `/sensitivity-analysis` product surface.

Be explicit about scope: Phase 2 delivers the first truthful tab in that
workspace, not full sensitivity parity. The initial shipped surface should be
framed as `Monte Carlo Backtesting` inside the broader sensitivity-analysis
workspace, with the other sample tabs either removed or shown as clearly
non-functional placeholders for later phases.

Do not expand the dormant `scenario_comparisons` path. Archive or delete the
ephemeral comparison route, dead client hooks, and unused persisted comparison
wrappers instead of building a second comparison system in parallel.

## Sandbox Validation Update (`2026-04-03`)

Validated against the current routed implementation and focused backtesting
tests.

Confirmed complete:

- Slice `0`: `/sensitivity-analysis` is the mounted canonical surface, the stale
  legacy map entry is gone, and route-governance/perimeter updates landed.
- Slice `1a-routing`: `/sensitivity-analysis` is routed in `client/src/App.tsx`
  and surfaced in current navigation.
- Slice `1a-lifecycle`: `useBacktestLifecycle(fundId)` now fences resumed jobs
  by fund and the async job-status contract exposes `fundId`.
- Slice `1b`: the routed sensitivity surface now renders a shared
  `BacktestingWorkspace`, with Monte Carlo as the live tab and the other tabs
  clearly marked `Coming soon`.
- Slice `2` runtime cleanup: the old mounted scenario-comparison route, page,
  hook, service, shared type/schema bundle, and dead comparison-tool UI/test
  files have been removed from the live runtime.
- structured partial scenario-failure metadata now persists with
  `BacktestResult` / history responses instead of only appearing as live-run
  recommendation text.

Confirmed still open:

- Slice `3` must cover the full dormant saved-comparison schema family, not only
  `scenario_comparisons`.
- Slice `4` needs a deterministic rewrite of the backtesting integration suite,
  not just an un-quarantine toggle.

## Audit Findings

### 1. The mounted scenario-comparison API is not the same thing as the client contract around it

- `server/routes.ts` mounts `server/routes/scenario-comparison.ts`.
- `server/routes/scenario-comparison.ts` only implements:
  - `POST /api/portfolio/comparisons`
  - `GET /api/portfolio/comparisons/:comparisonId`
- the route is gated by `ENABLE_SCENARIO_COMPARISON` and returns `501` when the
  env flag is off.
- `client/src/hooks/useScenarioComparison.ts` assumes many endpoints that do not
  exist:
  - list comparisons
  - delete comparison
  - export comparison
  - saved config CRUD
  - access tracking
- only `useCreateComparison()` is used, and it is used only by
  `client/src/pages/ScenarioComparison.tsx`.

Implication:

- the mounted route is a narrow, ephemeral Redis-backed MVP
- the client hook file models a much larger saved-comparison product that was
  never implemented

### 2. The scenario comparison page exists but is not routed

- `client/src/pages/ScenarioComparison.tsx` exists.
- `client/src/App.tsx` does not route `ScenarioComparisonPage`.
- `ScenarioComparisonPage` is therefore unreachable in the current app.

Implication:

- there is no active user-facing scenario comparison page today even though the
  route and hook code exist

### 3. The original sensitivity-analysis page was sample-only, but the routed surface now wraps the live Monte Carlo page

- the old sample component at
  `client/src/components/sensitivity/sensitivity-analysis.tsx` is still
  sample-only:
  - hardcoded independent/dependent variable arrays
  - synthetic data generation
  - simulated `setTimeout` runs
  - no fund-backed API reads
- but `client/src/pages/sensitivity-analysis.tsx` is now routed and currently
  renders the live Monte Carlo page as a thin wrapper

Implication:

- the product surface is now live, and Slice `1b` has since replaced the thin
  wrapper with a canonical shared workspace

### 4. The strongest live comparison backend already exists in backtesting

- `server/routes/backtesting.ts` is mounted and live.
- `server/services/backtesting-service.ts` already supports:
  - fund-backed backtest execution
  - historical-scenario comparisons via `compareScenarios(...)`
  - persisted backtest history
  - async job handling through the queue layer
- `client/src/hooks/useBacktesting.ts` already supports:
  - async run
  - job polling
  - result fetch
  - history
  - scenario comparison
- `client/src/pages/monte-carlo.tsx` already renders:
  - history
  - result summaries
  - scenario comparison results

But:

- `client/src/App.tsx` still does not route `/monte-carlo`
- the Monte Carlo page is now active only through `/sensitivity-analysis`, not
  as its own route

Implication:

- Phase 2 should reuse this stack instead of inventing a second comparison
  backend

### 5. The persisted `scenario_comparisons` layer is dormant

- `shared/schema.ts` defines a large `scenario_comparisons` table.
- `server/services/portfolio-intelligence-service.ts` has a thin
  `comparisons.create/getById` wrapper around it.
- no active route reads or writes this table for end-user comparison flows.

Implication:

- the table is schema debt, not an active product capability
- Phase 2 must decide whether to make it real or delete/archive it

### 6. Not all “comparison” surfaces are the same product

The repo currently has at least four distinct comparison concepts:

1. `client/src/pages/ScenarioComparison.tsx`
   - ephemeral side-by-side scenario comparison over scenario cases
2. `client/src/pages/monte-carlo.tsx`
   - historical market scenario comparison in backtesting
3. `client/src/pages/fund-model-results.tsx`
   - published-version comparison via `/api/funds/:id/results-comparison`
4. `client/src/components/modeling-wizard/steps/ScenariosStep.tsx`
   - local in-wizard what-if comparison using
     `client/src/lib/scenario-calculations.ts`

Implication:

- Phase 2 should consolidate only the overlapping scenario-analysis surfaces
- it should not collapse the active fund-results version comparison read model
- it should not turn the local wizard comparison helper into a server product by
  accident

### 7. The tests are split between truthful, stale, and quarantined layers

Truthy:

- `tests/unit/routes/scenario-comparison-api.test.ts` matches the mounted MVP
  route
- `tests/unit/services/backtesting-service.test.ts` covers live comparison logic

Quarantined but directionally relevant:

- `tests/integration/backtesting-api.test.ts`
- `tests/integration/scenario-comparison-mvp.test.ts`

Stale / mismatched:

- `tests/integration/scenario-comparison.test.ts` expects list/export/config
  endpoints that the mounted route does not implement

Implication:

- Phase 2 should revive backtesting integration coverage
- stale scenario-comparison integration expectations should be archived or
  rewritten, not blindly un-quarantined

### 8. Routing `/sensitivity-analysis` touched governance and perimeter controls, not just the page

- `client/src/App.tsx` is not the only source of truth for mounted surfaces.
- `client/src/app/route-governance-registry.ts` derives governed routes from
  `APP_ROUTES`.
- `tests/unit/app/route-governance-registry.test.tsx` asserts the governed
  perimeter.
- `tests/unit/app/route-perimeter-governance.test.tsx` currently treats
  `/monte-carlo` as intentionally dead and would need deliberate updates if the
  Phase 2 surface changes.
- `client/src/components/layout/navigation-config.ts` is the current sidebar
  source of truth, not the older `client/src/config/navigation.ts`.

Implication:

- Slice `1a` was correct to include route-governance and navigation updates
- the remaining plan should treat that work as complete instead of restating it
  as future scope

### 9. The async resume contract needed a fund fence and now has one, but persisted result truth is still incomplete

- `client/src/hooks/useBacktesting.ts` still reads `?jobId=` globally from the
  URL, but now rejects resumed jobs whose `fundId` does not match the selected
  fund.
- `BacktestJobStatusResponse` now exposes `fundId` to the client.
- `BacktestResult` still does not persist structured partial-failure metadata
  for historical scenario comparison.

Implication:

- Slice `1a-lifecycle` is complete for live-run fencing
- if Phase 2 wants history and result fetches to be fully truthful about partial
  scenario completion, Slice `4` or a small follow-on contract slice must
  persist that metadata

## Phase 2 Decision

### Canonical surface

`/sensitivity-analysis`

Initial truthful slice:

- `Monte Carlo Backtesting` as the first real tab inside the sensitivity
  workspace
- no claim that Phase 2 ships full one-way, two-way, and stress-test analysis
- if placeholder tabs remain visible, they should be labeled `Coming soon`

### Canonical backend

`/api/backtesting/*`, especially:

- `POST /api/backtesting/run/async`
- `GET /api/backtesting/jobs/:jobId`
- `GET /api/backtesting/result/:backtestId`
- `GET /api/backtesting/fund/:fundId/history`
- `POST /api/backtesting/compare-scenarios`
- `GET /api/backtesting/scenarios`

### Retired / archived path

The env-gated scenario-comparison MVP path:

- `server/routes/scenario-comparison.ts`
- `server/services/comparison-service.ts`
- `client/src/pages/ScenarioComparison.tsx`
- `client/src/hooks/useScenarioComparison.ts`
- `shared/types/scenario-comparison.ts`
- `shared/schemas/comparison-tool.schemas.ts`

### Explicit non-goals

Phase 2 should not:

- rebuild saved comparison CRUD on top of `scenario_comparisons`
- merge fund-results version comparison into scenario analysis
- change the wizard-local scenario calculator into a persisted backend product

## Delivery Strategy

### Slice 0: Lock The Surface And Delete Ambiguity

Status: completed in sandbox implementation on `2026-04-03`

Goal:

- make the routing and ownership decision explicit before touching UI

Work:

- declare `/sensitivity-analysis` as the only routed scenario-analysis surface
- decide whether it is governed as `core-live` or `internal-live`
- decide whether `/monte-carlo` becomes:
  - a redirect to `/sensitivity-analysis`, or
  - removed if never exposed
- explicitly mark the old scenario-comparison MVP as deprecated runtime debt
- confirm `client/src/components/LegacyRouteRedirector.tsx` is not mounted in
  the current runtime
- remove the stale `/sensitivity-analysis` entry from
  `client/src/config/routes.ts` before the route becomes live so a future
  reintroduction of `LegacyRouteRedirector` cannot hijack the canonical surface

Files likely touched:

- `docs/plans/2026-03-31-variance-roadmap-revision.md`
- `docs/adr/ADR-013-scenario-comparison-activation.md`
- this Phase 2 plan doc

Acceptance:

- roadmap and ADR no longer claim the old route is merely “awaiting activation”
- the canonical Phase 2 surface is documented once
- route-governance expectations are decided before `APP_ROUTES` changes
- the legacy route map no longer redirects `/sensitivity-analysis`

### Slice 1a-routing: Mount The Canonical `/sensitivity-analysis` Surface

Status: completed in sandbox implementation on `2026-04-03`

Goal:

- ship a working routed page quickly by exposing the existing fund-backed Monte
  Carlo workspace under the canonical Phase 2 URL without coupling that work to
  async lifecycle contract changes

Work:

- add a protected `/sensitivity-analysis` route in `client/src/App.tsx`
- expose it intentionally in the current sidebar/navigation model
- have `client/src/pages/sensitivity-analysis.tsx` render the existing Monte
  Carlo workflow directly or through a very thin wrapper
- update the route-governance and route-perimeter expectations that derive from
  `APP_ROUTES`
- keep `client/src/pages/monte-carlo.tsx` in place during this slice as the
  extraction source and regression fallback

Recommended cut:

- keep the route name `/sensitivity-analysis`
- keep the page headline honest: `Monte Carlo Backtesting`
- if a tab bar is shown, only the Monte Carlo tab is live in this slice
- do not start by extracting the whole workspace into a new shared component

Required UX in the first truthful version:

- run backtests asynchronously
- poll and display progress
- show result summary/history
- show historical-scenario comparisons
- show available scenario names from the backend
- allow fund-scoped execution from the routed page
- keep `/monte-carlo` out of the mounted runtime perimeter during this slice

Files likely touched:

- `client/src/App.tsx`
- `client/src/pages/sensitivity-analysis.tsx`
- `client/src/pages/monte-carlo.tsx`
- `client/src/components/layout/navigation-config.ts`
- `client/src/config/routes.ts`
- `client/src/app/route-governance-registry.ts`
- sidebar/navigation files if surfacing the route in current navigation
- `tests/unit/app/route-governance-registry.test.tsx`
- `tests/unit/app/route-perimeter-governance.test.tsx`
- `tests/unit/components/layout/sidebar-navigation.test.tsx`

Acceptance:

- a logged-in user can navigate to `/sensitivity-analysis`
- the page reads real data from `/api/backtesting/*`
- no sample-only `setTimeout`-driven “analysis” remains on the canonical route
- the routed page is explicitly framed as Monte Carlo backtesting, not full
  sensitivity parity
- `/monte-carlo` remains an unrouted source file, not a second live entrypoint
- route-governance tests and runtime perimeter tests are updated intentionally
  rather than failing incidentally

### Slice 1a-lifecycle: Fence Async Resume And Surface Partial Scenario Failure

Status: completed for live-run/job-status behavior on `2026-04-03`

Goal:

- harden the routed workspace so fund changes and resumed async jobs do not leak
  stale state across funds

Work:

- fix `client/src/hooks/useBacktesting.ts` so `useBacktestLifecycle(fundId)`
  actually fences lifecycle state by fund instead of ignoring the parameter
- expose enough job identity in the async status contract to reject or clear a
  resumed `jobId` that belongs to a different fund
- surface partial scenario-comparison failures from
  `server/services/backtesting-service.ts` so the routed page does not silently
  imply all requested scenarios succeeded

Files likely touched:

- `client/src/hooks/useBacktesting.ts`
- `server/services/backtesting-service.ts`
- `server/routes/backtesting.ts`
- `server/queues/backtesting-queue.ts`
- `shared/types/backtesting.ts`
- validation/response contracts if partial failure metadata is exposed
- focused hook/service tests for backtesting lifecycle behavior

Acceptance:

- switching funds does not leak or resume stale backtest lifecycle state from a
  different fund
- the async resume flow can prove the active job belongs to the selected fund
- the routed page discloses when requested historical scenarios only partially
  complete

Open note:

- this slice does not yet make historical result fetches or backtest history
  rows structurally disclose partial scenario failure; that contract work
  remains open even though live-run disclosure is in place

### Slice 1b: Extract A Shared Backtesting Workspace

Status: completed in sandbox implementation on `2026-04-03`

Goal:

- reduce duplication now that the truthful routed page is already working

Work:

- extract reusable UI from `client/src/pages/monte-carlo.tsx` into a shared
  component such as `client/src/components/backtesting/BacktestingWorkspace.tsx`
- have `client/src/pages/sensitivity-analysis.tsx` render that shared workspace
- decide whether `client/src/pages/monte-carlo.tsx` becomes:
  - a redirect to `/sensitivity-analysis`, or
  - an archived source file removed after equivalence is verified
- if desired for product framing, add a tab shell to the sensitivity workspace
  with non-live tabs clearly marked `Coming soon`

Important:

- treat this as a real refactor, not as a follow-up rename
- do not delete `client/src/pages/monte-carlo.tsx` until the shared workspace is
  verified by tests/build and manual parity checks

Files likely touched:

- `client/src/pages/sensitivity-analysis.tsx`
- `client/src/pages/monte-carlo.tsx`
- new shared backtesting workspace component(s)
- supporting files under `client/src/components/monte-carlo/`

Acceptance:

- `/sensitivity-analysis` and the extracted workspace render the same real
  backtesting capability
- the repo no longer carries two independent implementations of the same Monte
  Carlo workspace
- any remaining placeholder tabs are clearly non-functional and labeled as such

### Slice 2: Remove The Dead Scenario Comparison Product Shell

Status: completed for runtime cleanup on `2026-04-03`

Goal:

- stop carrying a second, inconsistent comparison product

Work:

- remove `ScenarioComparisonPage`
- remove or drastically narrow `useScenarioComparison.ts`
- remove dead hook methods for list/export/config/access if the file survives
- remove the mounted `server/routes/scenario-comparison.ts` route
- remove `server/services/comparison-service.ts`
- remove dead comparison-tool UI pieces that only serve the unrouted page:
  - `client/src/components/comparison-tool/ScenarioSelector.tsx`
  - `client/src/components/comparison-tool/ComparisonDeltaTable.tsx`
  - `client/src/components/comparison-tool/index.ts`
  - `client/src/components/comparison-tool/__tests__/ScenarioSelector.test.tsx`
  - `client/src/components/comparison-tool/__tests__/ComparisonDeltaTable.test.tsx`
- archive the stale shared scenario-comparison type/schema bundle if it no
  longer has runtime consumers
- archive/remove stale fixtures and tests tied only to the retired runtime:
  - `tests/fixtures/scenario-comparison-fixtures.ts`
  - `tests/unit/services/comparison-service.test.ts`

Important:

- do not remove the modeling-wizard local scenario calculator
- do not remove fund-results version comparison
- do not describe this blast radius as “zero”; the route is still mounted and
  still has active tests, so remove it as a deliberate cleanup slice
- removing the mounted route means removing or rewriting its active unit tests,
  not just deleting runtime files

Files likely touched:

- `server/routes.ts`
- `server/routes/scenario-comparison.ts`
- `server/services/comparison-service.ts`
- `client/src/pages/ScenarioComparison.tsx`
- `client/src/hooks/useScenarioComparison.ts`
- `client/src/components/comparison-tool/*`
- `shared/types/scenario-comparison.ts`
- `shared/schemas/comparison-tool.schemas.ts`
- `tests/fixtures/scenario-comparison-fixtures.ts`
- `tests/unit/services/comparison-service.test.ts`
- `tests/unit/routes/scenario-comparison-api.test.ts`

Acceptance:

- there is no mounted comparison API that lacks a routed consumer
- there is no client hook targeting nonexistent saved-config endpoints

### Slice 3: Resolve The Dormant `scenario_comparisons` Schema Layer

Goal:

- finish the keep-or-delete decision instead of leaving the DB contract in limbo

Recommendation:

- delete/archive the dormant saved-comparison runtime layer rather than making
  it real in Phase 2

Implementation sequence:

1. confirm no active route or UI still depends on:
   - `scenario_comparisons`
   - `comparison_configurations`
   - `comparison_access_history`
2. remove `portfolioIntelligenceService.comparisons` wrappers if unused
3. decide whether the configuration/access-history tables are dropped with the
   same migration set or placed on a short deprecation path
4. decide migration timing

Migration recommendation:

- Phase 2 code cleanup can land before the schema drop
- drop the table only after a quick data check in the target environment
- if any data exists, export/archive before deletion

Files likely touched:

- `server/services/portfolio-intelligence-service.ts`
- `shared/schema.ts`
- `shared/lib/data-boundaries.ts`
- `tests/helpers/testcontainers-seeder.ts`
- migration files if the table is dropped
- any schema/type exports tied only to the retired saved-comparison tables

Acceptance:

- the repo no longer implies that saved comparison persistence is a near-live
  feature
- the dormant schema family for saved comparison runtime debt is either:
  - removed together, or
  - placed on an explicit deprecation path together
- the DB either:
  - has a clear deprecation path, or
  - has been cleaned up with a migration

### Slice 4: Rebuild The Integration Test Story Around Live Contracts

Goal:

- make integration coverage match the product that actually ships

Work:

- replace the current env-gated `tests/integration/backtesting-api.test.ts`
  shape with a deterministic integration suite for the live contract
- remove the artificial env gating instead of preserving
  `ENABLE_BACKTESTING_TESTS=true` as a permanent escape hatch
- remove assertions that treat `500` responses as acceptable success for live
  backtesting routes
- fix the stale pool/cleanup setup rather than keeping the suite off by default
- archive or rewrite the scenario-comparison integration suites:
  - `tests/integration/scenario-comparison-mvp.test.ts`
  - `tests/integration/scenario-comparison.test.ts`

Required contract extension in this slice:

- persist structured partial scenario-failure metadata in `BacktestResult` /
  history responses so the historical surface stays truthful after page reloads,
  history selection, and direct result fetches

Recommended direction:

- keep one integration suite for the live backtesting scenario comparison flow
- do not preserve stale tests for nonexistent comparison-config/export endpoints
- prefer deterministic assertions over “validation passed if request returned
  `200` or `500`”

Acceptance:

- standard integration coverage exists for:
  - `/api/backtesting/compare-scenarios`
  - `/api/backtesting/scenarios`
  - async run / job / result flow
- no quarantined test remains that targets a deleted runtime path

## File Inventory By Status

### Keep And Build On

- `server/routes/backtesting.ts`
- `server/services/backtesting-service.ts`
- `client/src/hooks/useBacktesting.ts`
- `client/src/pages/monte-carlo.tsx` as the Slice 1a source surface and Slice 1b
  extraction source, not as a second product surface
- `client/src/types/backtesting-ui.ts`

### Keep But Treat As Separate Concerns

- `server/services/fund-results-comparison-service.ts`
- `client/src/pages/fund-model-results.tsx`
- `client/src/lib/scenario-calculations.ts`
- `client/src/components/modeling-wizard/steps/ScenariosStep.tsx`
- `shared/utils/scenario-math.ts`

### Remove Or Archive

- `server/routes/scenario-comparison.ts`
- `server/services/comparison-service.ts`
- `client/src/pages/ScenarioComparison.tsx`
- `client/src/hooks/useScenarioComparison.ts`
- `client/src/components/comparison-tool/ScenarioSelector.tsx`
- `client/src/components/comparison-tool/ComparisonDeltaTable.tsx`
- `client/src/components/comparison-tool/index.ts`
- `client/src/components/comparison-tool/__tests__/ScenarioSelector.test.tsx`
- `client/src/components/comparison-tool/__tests__/ComparisonDeltaTable.test.tsx`
- `shared/types/scenario-comparison.ts`
- `shared/schemas/comparison-tool.schemas.ts`
- `tests/fixtures/scenario-comparison-fixtures.ts`
- `tests/unit/services/comparison-service.test.ts`
- stale scenario-comparison integration tests

### Investigate Before Dropping

- `shared/schema.ts` `scenario_comparisons` table
- `shared/schema.ts` `comparison_configurations` table
- `shared/schema.ts` `comparison_access_history` table
- `server/services/portfolio-intelligence-service.ts` comparison wrappers

## Risks

1. Routing a real `/sensitivity-analysis` page may reveal auth/queue assumptions
   that were never exercised by the dormant Monte Carlo page.
2. Removing the old comparison route without first deleting dead hooks can leave
   compile-time or test-time breakage in places that were never routed.
3. Dropping `scenario_comparisons` too early risks deleting data from
   experiments or internal tooling that is not visible from code search alone.
4. Treating Monte Carlo backtesting as if it were full sensitivity analysis can
   create naming debt and false product expectations unless the UI labels the
   first shipped tab honestly.
5. Leaving the routed surface as a thin wrapper around `monte-carlo.tsx` for too
   long preserves duplicate ownership and makes later sensitivity-workspace
   expansion harder.
6. Scenario comparison execution currently logs and skips individual scenario
   failures; the routed page should not hide that partial-failure mode.
7. Live-run resume is now fund-fenced, but persisted result/history responses
   still do not structurally encode partial scenario failure.
8. The current backtesting integration suite is env-gated and still encodes
   “`200` or `500` is acceptable” in multiple assertions, so Phase 2 cannot
   claim truthful integration coverage until that suite is replaced or
   rewritten.
9. The dormant saved-comparison schema debt is larger than
   `scenario_comparisons`; leaving `comparison_configurations` and
   `comparison_access_history` behind would preserve a misleading partial model.

## Test Plan

Minimum:

- update unit tests for the routed Monte Carlo workspace and any extracted
  backtesting workspace/view-model wiring
- add coverage for `useBacktestLifecycle` fund change / resume behavior
- add route-level coverage for the new `/sensitivity-analysis` exposure if the
  router tests cover top-level pages
- update route-governance registry tests and route-perimeter tests to reflect
  the new mounted surface
- run current backtesting unit suites
- replace the current backtesting integration suite with deterministic coverage
  for the live contract
- update/remove scenario-comparison unit tests as the retired runtime is deleted
- add integration assertions for persisted partial scenario-failure metadata in
  result/history responses
- if partial scenario failure is meant to survive into history/result fetches,
  add integration assertions for that persisted contract

Do not count as success:

- leaving the new surface on sample data
- keeping stale scenario-comparison tests skipped while declaring Phase 2 done

## Exit Criteria

Phase 2 is complete when:

- `/sensitivity-analysis` is a routed, fund-backed workspace with a truthful
  Monte Carlo backtesting tab
- only one scenario-analysis product surface is presented to users
- the old env-gated scenario-comparison runtime path is removed or archived
- dead client comparison hooks and schemas are removed or narrowed to truthful
  contracts
- the dormant saved-comparison persistence story (`scenario_comparisons`,
  `comparison_configurations`, `comparison_access_history`) is explicitly
  deleted or put on a formal deprecation path
- backtesting integration coverage is no longer quarantined for the live route
  set and no longer treats `500` responses as acceptable success
- persisted backtest result/history responses truthfully disclose partial
  historical-scenario failure when not all requested comparisons succeed
- the plan/UI do not claim full sensitivity-analysis parity beyond the shipped
  Monte Carlo slice
