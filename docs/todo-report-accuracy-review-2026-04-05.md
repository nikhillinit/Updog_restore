# To-Do Report Accuracy Review (as of 2026-04-05)

## Verdict

The report is **partially accurate but materially stale**. Several items are
correct at a high level, while others are now inaccurate (or overstate missing
functionality).

## Sandbox validation (implemented)

Validated in the sandbox repo on `2026-04-05` using reproducible command checks:

1. Drift implementation exists:
   - `rg -n "toMetricDelta|driftCapable|driftReason" server/services/fund-results-comparison-service.ts`
2. Deferred construction-vs-actual copy exists:
   - `rg -n "Construction vs\\. actual comparison remains deferred|valuation-tier breakdowns stay deferred" client/src/components/forecasting/construction-actual-comparison.tsx`
3. One-way/two-way/stress are marked coming soon and disabled:
   - `rg -n "COMING_SOON_TABS|disabled|planned but not yet wired" client/src/pages/sensitivity-analysis.tsx`
4. Backtesting tests are not quarantined:
   - `rg -n "@quarantine" tests/integration/backtesting-api.test.ts`
   - `npm run test:integration -- tests/integration/backtesting-api.test.ts`
5. Restore route/UI status:
   - `rg -n "Restore Unavailable|server route is wired" client/src/pages/time-travel.tsx`
   - `rg -n "POST /api/snapshots/:snapshotId/versions/:versionId/restore|/:versionId/restore" server/routes/portfolio/versions.ts`
6. LP benchmark endpoint still placeholder:
   - `rg -n "Placeholder for benchmark comparison logic|Benchmark data placeholder" server/routes/lp-api.ts`
7. Concentration analysis exists in backend:
   - `rg -n "identifyConcentrationRisks|Sector concentration|Stage concentration" server/services/portfolio-performance-predictor.ts`

Sandbox validation surfaced one wording improvement: the restore item should no
longer be framed as a client/server path mismatch in active workflow because the
current UI intentionally disables restore while a versioned restore route
exists. It also surfaced one execution improvement: integration evidence should
use the integration Vitest config (`test:integration`) rather than the default
unit script (`npm test`), which intentionally excludes integration paths.

## Findings by section

### Phase 1 remainder

1. **Drift calculation must be built from scratch** → **Inaccurate**
   - A drift/delta implementation already exists in
     `FundResultsComparisonService` (`toMetricDelta`, `driftCapable`,
     `driftReason`, percentage delta logic).
   - Drift statuses also exist in allocation scenario apply preview flows
     (`exact_match`, `stale_but_mappable`, `company_set_changed`).

2. **Scenario builder wiring: 486 lines, zero API calls, needs fund-data
   endpoint** → **Partially accurate, specific details unverified/outdated**
   - We can confirm at least one scenario manager surface is local-state driven
     with no API wiring
     (`client/src/components/cap-table/scenario-manager.tsx`).
   - The precise “486 lines” figure does not match current files reviewed.

3. **Construction-actual comparison shows deferral message** → **Accurate**
   - This surface explicitly renders a deferred message and states
     round/stage/valuation breakdowns are deferred until stable provenance
     exists.

### Phase 2 remainder

1. **One-way/two-way/stress testing marked coming soon** → **Accurate**
   - Sensitivity page marks those tabs as planned/coming soon and disabled.

2. **Backtesting tests still quarantined** → **Inaccurate**
   - The primary backtesting API test suite is active
     (`tests/integration/backtesting-api.test.ts`) and does not carry
     `@quarantine` markers.

### Phase 3 remainder

1. **Snapshot schema ADR and canonical table decision needed** → **Mostly
   accurate (governance gap)**
   - Both `fund_snapshots` and `fund_state_snapshots` coexist in schema
     definitions.
   - We did not find a current ADR that clearly resolves canonical ownership
     between them.

2. **Restore workflow route mismatch** → **Inaccurate for active flow (stale
   claim)**
   - The time-travel UI currently disables restore with explicit “Restore
     Unavailable” copy.
   - A server restore route does exist for snapshot versions
     (`POST /api/snapshots/:snapshotId/versions/:versionId/restore`).

3. **Audit trail UI missing despite fundEvents data** → **Plausibly accurate**
   - `fundEvents` exists in shared schema.
   - No direct client UI usage of `fundEvents` was found in `client/src`.

### Phase 4

1. **MOIC endpoint compute-only + sample-only UI needs adapter** → **Partially
   accurate**
   - `/api/moic/calculate` and `/api/moic/rank` routes exist.
   - They compute from caller-supplied investments (no fundId lookup in route
     logic).
   - `pages/moic-analysis.tsx` appears sample/static-data oriented.

2. **IRR unification needed across calculators to canonical shared XIRR** →
   **Accurate**
   - `ActualMetricsCalculator` contains deprecated local XIRR comments.
   - `PerformanceCalculator` uses a simple CAGR-based IRR approximation.
   - Canonical shared XIRR exists in `shared/lib/finance/xirr.ts`.

3. **Performance attribution engine: no backend exists** → **Overstated /
   partially inaccurate**
   - There is at least placeholder backend attribution payload in
     `portfolio-intelligence` backtest route.
   - However, this does not appear to be a robust production attribution engine.

4. **Benchmarking data feed: no data source exists** → **Mostly accurate for LP
   benchmark endpoint**
   - `/api/lp/performance/benchmark` explicitly returns placeholder benchmark
     data with a note to implement real logic.

5. **Concentration analysis: no code exists** → **Inaccurate**
   - Concentration-risk analysis code exists in services (e.g.,
     `portfolio-performance-predictor.ts`).

## Suggested corrected summary

- Keep: deferred construction-vs-actual, sensitivity tabs still coming soon, LP
  benchmark feed still placeholder, IRR unification still needed.
- Revise/remove: “drift must be built from scratch”, “backtesting tests
  quarantined”, “concentration analysis no code exists”, and restore-route
  mismatch phrasing.
- Mark as governance item: canonical snapshot table decision/ADR.
