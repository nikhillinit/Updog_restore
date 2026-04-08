---
status: HISTORICAL-FRAMEWORK
last_updated: 2026-04-05
supersedes: []
superseded_in_part_by:
  - docs/plans/2026-04-03-phase-1a2-baseline-automation-hardening-validated.md
  - docs/plans/2026-04-01-variance-phase1a1c-implementation-plan.md
  - docs/plans/2026-04-02-phase-1c1-alert-evaluation-implementation-strategy.md
  - docs/plans/2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md
  - docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md
  - docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md
depends_on:
  - docs/plans/2026-03-26-development-spec-set.md
  - docs/plans/2026-03-27-secondary-surface-decisions.md
validated_by:
  - npm run baseline:check
  - npx vitest run tests/unit/api/variance-tracking-api.test.ts
    tests/unit/services/variance-tracking.test.ts
  - npx vitest run tests/unit/services/post-calc-trigger.test.ts
---

# Revised Production Order: Variance, Baselines, Alerts, Scenario Consolidation, Time Machine, And Analytics

## Current Status (2026-04-05 reconciliation)

**This document is retained as the sequencing framework. Individual phase
statuses below are out of date:**

- **Phase 0 Foundation Decisions**: COMPLETE. The calc-run completion pipeline,
  attributed `fund_metrics`, baseline idempotency, and system actor seeding are
  shipped. See `2026-04-03-phase-1a2-baseline-automation-hardening-validated.md`
  for the active hardening work that sits on top.
- **Phase 0.P Cleanup**: settled on main as of 2026-04-08. The remaining items
  flagged below (`_reportsData`, `mockVarianceData`, restore UI) and the
  Worktrack A/B of the original strategy doc are no longer present in
  `client/src` — see
  `docs/archive/2026-q2/2026-04-05-todo-report-remediation-strategy.md`
  (archived 2026-04-08 per
  `.planning/phases/03-todo-report-remediation/03-CONTEXT.md` D-01
  close-via-archive).
- **Phase 1A.1**: implementation recorded in
  `2026-04-01-variance-phase1a1c-implementation-plan.md`.
- **Phase 1A.2**: hardening in
  `2026-04-03-phase-1a2-baseline-automation-hardening-validated.md`.
- **Phase 1B**: PR queue in `2026-04-03-phase-1b-single-owner-pr-queue.md`.
- **Phase 1C.1 / 1C.2**: detailed plans in `2026-04-02-phase-1c1-*` and
  `2026-04-02-phase-1c2-*`.
- **Phase 2 Scenario Consolidation**: plan in
  `2026-04-02-phase-2-scenario-comparison-consolidation-plan.md` with slice 3/4
  in the `2026-04-03-phase-2-slice-*` docs.

Read this document for sequencing rules, planning principles, and exit criteria.
Read the per-phase dated plans above for current execution state.

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

1. `Phase 0` blocks automation, not all cleanup. Baseline automation and
   automatic alert evaluation still depend on an authoritative metrics-source
   decision.
2. `Phase 1A.1a` must include `POST /variance-reports` repair. The write path
   still does not safely resolve a default baseline and still returns a raw row
   shape.
3. `Phase 1C.1` must happen before any scheduler work. Scheduling
   `performCompleteVarianceAnalysis()` as-is would create ad hoc reports and
   duplicateable alerts, not just evaluate alert rules.
4. `Phase 0.5` is a Time Machine prerequisite only. The snapshot ADR should not
   block variance and baseline work.

## Phase 0: Foundation Decisions

Hard blockers for automation only. The service/schema slice is still roughly
`3-5 days`, but production hardening may extend beyond that once migration and
retry semantics are included.

### `0.1a` Fund-Level KPI Attribution

Keep fund-level KPIs in `fund_metrics`, but add calc-run attribution there via
`runId`, `configId`, and `configVersion`. Thread those fields through the actual
`fundMetrics` writer path instead of deferring attribution to a later step.

Sandbox validation correction:

- there is no existing calc-run-owned `fund_metrics` write path in the current
  repo, so Phase `0.1a` must include a new persistence step rather than only
  type or schema changes

This blocks:

- `1A.2` baseline automation
- `1C` automatic alert evaluation

### `0.1b` Post-Calc Trigger Point

Use calc-run completion, not dispatch state, and fire downstream work only on
the actual `completedAt NULL -> value` transition.

### `0.2` Baseline Idempotency

Key automation idempotency to calc-run identity with
`fund_baselines.sourceRunId` and enforce one active default baseline per fund
with a partial unique index.

### `0.3` System Actor Strategy

Seed and reserve a positive system user ID so automation paths can populate
`createdBy` without violating `positiveInt()` validation.

Sandbox validation correction:

- the current feasibility implementation uses the bootstrap positive user slot
  for automation wiring; production rollout still needs a dedicated seeded
  system user before treating the actor ID as truly reserved

### Phase 0 Approval Gate

Must fix before approval:

- unify the migration path so the authoritative schema, `db:push`, and
  testcontainer/integration migrations all use the same migration stream
- persist fund-level KPI attribution from calc-run-owned or otherwise immutable
  calc context; do not label a later recomputation from mutable current fund
  state as belonging to the completed run
- make post-completion automation retryable after `completedAt` is set; a single
  downstream failure must not leave the run permanently "complete but missing
  baseline/metrics"
- ensure baseline uniqueness is atomic and either make baseline source reads
  transaction-scoped as well or narrow the design claim to uniqueness-only
  atomicity
- add at least one migrated-Postgres integration test that proves repeated
  completion calls produce one attributed metrics lineage and one automated
  baseline for the same calc run

Can defer until after Phase 0 approval:

- broader system-actor hardening beyond reserved ID/username invariants
- wording and estimation cleanup in follow-on roadmap sections
- additional unit-test expansion beyond the required integration proof

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

Detailed plan:

- `docs/plans/2026-04-03-phase-1b-single-owner-pr-queue.md`

Work:

- fix the hardcoded fund `1` bug in `DualForecastDashboard`
- wire `construction-actual-comparison` to real data
- wire `scenario-builder` to the chosen comparison surface
- replace placeholder charts in financial modeling
- implement drift calculation before exposing it

## Phase 1C: Alerting

Split into architecture first, scheduling second.

Detailed `1C.1` strategy:

- `docs/plans/2026-04-02-phase-1c1-alert-evaluation-implementation-strategy.md`

### `1C.1` Alert Evaluation Architecture

Estimate: `3-5 days`

Do not schedule `performCompleteVarianceAnalysis()` as-is.

Build:

- refine and extract the existing alert-evaluation path
- fund-owned baseline resolution for report and alert entrypoints
- run-aware metric sourcing when calc-run context is present
- database-backed duplicate protection for open incidents, not only service
  logic
- explicit baseline-scoped incident semantics so default-baseline rotation does
  not silently rewrite old alerts
- mandatory extraction to `server/services/variance-alert-evaluation.ts`
- truthful rule/query contracts for `/variance-analysis`, `/alerts`, and
  alert-rule creation

Sandbox validation revision:

- the focused variance and post-calc test suites are green, but they do not yet
  cover foreign baseline rejection, run-attributed evaluation, or alert-query
  `status` handling, so those checks remain part of the `1C.1` exit bar

### `1C.2` Scheduling And Remaining-Capital UI

Estimate: `4-7 days`

Depends on: `1C.1`

Detailed plan:

- `docs/plans/2026-04-02-phase-1c2-alert-scheduling-and-remaining-capital-plan.md`

Work:

- ship alert-rule authoring parity before automation rollout
- cut over calc-run completion from parallel variance handlers to one sequential
  variance-automation pipeline for `realtime` rules
- lock replay safety to a dedicated alert-evaluation execution ledger
- add outbox-backed scheduling with atomic claim / retry-safe processing for
  `hourly` / `daily` / `weekly` alert rules
- add provider/bootstrap wiring for lifecycle-safe planner + processor startup,
  stale-job recovery, and basic scheduler observability
- add deployable-capital-vs-plan display on the variance page, keeping uncalled
  capital distinct

Potential immediate follow-on after `1C.2` if baseline-scoped incident noise is
material:

- lifecycle cleanup / current-baseline filtering for older open incidents

## Phase 2: Scenario Comparison Consolidation

Estimate: `3-4 weeks`

Detailed plan:

- `docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`

Work:

- keep one active comparison surface
- keep the shipped `/sensitivity-analysis` Monte Carlo surface as the canonical
  routed comparison workspace
- keep the shared backtesting workspace under `/sensitivity-analysis` as the
  canonical UI shell for the live Monte Carlo tab
- remove the dead scenario-comparison runtime path and narrow the repo to one
  truthful comparison backend
- decide whether the dormant saved-comparison schema family
  (`scenario_comparisons`, `comparison_configurations`,
  `comparison_access_history`) is deleted or placed on a formal deprecation path
- replace the env-gated/quarantined backtesting integration story with
  deterministic live-contract coverage

## Phase 0.5 / ADR Gate Before Phase 3

Estimate: `1-2 days`

Snapshot schema alignment remains a Time Machine prerequisite only. It does not
block variance work.

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
2. Do not treat variance reporting as one bucket. It is write contract first,
   then reads/UI, then portfolio-model completion.
3. Do not schedule alert evaluation until the architecture prevents unwanted
   report creation and duplicate alerts.
4. Do not let the snapshot ADR sit on the variance critical path. It blocks Time
   Machine only.

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
- evaluator inputs are fund-scoped and can bind to calc-run-attributed metrics
  when run context exists
- duplicate alert creation behavior is prevented by explicit DB guardrails and
  DB-native upsert semantics
- the evaluator has been extracted to a dedicated alert-evaluation module and is
  no longer a growing branch inside `variance-tracking.ts`
- alert-rule, manual-analysis, and alerts-query contracts are truthful and
  covered by focused tests

### `1C.2`

- alert-rule authoring parity ships before automation rollout
- calc-run completion uses one sequential variance-automation pipeline instead
  of parallel variance handlers that can race
- replay safety is enforced by a dedicated alert-evaluation execution ledger
- scheduled alert jobs are dedupe-safe, claim-safe, and recover stale
  `processing` rows on a documented lease policy
- planner and processor loops emit basic health/observability signals
- the variance overview shows deployable-capital-vs-plan with uncalled capital
  kept distinct

## Notes

- This plan reflects current validated repo state as of `2026-04-02`.
- It intentionally separates already-validated cleanup from unresolved
  architecture blockers.
- It intentionally keeps Time Machine ADR work off the variance delivery
  critical path.
