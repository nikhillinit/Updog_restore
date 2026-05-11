# To-Do Report Remediation Strategy

Date: `2026-04-05` Status: `archived-reference`

Superseded for execution by the current approved priority development queue
handoff.

## Objective

Record the April 5 current-main rebaseline without replaying already-landed
work or preserving stale backlog claims. This file is retained as archived
evidence for P0 reconciliation, not as the active execution queue.

## Archive Boundary

For execution, defer to the current approved priority development queue handoff.
This archived document preserves the April 5 rationale and evidence commands
that informed that queue. It superseded the PR-only draft strategy from PR
`#563` at the time, but it no longer authorizes work from zero.

## Re-Baselined Worktracks

### Worktrack A: Planning Source-Of-Truth Correction

Scope:

- remove stale report wording from active planning artifacts
- attach reproducible evidence commands beside every retained claim
- if PR `#563` is still open, update or supersede its two strategy docs before
  merge

Definition of done:

- no active doc claims drift-from-scratch, quarantined backtesting, missing
  concentration code, restore-route mismatch, or untouched Phase 4 IRR from zero

### Worktrack B: Product Truthfulness Surfaces

Scope:

- tighten wording on `client/src/pages/sensitivity-analysis.tsx`
- tighten wording on `client/src/pages/time-travel.tsx`
- keep both surfaces aligned to the active implementation gates

Definition of done:

- sensitivity wording and tests reflect that Monte Carlo, one-way, two-way, and
  stress are live fund-scoped persisted surfaces
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

### Worktrack C2: LP Benchmark Hardening Reference

Status: closed/reference on current `main`; do not treat this as an open
greenfield implementation lane.

Scope:

- treat the current route as already wired to persisted LP performance snapshots
  when benchmark data is present
- keep truthful empty/fallback semantics explicit when no benchmark dataset is
  available
- reopen backend changes only if contradictory current-main evidence appears

Definition of done:

- active docs no longer describe the endpoint as placeholder-only or hardcoded
  example data
- any future C2 work is triggered by regression or contradictory evidence, not
  by the stale PR baseline

### Worktrack D: Snapshot Governance Closure Reference

Status: closed/reference on current `main`; `ADR-014` is the governing boundary
unless future contradictory evidence appears.

Scope:

- treat `ADR-014` as the canonical current-main decision for `fund_snapshots`
  and `fund_state_snapshots`
- reference the ADR when touched docs/services describe snapshot ownership
- reopen governance work only if conflicting ownership evidence appears

Definition of done:

- active docs no longer describe snapshot governance as unresolved
- `docs/adr/ADR-014-snapshot-governance.md` remains the canonical referenced
  boundary in touched docs/services

## Evidence Commands

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

## Historical Execution Order

Use this order only as historical context for the archived April 5 tranche. The
current approved queue starts with P0 closeout/reconciliation and then moves
through the approved priority lanes.

1. Worktrack `A` first.
2. Then run one bounded open worktrack at a time:
   - `B`
   - `C1`
3. Treat `C2` and `D` as settled-on-main reference lanes; reopen them only if
   contradictory evidence appears.
4. Do not blend documentation, backend hardening, and governance into one mixed
   tranche.

## Validation Gates

- Worktrack A:
  - evidence commands still match current `main`
  - active docs no longer contradict `ADR-014` or reopen `C2`/`D` as greenfield
    work
- Worktrack B:
  - focused page/component tests prove the four live sensitivity tabs and the
    disabled time-travel restore boundary
- Worktrack C1:
  - canonical XIRR truth cases + touched service tests
- Worktrack C2:
  - remains closed/reference unless future evidence proves the route no longer
    serves persisted/fallback truthful benchmark data
- Worktrack D:
  - remains closed/reference unless future evidence proves `ADR-014` is no
    longer the canonical referenced boundary

## References

- `docs/archive/2026-q2/todo-report-accuracy-review-2026-04-05.md`
- `docs/adr/ADR-014-snapshot-governance.md`
