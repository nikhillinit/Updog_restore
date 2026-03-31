---
status: ACTIVE
last_updated: 2026-03-31
depends_on:
  - docs/plans/2026-03-26-development-spec-set.md
  - docs/plans/2026-03-27-secondary-surface-decisions.md
validated_by:
  - npm run baseline:check
  - npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-tracking.test.ts
---

# Revised Production Order: Variance, Baselines, Alerts, Scenario Consolidation, Time Machine, And Analytics

## Purpose

This document memorializes the revised implementation plan after code-level
review and sandbox validation.

It is grounded in the current repository state, not prior readiness claims.

## Current Validated Status

### `0.P` Parallelizable Cleanup

Status: partially completed and validated.

Completed:

- fixed the `alertsGenerated` client/server contract mismatch
- fixed alert-rule passthrough for `suppressionPeriod` and
  `notificationChannels`
- updated focused variance API tests
- validated the cleanup slice with:
  - `npm run baseline:check`
  - `npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-tracking.test.ts`

Still open in this bucket:

- wire `_reportsData` into the Reports tab
- remove `mockVarianceData`
- hide or gate restore UI until the server route is real

### Still-Valid Hard Findings

1. `Phase 0` blocks automation, not all cleanup.
   Baseline automation and automatic alert evaluation still depend on an
   authoritative metrics-source decision.
2. `Phase 1A.1a` must include `POST /variance-reports` repair.
   The write path still does not safely resolve a default baseline and still
   returns a raw row shape.
3. `Phase 1C.1` must happen before any scheduler work.
   Scheduling `performCompleteVarianceAnalysis()` as-is would create ad hoc
   reports and duplicateable alerts, not just evaluate alert rules.
4. `Phase 0.5` is a Time Machine prerequisite only.
   The snapshot ADR should not block variance and baseline work.

## Phase 0: Foundation Decisions

Hard blockers for automation only, `3-5 days`.

### `0.1a` Authoritative Metrics Source

Decide whether the calc path will persist `fund_metrics`, or whether
baseline/report generation will move to the unified metrics layer.

This blocks:

- `1A.2` baseline automation
- `1C` automatic alert evaluation

### `0.1b` Post-Calc Trigger Point

Use calc-run completion, not dispatch state.

### `0.2` Baseline Idempotency

Ensure only one initial baseline can be created per publish/completion
lifecycle.

### `0.3` System Actor Strategy

Define how automation paths populate `createdBy` when no user context exists.

## Phase 1A.1: Variance Reporting

Split into three sub-phases.

### `1A.1a` Report Write-Contract Completion

Estimate: `3-5 days`

Work:

- fix `POST /variance-reports` so omitted baseline IDs resolve correctly
- map raw report rows to the client-facing report shape
- update tests that currently encode placeholder behavior or `baselineId: ''`

### `1A.1b` Report Reads And Page Wiring

Estimate: `3-5 days`

Work:

- implement GET list/detail
- wire the Reports tab to real data
- remove `mockVarianceData` and replace it with live top-level report data

### `1A.1c` Portfolio Variance Model Completion

Estimate: `1-2 weeks`

Work:

- implement current portfolio metrics
- implement company variances
- implement sector variances
- implement stage variances
- implement reserve variances
- implement pacing variances

This remains separate from the basic report contract.

## Phase 1A.2: Baseline Automation

Estimate: `5-7 days`

Depends on: `Phase 0`

Work:

- hook baseline creation to calc-run completion
- expand baseline writes so they persist the fields the comparison path already
  reads
- enforce idempotency
- ensure valid actor attribution

## Phase 1B: Dual-Forecast Dashboard

Estimate: `2-3 weeks`

Depends on: `1A`

Work:

- fix the hardcoded fund `1` bug in `DualForecastDashboard`
- wire `construction-actual-comparison` to real data
- wire `scenario-builder` to the chosen comparison surface
- replace placeholder charts in financial modeling
- implement drift calculation before exposing it

## Phase 1C: Alerting

Split into architecture first, scheduling second.

### `1C.1` Alert Evaluation Architecture

Estimate: `3-5 days`

Do not schedule `performCompleteVarianceAnalysis()` as-is.

Build either:

- a dedicated alert-evaluation path, or
- explicit report/alert dedupe plus retention rules

### `1C.2` Scheduling And Remaining-Capital UI

Estimate: `4-7 days`

Depends on: `1C.1`

Work:

- add provider/bootstrap wiring
- add remaining-capital-vs-plan display

## Phase 2: Scenario Comparison Consolidation

Estimate: `3-4 weeks`

Work:

- keep one active comparison surface
- decide whether the dormant `scenario_comparisons` layer becomes real or is
  deleted
- wire `sensitivity-analysis`
- un-quarantine backtesting tests

## Phase 0.5 / ADR Gate Before Phase 3

Estimate: `1-2 days`

Snapshot schema alignment remains a Time Machine prerequisite only.
It does not block variance work.

## Phase 3: Time Machine MVP

Estimate: `5-6 weeks`

Depends on: `Phase 0.5`

Work:

- resolve the restore API mismatch
- implement real snapshot creation
- define zero-snapshot bootstrap behavior
- keep restore disabled until the server route is real and mounted

## Phase 4: Fund-Backed Analytics Adapters And IRR Unification

Estimate: `4-6 weeks`

Work:

- add a fund-backed MOIC adapter or endpoint
- migrate both Actual Metrics and Performance calculations to canonical shared
  XIRR
- replace remaining sample-only analytics sections with real fund-backed data

## Phase 5: Collaboration / AI / Advanced Structures

Scope after Phases `0-4`.

## Updated Sequencing

1. Continue and finish `0.P`.
2. Complete `Phase 0` automation blockers.
3. Complete `1A.1a` report write contract.
4. Complete `1A.1b` report reads and page wiring.
5. Complete `1A.1c` portfolio variance model.
6. Complete `1A.2` baseline automation.
7. Complete `1B` dual-forecast.
8. Complete `1C.1` alert evaluation architecture.
9. Complete `1C.2` alert scheduling and remaining-capital UI.
10. Complete `Phase 2`.
11. Complete `Phase 0.5`, then `Phase 3`.
12. Complete `Phase 4`.

## Planning Rules

1. Do not let the metrics-source decision block independent UI and contract
   cleanup.
2. Do not treat variance reporting as one bucket.
   It is write contract first, then reads/UI, then portfolio-model completion.
3. Do not schedule alert evaluation until the architecture prevents unwanted
   report creation and duplicate alerts.
4. Do not let the snapshot ADR sit on the variance critical path.
   It blocks Time Machine only.

## Exit Criteria By Near-Term Slice

### `0.P`

- `alertsGenerated` contract remains green
- alert-rule passthrough remains persisted
- no TypeScript regression in baseline check

### `1A.1a`

- `POST /variance-reports` succeeds without a caller-supplied baseline when a
  default baseline exists
- response shape matches client expectations
- placeholder-focused tests are updated

### `1A.1b`

- GET list/detail return real report data
- Reports tab renders fetched report content
- overview visuals no longer rely on `mockVarianceData`

### `1C.1`

- automated alert evaluation path is defined without implicit report sprawl
- duplicate alert creation behavior is explicitly prevented or controlled

## Notes

- This plan reflects current validated repo state as of `2026-03-31`.
- It intentionally separates already-validated cleanup from unresolved
  architecture blockers.
- It intentionally keeps Time Machine ADR work off the variance delivery
  critical path.
