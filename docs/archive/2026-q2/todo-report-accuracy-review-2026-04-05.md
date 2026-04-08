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
2. One-way, two-way, and stress sensitivity tabs remain planned and not wired.
3. Residual IRR follow-through remains a later audit lane outside the
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
rg -n "COMING_SOON_TABS|planned but not yet wired" client/src/pages/sensitivity-analysis.tsx
rg -n "Benchmark comparison derived from persisted LP performance snapshots|No benchmark dataset is configured" server/routes/lp-api.ts
rg -n "identifyConcentrationRisks|Sector concentration|Stage concentration" server/services/portfolio-performance-predictor.ts
rg -n "Restore Unavailable|versioned restore workflow" client/src/pages/time-travel.tsx
rg -n "POST /api/snapshots/:snapshotId/versions/:versionId/restore|/:versionId/restore" server/routes/portfolio/versions.ts
rg -n "Status\\*\\*: Accepted|fund_snapshots|fund_state_snapshots" docs/adr/ADR-014-snapshot-governance.md
rg -n "xirrNewtonBisection|shared canonical XIRR" server/services/actual-metrics-calculator.ts
rg -n "targetIRR|expectedIRR" server/services/metrics-aggregator.ts
```

## Corrected Summary

- Keep active: deferred construction-vs-actual, sensitivity tabs still planned,
  and residual IRR follow-through as a later audit lane outside the mounted
  performance slice.
- Retire or reword: drift-from-scratch, quarantined-backtesting, restore-route
  mismatch, concentration-code-missing, LP benchmark placeholder-only framing,
  snapshot-governance unresolved framing, `ActualMetricsCalculator`-specific
  residual-XIRR framing, and untouched Phase 4 IRR-from-zero framing.

## Follow-Through

The April 5 remediation queue has been re-baselined on current `main`, and the
bounded doc + UI truthfulness follow-through has been applied:

- `docs/plans/2026-04-05-todo-report-remediation-strategy.md`
- `.omx/plans/prd-todo-report-remediation-main-rebaseline.md`
