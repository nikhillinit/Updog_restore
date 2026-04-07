# Phase 2: Backtesting Scenario Comparison Rewrite (P1) - Context

**Gathered:** 2026-04-07 **Status:** Ready for planning **Mode:** `--auto` — all
gray areas auto-selected with recommended defaults. Log of auto-selections
appears inline in each decision.

<domain>
## Phase Boundary

Replace the post-hoc analytic rescaling in
`BacktestingService.runScenarioComparisons` (lines 645-738 of
`server/services/backtesting-service.ts`) with a **true scenario-aware Monte
Carlo re-run**. The current implementation runs ONE default simulation and
applies a 2-parameter analytic approximation per scenario
(`applyMarketAdjustment` at lines 704-738), so the percentiles surfaced as
`scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` are NOT sample
percentiles — they're an analytic rescale of the default run's mean. This is
statistically incorrect and user-visible (persisted to `backtest_results`,
served through `/api/backtesting/*`, surfaced in the scenario comparison UI).

After Phase 2:

- `runScenarioComparisons` injects scenario-specific `MarketParameters` into the
  simulation config and calls `unifiedMonteCarloService.runSimulation` ONCE PER
  SCENARIO (no more single-default-run-plus-rescale).
- `DistributionSummary` for each scenario is built from SAMPLE percentiles of
  the scenario-specific run's IRR distribution — the real ones, not analytic
  approximations.
- `applyMarketAdjustment` is DELETED. It has no other callers (verified by
  planner during research).
- `.a5c/processes/sensitivity-stress-panel.inputs.json` reclassifies
  `alphaFinding` severity from `informational` to P1 (direct success criterion 4
  from ROADMAP).
- A new Phoenix truth case under `tests/unit/truth-cases/` validates at least
  one historical market regime end-to-end.
- A new plan doc at
  `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md` records
  before/after percentile comparisons and explicitly notes "this satisfies the
  2026-01 P0 requirement that was missed in the 2026-01 integration plan."

Out of scope for Phase 2:

- Any change to the backtesting API response SHAPE (same field names and types —
  only the VALUES change from analytic to sample)
- Any change to `backtest_results` persisted JSONB shape beyond what naturally
  falls out of sample percentiles replacing analytic ones
- Any change to the scenario comparison UI (it should re-render with corrected
  data automatically)
- Any change to the streaming vs traditional engine selection heuristic
  (`UnifiedMonteCarloService.selectEngine`) — engine selection is orthogonal to
  market parameter injection
- Any new historical scenarios (existing set in
  `server/data/historical-scenarios.ts` is sufficient)

</domain>

<decisions>
## Implementation Decisions

### Monte Carlo parameter injection shape

- **D-01:** Extend `UnifiedSimulationConfig` in
  `server/services/monte-carlo-service-unified.ts` with an OPTIONAL field
  `marketParameters?: MarketParameters` that — when present — overrides the
  fund's default market params for this single simulation run. The override is
  passed through to whichever engine is selected (traditional or streaming) via
  `SimulationConfig`.
  - `MarketParameters` is already exported from `shared/types/backtesting.ts`
    (line 34) and already has a `marketParameters` slot on the per-scenario
    `MarketEnvironment` (line 50 and 150). The parameter plumbing to the engines
    is the planner's job to finish — the existence of these types confirms the
    primitive is already half-built.
  - **Auto-selected recommended option:** optional field with fund-default
    fallback (not a required new parameter) — preserves callers that don't care
    about scenario injection.

- **D-02:** `runScenarioComparisons` calls
  `unifiedMonteCarloService.runSimulation` ONCE PER SCENARIO with
  `marketParameters: getScenarioMarketParameters(scenarioName)` injected into
  the config. No more single-default-run-plus-rescale pattern. The existing
  `runsPerScenario` allocation
  (`Math.max(1000, Math.floor(simulationRuns / scenarios.length))`) is preserved
  — sample-count allocation is orthogonal to parameter injection and already
  conservative.

### Percentile computation

- **D-03:** `DistributionSummary` for each scenario is built from the
  SCENARIO-SPECIFIC run's IRR distribution via sample percentiles
  (p5/p25/p50/p75/p95). Use whatever percentile helper already exists in the
  Monte Carlo engine output surface — the researcher confirms the exact shape
  during planning (`result.irr.statistics` vs `result.irr.distribution` vs
  sorted-samples path).
  - **Why:** Success criterion 2 (ROADMAP) requires "The persisted
    `scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` values are
    sample percentiles from the scenario-aware run."
  - **Auto-selected recommended option:** sample percentiles from the SAME run
    that produced the mean, not a separate quantile estimation pass.

### Deletion vs retention of `applyMarketAdjustment`

- **D-04:** **Delete** `applyMarketAdjustment`
  (`server/services/backtesting-service.ts` lines 704-738) entirely. Also delete
  `getDefaultMarketParameters` import from `server/data/historical-scenarios` IF
  no other callers remain — planner verifies.
  - **Why not retain:** The method produces incorrect results by construction
    (analytic 2-parameter approximation of what should be a sample
    distribution). No caller should continue to depend on its output. A "keep
    and deprecate" path would preserve a latent bug and risk a future
    regression.
  - **Auto-selected recommended option:** delete in the same PR as the rewrite
    (clean slate).

### Failed scenario handling

- **D-05:** Preserve the existing `failedScenarios` array in the return shape.
  If a scenario's MC run throws, catch the error, append the scenario name to
  `failedScenarios`, and continue to the next scenario. The only behavioral
  change: replace the existing `console.error` at line 696 with a Pino
  structured log via the project logger (per ADR-019 — no `console.*` in new
  code). Event name suggestion: `backtesting.scenario_comparison.failed`.

### API and persistence compatibility

- **D-06:** NO breaking change to the `/api/backtesting/*` response shape. The
  `ScenarioComparison` TypeScript type stays identical — only the VALUES in the
  `simulatedPerformance` block change from analytic to sample. Existing API
  consumers (frontend scenario comparison UI, downstream analytics) do not
  require updates — they already render `p5/p25/p50/p75/p95` as opaque
  percentiles.

- **D-07:** NO change to the `backtest_results` JSONB column shape beyond the
  value change. The `scenarioComparison` blob field names stay identical; new
  records simply carry sample-based values going forward. Old records
  (pre-rewrite) remain analytic rescales — the planner must note this in the
  plan doc as a soft migration boundary (old reports are historically
  inaccurate; no auto-migration planned).

### Severity reclassification

- **D-08:** Update `.a5c/processes/sensitivity-stress-panel.inputs.json` to
  reclassify `alphaFinding` severity from `informational` to `P1`. Direct
  success criterion 4 from ROADMAP — one-line change, rides in the same PR.

### Truth case design

- **D-09:** Add ONE new Phoenix truth case under `tests/unit/truth-cases/`
  covering a single historical market regime — **2008 Global Financial Crisis**
  is the default target because it has the highest operator impact, is the most
  commonly referenced scenario in VC due-diligence conversations, and its
  `MarketParameters` are already defined in
  `server/data/historical-scenarios.ts`.
  - Truth case asserts: for a fixed input fund + fixed random seed, running the
    scenario-aware re-run against GFC params produces `simulatedPerformance.p5`
    below X, `p95` below Y, and `mean` below the default-scenario mean. Exact
    thresholds are the planner's call — they come from the first green run
    (snapshot-style lock).
  - **Auto-selected recommended option:** one truth case, GFC only. More truth
    cases can be added in a follow-on phase if operator demand emerges.

- **D-10:** Use a fixed random seed in the truth case so the sample percentiles
  are deterministic. If the MC engine does not currently accept a seed in
  `UnifiedSimulationConfig`, the planner adds a `seed?: number` field alongside
  the `marketParameters` field in the same rewrite. Deterministic truth cases
  are a hard requirement for Phoenix gate compatibility (see
  `cheatsheets/INDEX.md` Phoenix entry).

### Observability

- **D-11:** Add a Pino structured log at the start of each scenario simulation
  run inside `runScenarioComparisons`:

  ```typescript
  log.info(
    {
      event: 'backtesting.scenario_comparison.started',
      fundId,
      scenario: scenarioName,
      runs: runsPerScenario,
      marketParams: {
        /* summary only, no full blob */
      },
    },
    'Running scenario-aware Monte Carlo comparison'
  );
  ```

  And an `backtesting.scenario_comparison.completed` event on success. These are
  necessary for the plan doc's "before/after percentile comparison" table — the
  operator needs to see that scenario runs are actually running, not being
  short-circuited by the old rescale path.

### Plan doc requirement

- **D-12:** Create
  `docs/plans/2026-04-XX-backtesting-scenario-comparison-rewrite.md` (replace
  `XX` with the planner's actual date) that contains:
  - Before/after percentile comparison table for at least one historical
    scenario (gather numbers by running the old code against `main` BEFORE the
    rewrite lands, then re-run after)
  - Explicit note: "This satisfies the 2026-01 P0 requirement documented in
    `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md`"
  - Links to the new truth case path and the commit SHAs

### Claude's Discretion (planner decides)

These are intentionally not decided here — the planner picks an approach during
research based on what the code actually looks like:

- **Exact config shape** — whether `marketParameters` lives at the top of
  `UnifiedSimulationConfig` or nested under a new `scenario?: { ... }` block.
  Either works; follow existing conventions in the file.
- **Engine path for the override** — which of `StreamingConfig` /
  `SimulationConfig` / per-engine internals actually consumes the
  `marketParameters` field. The planner verifies by reading
  `server/services/monte-carlo-engine.ts` and
  `server/services/streaming-monte-carlo-engine.ts`.
- **Seed plumbing (if D-10 requires a new field)** — whether to add
  `seed?: number` to `UnifiedSimulationConfig` or wire through an existing
  randomness primitive.
- **Truth case assertion tolerances** — snapshot-locked on first green run;
  planner picks the tolerance.
- **Plan doc filename date** — whichever day the PR lands.
- **Whether to add a `alert.backtesting.*` Pino event log shape consistent with
  `alert.planner.*` from Phase 1** or keep the simpler
  `backtesting.scenario_comparison.*` shape proposed in D-11. Planner picks
  based on the rest of the backtesting service's log conventions.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 source documents

- `docs/plans/2026-04-07-backtesting-scenario-comparison-correctness.md` — the
  plan that flagged this correctness bug as P1 and is blocking resolution behind
  Phase 2.
- `.planning/ROADMAP.md` § Phase 2 — the 5 success criteria.

### Current implementation (must understand before changing)

- `server/services/backtesting-service.ts`:
  - lines 645-702 — `runScenarioComparisons` (rewrite target)
  - lines 704-738 — `applyMarketAdjustment` (DELETE)
  - lines 740-779 — `generateScenarioInsights` (reuse; unchanged)
  - lines 240-246 — public `compareScenariosDetailed` wrapper (verify the public
    API contract stays identical; planner confirms)
- `server/services/monte-carlo-service-unified.ts`:
  - lines 28-33 — `UnifiedSimulationConfig` extends `StreamingConfig` (extension
    target for `marketParameters` and possibly `seed`)
  - lines 92-120 — `runSimulation` entry point (pass-through point for the new
    field)
- `server/services/monte-carlo-engine.ts` and
  `server/services/streaming-monte-carlo-engine.ts` — where `marketParameters`
  actually gets consumed. Planner reads during research.
- `server/data/historical-scenarios.ts`:
  - `getScenarioByName`, `getScenarioMarketParameters`,
    `getDefaultMarketParameters` — already exist, already correct. No changes to
    this file expected.
- `shared/types/backtesting.ts`:
  - line 34 — `MarketParameters` interface (consumed as-is)
  - line 50 — per-scenario `marketParameters?` slot (evidence the primitive was
    partially plumbed)

### Tests and quality gates

- `tests/integration/backtesting-api.test.ts` — existing integration test;
  verify it still passes with sample-based values (tolerance may need widening
  because sample percentiles are not deterministic without the seed from D-10)
- `tests/unit/truth-cases/` — location for the new Phoenix truth case (per D-09)
- `npm run validate:core` AND `npm run phoenix:truth` — both MUST be green at
  exit. Phase 2 DOES touch calc paths, so Phoenix truth cases are NOT
  pass-through this time — expect the truth-case suite to include at least the
  one new case plus any existing cases that reference `runScenarioComparisons`
  or `applyMarketAdjustment`.
- `CLAUDE.md` § Mandatory Pre-Action Checks — run `npm test` (full suite) before
  pushing if test infrastructure changes.

### Logging and no-emoji

- `DECISIONS.md` § ADR-019 — Pino-only logging standard. `console.error` at line
  696 MUST be replaced with `logger.child` Pino log per D-11.
- `cheatsheets/emoji-free-documentation.md` — no emoji in code, commits,
  SUMMARY.md, or plan docs.

### MEMORY pointers relevant to Phase 2

- "Phoenix truth case count is in drift — never quote a number from docs; always
  run `npm run phoenix:truth` for the live count"
- "Planning Docs Drift From Main — grep current main for every named touchpoint
  and check git log. Plans drift from reality within hours."
- "Pre-Push Baseline vs Local tsc — pre-push hook compiles client/server/shared
  separately and catches TS4111"

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `getScenarioMarketParameters(scenarioName)` — already returns
  `MarketParameters` for a given historical scenario. Use as-is.
- `getScenarioByName(scenarioName)` — already returns the full scenario object
  including description. Use as-is.
- `unifiedMonteCarloService.runSimulation` — entry point. Extend the config
  surface (D-01) without changing the method signature.
- Pino logger via `import { logger } from '../lib/logger'` — already imported at
  the top of `monte-carlo-service-unified.ts:18`. Planner uses the same import
  pattern in `backtesting-service.ts`.
- `safeDivide` from `@shared/validation/backtesting-schemas` — already imported
  and used in `backtesting-service.ts:34`. Keep.
- `DistributionSummary` type from `@shared/types/backtesting` — the target
  output shape for each scenario comparison. Do not change the type; just
  populate it differently.

### Established Patterns

- **Engine selection abstraction**: `UnifiedMonteCarloService` already abstracts
  over `MonteCarloEngine` (traditional) and `StreamingMonteCarloEngine`. Market
  parameter injection should flow through the same abstraction — add the field
  to `UnifiedSimulationConfig`, the engines consume it internally.
- **Per-scenario loop**: `runScenarioComparisons` already iterates over scenario
  names. The loop structure stays; only the body changes (replace the single
  default run + rescale with a per-iteration MC invocation).
- **Health / observability**: the service does not currently expose backtesting
  health via `/api/health`. Phase 2 does not add that — Pino logs are sufficient
  for operator visibility.

### Integration Points

- **Call site**: `BacktestingService.compareScenariosDetailed` (public API
  wrapper around `runScenarioComparisons`). Planner confirms the wrapper
  signature is stable.
- **DB access**: `backtesting-service.ts:18` imports `db` for `backtestResults`
  persistence. Unchanged — the rewrite only changes WHAT is written, not the
  write path.
- **Tests**: `tests/integration/backtesting-api.test.ts` exercises the API
  surface; `tests/unit/truth-cases/` is where the new Phoenix truth case lives.

</code_context>

<specifics>

## Specific Ideas

- **Determinism for truth cases**: the Phoenix gate demands deterministic
  output. If `UnifiedSimulationConfig` does not already accept a `seed` field,
  add one in the same PR (D-10). Without determinism, the truth case will be
  flaky and provide no regression signal.
- **"Before/after" comparison discipline**: when writing the plan doc (D-12),
  gather the "before" numbers by running the CURRENT code against `main` BEFORE
  the rewrite lands — otherwise you have nothing to compare against. Planner
  should schedule this as the FIRST task in the plan (capture baseline), not the
  last.
- **`console.error` cleanup**: line 696 is the ONLY `console.*` call in the
  modified region — replacing it is a one-line change and keeps ADR-019 green.
  Do not grep for and replace other `console.*` calls in the file — scope creep.
- **Existing integration test tolerance**:
  `tests/integration/backtesting-api.test.ts` may assert specific percentile
  values. After the rewrite, those values will change (sample vs analytic). The
  planner must account for this — either widen tolerances or pin to the new
  sample values with the seed from D-10.

</specifics>

<deferred>

## Deferred Ideas

### Explicitly deferred from Phase 2

- **Multiple historical scenario truth cases** — one (GFC) is enough for
  Phase 2. A follow-on could add dotcom, COVID, 1999-peak, etc., if operator
  demand materializes.
- **Breaking API response shape** — if the frontend scenario comparison UI ever
  needs richer per-scenario output (e.g. full sample histogram, confidence
  intervals, effective sample size), that's a new phase with frontend work. Out
  of scope for Phase 2 which is server-side correctness only.
- **Auto-migration of old `backtest_results` records** — old records keep their
  analytic-rescale values. A backfill would require replaying historical sims
  against the new code, which is expensive. Deferred to a future milestone if
  operators ever complain about historical report inaccuracy.
- **Unified scenario-aware MC for the non-backtesting paths** — if
  `runCalcRunCompletion` or other MC callers would also benefit from scenario
  parameter injection, that's a separate phase. Phase 2 only touches the
  backtesting call site.

### Reviewed todos (not folded)

No matching todos found in the GSD todo backlog for Phase 2 at scout time
(2026-04-07).

</deferred>

---

_Phase: 02-backtesting-scenario-comparison-rewrite-p1_ _Context gathered:
2026-04-07 via `--auto` mode (no interactive questioning — all gray areas
auto-selected with recommended defaults per the discuss-phase workflow's
`--auto` contract)._
