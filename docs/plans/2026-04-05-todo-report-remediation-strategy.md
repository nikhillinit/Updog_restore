# To-Do Report Remediation Strategy

Date: `2026-04-05`
Status: `actionable`

## Objective

Convert the corrected accuracy review into a current-main execution strategy
without replaying already-landed work or preserving stale backlog claims.

## Source Of Truth

This document is the repo-native strategy record for the remediation queue on
current `main`. It supersedes the PR-only draft strategy from PR `#563`.

## Re-Baselined Worktracks

### Worktrack A: Planning Source-Of-Truth Correction

Scope:
- remove stale report wording from active planning artifacts
- attach reproducible evidence commands beside every retained claim
- if PR `#563` is still open, update or supersede its two strategy docs before
  merge

Definition of done:
- no active doc claims drift-from-scratch, quarantined backtesting, missing
  concentration code, restore-route mismatch, or untouched Phase 4 IRR from
  zero

### Worktrack B: Product Truthfulness Surfaces

Scope:
- tighten wording on `client/src/pages/sensitivity-analysis.tsx`
- tighten wording on `client/src/pages/time-travel.tsx`
- keep both surfaces aligned to the active implementation gates

Definition of done:
- sensitivity disabled tabs explicitly describe the missing backend/data
  requirements
- time-travel restore wording matches the versioned restore workflow that exists
  on the server while staying disabled on the active UI surface

### Worktrack C1: Residual IRR Follow-Through

Scope:
- audit non-canonical IRR paths not already covered by the mounted
  `/performance` truth pass
- start from:
  - `server/services/actual-metrics-calculator.ts`
  - `server/services/metrics-aggregator.ts`

Definition of done:
- residual in-scope paths use canonical shared XIRR or explicit truthful
  fallback semantics
- no same-label local IRR algorithm remains in the touched residual path

### Worktrack C2: LP Benchmark Hardening

Scope:
- replace the placeholder payload in `GET /api/lp/performance/benchmark`
- keep fallback semantics explicit when no benchmark dataset is available

Definition of done:
- the endpoint no longer returns hardcoded example benchmark values
- the response is driven by real persisted benchmark data when present, or a
  truthful empty/fallback contract when absent

### Worktrack D: Snapshot Governance Closure

Scope:
- settle canonical responsibility boundaries between `fund_snapshots` and
  `fund_state_snapshots`
- land the ADR in the established ADR numbering/location scheme

Definition of done:
- `docs/adr/ADR-014-snapshot-governance.md` exists
- touched docs/services reference the ADR when describing snapshot ownership

## Evidence Commands

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

## Execution Order

1. Worktrack `A` first.
2. Then run one bounded worktrack at a time:
   - `B`
   - `C1`
   - `C2`
   - `D`
3. Do not blend documentation, backend hardening, and governance into one
   mixed tranche.

## Validation Gates

- Worktrack A:
  - evidence commands still match current `main`
- Worktrack B:
  - focused page/component tests for touched wording
- Worktrack C1:
  - canonical XIRR truth cases + touched service tests
- Worktrack C2:
  - focused LP API integration test
- Worktrack D:
  - ADR path exists and is referenced by touched docs/services

## References

- `docs/todo-report-accuracy-review-2026-04-05.md`
- `docs/adr/ADR-014-snapshot-governance.md`
- `.omx/plans/prd-todo-report-remediation-main-rebaseline.md`
