# To-Do Report Accuracy Review

Date: `2026-04-05` Status: `active`

## Verdict

The original to-do report was directionally useful but materially stale. It
mixed validated remaining gaps with claims that current `main` had already
closed or had never matched literally.

This review is the current-main source of truth for the remediation queue. It
supersedes the PR-only draft review from PR `#563`.

## Current-Main Findings

### Validated remaining gaps

1. Construction-vs-actual detailed breakdown remains explicitly deferred.
2. Residual IRR follow-through remains a later audit lane outside the
   already-landed mounted `/performance` slice and should be re-audited against
   current `main` instead of assumed from the earlier PR draft.

### Current-main closures that active docs must respect

1. LP benchmark comparison no longer returns placeholder-only example data; the
   route serves persisted benchmark-derived series when present and an explicit
   truthful empty/fallback note when absent.
2. Snapshot governance is no longer unresolved; `ADR-014` is the accepted
   current-main decision for the `fund_snapshots` / `fund_state_snapshots`
   boundary.
3. Time Travel restore wording is now aligned to the server-side versioned
   restore workflow boundary while remaining disabled on the page.
4. Sensitivity Analysis no longer has planned-only one-way, two-way, or stress
   tabs; the current page exposes Monte Carlo, one-way, two-way, and stress as
   live fund-scoped persisted surfaces.

### Stale or overstated claims

1. Drift calculation does not need to be built from scratch.
2. Backtesting integration is not quarantined.
3. Restore is not currently an active client/server route mismatch; the active
   UI intentionally keeps restore unavailable while a versioned route exists.
4. Concentration analysis code does exist.
5. Phase 4 IRR unification is not untouched greenfield work because the mounted
   `/performance` truth pass has already landed on `main`.
6. The earlier review's `ActualMetricsCalculator`-specific residual-XIRR framing
   is too strong for current `main`; that service already defers to the shared
   canonical XIRR.

## Evidence Commands

Run these against current `main` before reusing any of the retained claims:

```bash
rg -n "toMetricDelta|driftCapable|driftReason" server/services/fund-results-comparison-service.ts
rg -n "Construction vs\\. actual comparison remains deferred|valuation-tier breakdowns stay deferred" client/src/components/forecasting/construction-actual-comparison.tsx
rg -n "Sensitivity analysis surface|Monte Carlo|One-Way|Two-Way|Stress" client/src/pages/sensitivity-analysis.tsx
rg -n "Benchmark comparison derived from persisted LP performance snapshots|No benchmark dataset is configured" server/routes/lp-api.ts
rg -n "identifyConcentrationRisks|Sector concentration|Stage concentration" server/services/portfolio-performance-predictor.ts
rg -n "Restore Unavailable|versioned restore workflow" client/src/pages/time-travel.tsx
rg -n "POST /api/snapshots/:snapshotId/versions/:versionId/restore|/:versionId/restore" server/routes/portfolio/versions.ts
rg -n "Status\\*\\*: Accepted|fund_snapshots|fund_state_snapshots" docs/adr/ADR-014-snapshot-governance.md
rg -n "xirrNewtonBisection|shared canonical XIRR" server/services/actual-metrics-calculator.ts
rg -n "targetIRR|expectedIRR" server/services/metrics-aggregator.ts
```

## Corrected Summary

- Keep active: deferred construction-vs-actual and residual IRR follow-through
  as a later audit lane outside the mounted performance slice.
- Retire or reword: drift-from-scratch, quarantined-backtesting, restore-route
  mismatch, concentration-code-missing, LP benchmark placeholder-only framing,
  sensitivity planned-only framing, snapshot-governance unresolved framing,
  `ActualMetricsCalculator`-specific residual-XIRR framing, and untouched Phase
  4 IRR-from-zero framing.

## Follow-Through

The April 5 remediation queue has been re-baselined on current `main`. Use the
archived strategy plus the current OMX handoff artifacts for bounded doc + UI
truthfulness follow-through; do not re-execute the old active `docs/plans` path:

- `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
- `.omx/plans/prd-next-development-goal-current-main-rebaseline.md`
- `.omx/plans/test-spec-next-development-goal-current-main-rebaseline.md`
