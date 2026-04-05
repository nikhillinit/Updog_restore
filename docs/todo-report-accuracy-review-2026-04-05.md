# To-Do Report Accuracy Review

Date: `2026-04-05`
Status: `active`

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
3. LP benchmark comparison still returns placeholder data.
4. Snapshot-table governance is still unresolved between `fund_snapshots` and
   `fund_state_snapshots`.
5. Residual IRR unification still exists outside the already-landed mounted
   `/performance` slice, especially in `ActualMetricsCalculator`.

### Stale or overstated claims

1. Drift calculation does not need to be built from scratch.
2. Backtesting integration is not quarantined.
3. Restore is not currently an active client/server route mismatch; the active
   UI intentionally keeps restore unavailable while a versioned route exists.
4. Concentration analysis code does exist.
5. Phase 4 IRR unification is not untouched greenfield work because the mounted
   `/performance` truth pass has already landed on `main`.

## Evidence Commands

Run these against current `main` before reusing any of the retained claims:

```bash
rg -n "toMetricDelta|driftCapable|driftReason" server/services/fund-results-comparison-service.ts
rg -n "Construction vs\\. actual comparison remains deferred|valuation-tier breakdowns stay deferred" client/src/components/forecasting/construction-actual-comparison.tsx
rg -n "COMING_SOON_TABS|planned but not yet wired" client/src/pages/sensitivity-analysis.tsx
rg -n "Placeholder for benchmark comparison logic|Benchmark data placeholder" server/routes/lp-api.ts
rg -n "identifyConcentrationRisks|Sector concentration|Stage concentration" server/services/portfolio-performance-predictor.ts
rg -n "Restore Unavailable|versioned restore workflow" client/src/pages/time-travel.tsx
rg -n "POST /api/snapshots/:snapshotId/versions/:versionId/restore|/:versionId/restore" server/routes/portfolio/versions.ts
rg -n "fund_snapshots|fund_state_snapshots" shared/schema.ts shared/schema/fund.ts server -g "*.ts"
rg -n "deprecated local XIRR|ActualMetricsCalculator|MetricsAggregator" server/services -g "*.ts"
```

## Corrected Summary

- Keep active: deferred construction-vs-actual, sensitivity tabs still planned,
  LP benchmark hardening, residual IRR follow-through outside the mounted
  performance slice, and snapshot governance.
- Retire or reword: drift-from-scratch, quarantined-backtesting, restore-route
  mismatch, concentration-code-missing, and untouched Phase 4 IRR-from-zero
  framing.

## Follow-Through

Execution has been re-baselined into the canonical current-main remediation
plan:

- `docs/plans/2026-04-05-todo-report-remediation-strategy.md`
- `.omx/plans/prd-todo-report-remediation-main-rebaseline.md`
