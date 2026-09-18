# bug-echo Report: sibling sweeps for the PR #1524 fixes

**Date:** 2026-09-15 **Pattern source:** inferred from fixes (PR #1524 commits
`bfa3f8b0b`, `2aad60e9f`, `1970b2bbc`, `dfdcd614b`) **Scan tool:** regex recon
(Grep) plus per-site reads; three read-only scans ran in parallel, one per
pattern, and every finding below was re-verified by reading the cited lines
before any edit **Files scanned:** client/src, server, shared (tests excluded
from candidates) **Pattern validated against pre-fix files:** yes for each
pattern (the canon sites on `fix/qa-1521-1522-followups` at `e09c3737d`)
**Pre-flight:** branch `fix/bug-echo-siblings` cut from the PR #1524 head so the
already-fixed sites do not resurface; build manifest `package.json` present;
output `.agents/research/`.

Five candidate patterns were sized by recon first. Two closed at recon with zero
siblings: UI copy naming a tab or button that does not exist (only the help FAQ
fixed in `dfdcd614b`), and demo generators whose shape diverges from the real
data path (only the Cashflow tab uses the demo fallback). The three that had
candidates are below, then one boundary sibling assessed inline.

## Pattern 1: status-blind aggregation of cash-flow rows

**Anti-pattern:** a `CashTransaction[]` with mixed `status` values is summed,
grouped, charted, or projected without a status predicate, so planned rows read
as realized history or executed rows feed a forecast. **Correct pattern
(CANON):** `client/src/hooks/useLiquidityAnalytics.ts` `runCashFlowAnalysis`
(executed rows only) and `generateLiquidityForecast` (planned, pending,
approved). `shared/core/liquidity/LiquidityEngine.ts` sums whatever it is given
by contract; the filter belongs at the caller. **Cross-cutting fact:**
`CashTransactionSchema.plannedDate` and `CashPositionSchema.asOfDate` are bare
`z.date()` (`shared/schemas/cashflow-schema.ts:47,220`), and `makeApp` has no
JSON date reviver, so every JSON body sent to `/api/liquidity/*` or
`POST /api/cashflow/:fundId/transactions` fails schema parse before the engine
runs. The server siblings are therefore unreachable over HTTP today.
`client/src/hooks/use-liquidity.ts` (the only fetcher) had no importers.

| #   | Finding                                                                                                                                                                           | Urgency | Risk: Fix | Risk: No Fix | ROI       | Blast Radius | Fix Effort | Status                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | --------- | ------------ | ---------- | --------------------------------------------------- |
| 1   | `server/routes/liquidity.ts` POST /analyze passed body rows unfiltered into `analyzeCashFlows` (planned rows as history)                                                          | LOW     | Low       | Low          | Good      | 1 file       | Trivial    | Fixed (executed-only filter)                        |
| 2   | `server/routes/liquidity.ts` POST /forecast passed `transactions` (empty array when absent) unfiltered into `generateLiquidityForecast` (executed and cancelled rows as upcoming) | LOW     | Low       | Low          | Good      | 1 file       | Trivial    | Fixed (upcoming-status filter)                      |
| 3   | `client/src/hooks/use-liquidity.ts` posted unfiltered inputs to both routes; zero importers                                                                                       | LOW     | Low       | Low          | Good      | 0 callers    | Trivial    | Fixed by deletion                                   |
| 4   | `client/src/components/dashboard/CashflowDashboard.tsx` Available Cash card labelled `summary.netCashFlow` (net of all executed history) as "this month"                          | MEDIUM  | Low       | Medium       | Excellent | 1 file       | Trivial    | Fixed (reads the current month bucket of `byMonth`) |

WATCH (report only):

- `server/routes/cashflow.ts:167-174` `GET /:fundId/transactions` summary sums
  every status including cancelled and failed; in-memory `Map` store ("Replace
  with database in production"), unpopulatable over HTTP for the same `z.date()`
  reason, no client caller. Suggested: exclude cancelled and failed from
  `totalInflows`, `totalOutflows`, `netCashFlow`.
- `server/routes/cashflow.ts:337-343` capital-call `summary.totalAmount`
  includes draft and cancelled calls next to a `pendingAmount` that filters
  `collecting`; record-total or called-capital total is a product question.

REVIEW (owner decision, live users):

- `server/services/lp-reporting/metrics-engine.ts:107-126` `isLiveEvent`
  excludes only reversed or reversal events, so draft `cash_flow_events`
  selected by a caller are counted by `sumAmountsByType`, `buildNetIrrFlows` and
  `buildGrossIrrFlows`; the sibling engine
  `financial-facts-snapshot-service.ts:65,309-318` gates on approved or locked.
  The metric-run preview hash covers results, so changing this changes hashes.
  Whether draft evidence may enter a draft metric run until approval is policy;
  no status re-check was found at approve or lock.
- `server/routes/lp-distributions.ts:165-168,294-315,327` totals sum every
  `lp_distribution_details` row while `status` defaults to `pending` and no
  writer sets it; rendered by `DistributionsWidget.tsx:115`. Status vocabulary
  could not be verified.

OK: `LiquidityEngine.ts` (CANON contract), `fund-cashflow-inputs.ts:253-258`
(status-explicit or planned by construction),
`financial-facts-snapshot-service.ts` (accepted statuses),
`cash-flow-event-service.ts` list (all-status ledger view by design),
`lp-capital-calls.ts:164-171`, `fund-kpis.ts` selectors,
`import-reconciliation-service.ts` (pre-status import rows), the mock forecast
and position in `routes/cashflow.ts:402-585`.

## Pattern 2: ownership null versus recorded zero

**Anti-pattern:** coalescing a null (unrecorded) ownership to zero before
arithmetic or an API response (`?? 0`, `|| 0`, `String(x ?? '0')`), treating a
recorded zero as "not captured", or inventing a default ownership. **Correct
pattern (CANON):** `server/services/portfolio-overview-service.ts:61-66`,
`actual-metrics-calculator.ts:182-191`, `metrics-aggregator.ts:875-884`, ADR-054
(DECISIONS.md): scale by ownership only when non-null and greater than zero;
null and zero both keep the unscaled valuation;
`marginal-reserve-moic-input-service.ts:111` turns null into "candidate
unavailable" rather than a number.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                         | Urgency | Risk: Fix | Risk: No Fix | ROI      | Blast Radius | Fix Effort | Status                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------- | ------------ | -------- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------------- |
| 5   | `server/services/allocations/allocation-read-service.ts:161` emitted `ownership_pct: 0` for a null column on `GET /api/funds/:fundId/companies`, with a non-nullable type, so no consumer could ever tell unrecorded from zero (the label bug fixed in `2aad60e9f`, waiting for its first reader)                                                                               | LOW     | Low       | Low          | Good     | 3 files      | Trivial    | Fixed (nullable `number`, null passes through; dead mirror `calculator.ts:85` aligned; contract test added) |
| 6   | `server/services/lp-calculator.ts:431` `ownershipMap.get(company.id)` coalesced to 0: a company with no investment row or null `investments.ownershipPercentage` gets `lpProRataValue` 0 and is summed into the LP `totalValue` as a real zero; reachable via `GET /api/lp/funds/:fundId/holdings` (mounted in makeApp; LP surface is paused behind `VITE_ENABLE_LP_REPORTING`) | MEDIUM  | High      | Medium       | Marginal | 2 files      | Small      | Open, owner decision                                                                                        |

Finding 6 is a true bug of this class but the fail-closed fix is a product
choice: skip unpriceable holdings (totals conserved, but the omission is
undisclosed) or present the row with a null value (LP-facing contract change:
`lpProRataValue: number | null` breaks the `totalValue` reduce in
`server/routes/lp-api.ts:561` and the client widget). Recommended: skip plus an
additive `unpricedHoldings` count in the response. Not changed here because the
surface is paused and the invariant is unproven.

WATCH (report only):

- `client/src/components/investments/ownership-update-dialog.tsx:170,176`
  fabricates 8.5 percent when the investment is absent or its ownership is a
  recorded 0, and `valuation-update-dialog.tsx:96` fabricates $15M; both are
  mounted only by `add-event-dropdown.tsx`, which has no importer (a prototype
  referenced by the investment-rounds UI v2 plan doc). Not patched: dead code
  owned by a planned feature.

REVIEW (owner decision, financial outputs):

- `server/services/reserve-input-builder.ts:92,120` defaults missing
  `investments.ownership_percentage` to 0.15 and sets 0.15 unconditionally on
  the `portfolio_companies` path; provenance-carrying consumers gate it, but
  `fund-scenario-reserve-optimization-workflow-service.ts:103-119` takes the
  provenance-stripped portfolio into `ReserveEngine` where 0.15 earns a x1.2
  allocation boost, then persists `plannedReservesCents`. ADR-029 already names
  this "the hardcoded-fallback pathology"; ADR-054 scopes only the three NAV
  surfaces. Any fix shifts every persisted planned reserve.
- `server/services/projected-metrics-calculator.ts:167` `|| '0.1'` invents 10
  percent ownership for null (null is then treated better than a recorded zero
  by the rule-based reserve allocation: x1.0 plus confidence bonus versus x0.8),
  live via `getUnifiedMetrics`, pinned as-is by
  `projected-metrics-calculator.legacy-characterization.test.ts:117-149`.

OK: `reserves-adapter.ts:53`, `excel-parity-validator.ts:60`,
`ranked-reserve-input-from-snapshot.ts:133` (schema requires a number; the
engine never reads it; unavailable candidates are excluded first), the
`if (!ownership)` sites in `variance.ts`, `deal-pipeline.ts`,
`lp-reporting/metric-runs.ts` (authorization records, not percentages),
`pdf-generation/data-fetchers.ts:88` (LP commitment share, never rendered),
wizard inputs (`CapitalStructureStep.tsx:131`, `capital-first.ts:114`,
`graduation-rate-strategy.tsx:346`, `FollowOnStrategyTable.tsx:241`,
`wizard-calculations.ts:109`), and the CANON-consistent pass-throughs in
`portfolio-overview-service.ts:105`, `portfolio-time-machine-read.ts:173-176`,
`portfolio-company-update-service.ts:181`, `reserve-input-builder.ts:176`.

## Pattern 3: test assertions that depend on an unseeded Math.random draw

**Anti-pattern:** a unit test asserts on an outcome shaped by `Math.random()`
inside production code without pinning or seeding it, so it passes
probabilistically. **Correct pattern (CANON):**
`tests/unit/hooks/useLiquidityAnalytics.test.tsx` "keeps planned flows in the
demo forecast" (`vi.spyOn(Math, 'random').mockReturnValue(0)` inside
try/finally); Monte Carlo and power-law tests pass explicit seeds;
`shared/core/optimization/SeededRNG.ts`.

43 production files call `Math.random`; 7 are comment-only, 36 draw. 56 test
files were grepped and 10 read at the asserting section. Every exact-number
Monte Carlo or power-law assertion passes a seed; identifier, nonce, jitter,
backoff, sampling-gate and UI-decoration draws have no asserting test.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                            | Urgency | Risk: Fix | Risk: No Fix | ROI      | Blast Radius | Fix Effort | Status                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | --------- | ------------ | -------- | ------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| 7   | `tests/unit/engines/cohort-engine.test.ts` "should distribute companies across stages" asserted on 20 random stage picks (failure probability about 4e-12 per run)                                                                                                                                                                                                 | LOW     | Low       | Low          | Marginal | 1 file       | Trivial    | Fixed (period-4 pin, canon propagation)                                                                |
| 8   | `tests/unit/engines/cohort-engine.test.ts` "should calculate average Multiple across cohorts" was quarantined as "shared state under the full suite"; the real cause is rounding: `compareCohorts` rounds `avgMultiple` to two decimals and with two cohorts the raw mean can sit exactly on a half-cent, so `toBeCloseTo(_, 2)` failed on roughly one draw in six | LOW     | Low       | Low          | Good     | 2 files      | Small      | Fixed (assertion applies the same rounding; test un-skipped; quarantine header and report row updated) |

WATCH:
`tests/unit/engines/cohort-engine.legacy-characterization.test.ts:169-179`
deliberately asserts that the legacy lane draws unseeded (a tripwire feeding
shadow telemetry); pinning it would invert its purpose. Left alone. REVIEW:
`server/services/streaming-monte-carlo-engine.ts:1141-1147` `setRandomSeed`
assigns `Math.random` process-wide and never restores it; no test passes
`randomSeed` today, but any seeded streaming run would make every later
`Math.random` caller in that process deterministic and clobber
`vi.spyOn(Math, 'random')` for the rest of the worker. Production RNG behaviour,
owner decision.

## Boundary sibling assessed inline (from the 27/25 demo split fix)

`client/src/lib/cashflow/fund-cashflow-inputs.ts:118`
`statusFor = idx <= asOfIdx ? 'executed' : 'planned'` buckets by month, so a
persisted investment dated later in the current month counts as deployed today.
Documented model choice ("actuals up to the as-of month"); changing it to day
granularity would move `deployed`, `remainingInvestable` and the executed
capital calls. WATCH, not changed. The other `<= now` sites
(`redis-factory.ts:69` expiry, `pdf-generation/data-builders.ts:230` as-of
inclusive, purge windows) are correct as inclusive comparisons.

## Verification

Targeted suites for every touched file: allocations contract, allocations
calculator, liquidity makeApp surface, useLiquidityAnalytics, dashboard-modern,
cohort-engine (run three times) and its legacy characterization; ESLint and
Prettier on the touched files; `npm run baseline:check`; the surface-contract
matrix hash for `server/routes/liquidity.ts` refreshed and its gate re-run.
