---
last_updated: 2026-04-07
status: TRACKED (not scheduled)
severity: P1
owner: Phoenix Probabilistic
---

# Backtesting Scenario Comparison Correctness

## Summary

`BacktestingService.runScenarioComparisons` currently runs the **default** Monte
Carlo simulation and applies a fixed-function post-hoc adjustment to the result,
instead of injecting scenario-specific market parameters into the simulation
config and re-running. The percentiles surfaced as
`scenarioComparison.simulatedPerformance.{p5,p25,p50,p75,p95}` are not sample
percentiles from a scenario-aware simulation; they are derived analytically from
a rescaled mean and a hardcoded volatility coefficient.

## Location

- `server/services/backtesting-service.ts:645-738` -- `runScenarioComparisons`
  and its helper `applyMarketAdjustment`
- `server/services/backtesting-service.ts:240-246` -- public
  `compareScenariosDetailed` wrapper
- Persisted via `convertToBacktestResult` and read back through the
  `/api/backtesting/*` surface

## Why It Is Debt, Not Just A Note

1. The original integration plan
   (`docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md:69`)
   flagged "Market Parameter Application" as **P0** with the explicit
   requirement: _the `runScenarioComparisons()` method MUST modify the
   simulation config to use scenario-specific market parameters._ What shipped
   is post-hoc scaling. The P0 requirement was not satisfied.
2. The output is user-visible (persisted to `backtest_results`, served through
   the API, surfaced in scenario comparison UI).
3. The calculation is statistically incorrect: it discards the actual Monte
   Carlo distribution and replaces it with a 2-parameter analytic approximation.
   The percentiles are not sample percentiles.
4. Severity-classified as `informational` in
   `.a5c/processes/sensitivity-stress-panel.inputs.json -> alphaFinding`, which
   is the wrong tier given (1)-(3).

## Current Implementation Sketch

```ts
// runScenarioComparisons (paraphrased)
const result = await unifiedMonteCarloService.runSimulation({
  fundId,
  runs: runsPerScenario,
  timeHorizonYears: 5,
  forceEngine: 'auto',
  // NOTE: no scenario marketParams passed in
});

const adjusted = this.applyMarketAdjustment(result, marketParams);
// adjusted.mean = baseIRR * exitMultiplierRatio
// adjusted.stdDev = abs(adjusted.mean) * 0.3 * volatilityRatio
// adjusted.p5  = mean - 1.645 * stdDev  (analytic, not from samples)
// adjusted.p95 = mean + 1.645 * stdDev
```

The 0.3 coefficient and the symmetric Gaussian-shaped percentiles are hardcoded.

## Proposed Fix (Six-Step Flagged Rollout)

1. **Snapshot legacy behavior.** Add an integration test that locks in the
   current p5/p25/p50/p75/p95 values for 2-3 representative scenarios. Commit
   standalone before any refactor.
2. **Plumb `marketParametersOverride?: MarketParameters` through
   `unifiedMonteCarloService.runSimulation` as dead code.** Default undefined =
   current behavior. Zero functional change.
3. **Add `comparisonMethod: 'post_hoc_scaling' | 'config_injection'` to
   `ScenarioComparison` and persist it.** Default `'post_hoc_scaling'`. NULL
   rows in `backtest_results` read as `'post_hoc_scaling'` (legacy NULL
   attribution pattern).
4. **Implement the `config_injection` path behind an env flag**
   (`BACKTEST_SCENARIO_INJECTION`). Off in prod, on in dev/test.
5. **Side-by-side validation harness.** Run both methods on a real fund x 3
   scenarios, output a markdown diff report, document delta in PR.
6. **Flip the flag dev -> staging -> prod with a 1-week soak.** Update Phoenix
   backtesting truth cases in a separate PR after the flip is permanent.

## Out Of Scope For This Tracker

- The Custom Scenario Builder UI (gated on this fix)
- Truth case updates (block step 6 only)
- Engine-level refactor of how `unifiedMonteCarloService` accepts market params;
  the override plumbing may require touching multiple underlying engines (Power
  Law, Traditional)

## Interim Mitigations Until The Fix Lands

- Log `LEGACY_POST_HOC_SCALING` warning on every `runScenarioComparisons` call
- Footnote any LP-facing surface that shows scenario comparison percentiles:
  "illustrative; derived from rescaled default simulation, not a re-simulation
  under historical regime"

## Cross-References

- `.a5c/processes/sensitivity-stress-panel.inputs.json` -- the `alphaFinding`
  block this tracker promotes
- `.a5c/processes/sensitivity-stress-panel.process.md:25,122,178` -- prior
  session's recording of the smell
- `docs/archive/plans/2026-01-04-monte-carlo-backtesting-integration.md` --
  original P0 requirement
- `docs/plans/2026-04-03-phase-2-slice-4-backtesting-integration-rewrite-plan.md`
  -- adjacent backtesting integration test work (different concern)
