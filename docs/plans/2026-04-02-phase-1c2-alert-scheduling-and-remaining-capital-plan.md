---
last_updated: 2026-04-03
---

# Phase 1C.2 Alert Scheduling And Remaining-Capital UI Plan

## Context

Parent planning documents:

- `docs/plans/2026-03-31-variance-roadmap-revision.md`
- `docs/plans/2026-04-02-phase-1c1-alert-evaluation-implementation-strategy.md`

This plan turns the roadmap's thin `1C.2` entry into an implementation strategy
grounded in the current repo state as of `2026-04-02`.

`1C.1` left `1C.2` with a partially-finished evaluator seam. `1C.2` should now
wire that seam into automation, finish the replay-safety contract, and expose
the remaining-capital-vs-plan signal in the variance UI without reintroducing
report-first behavior.

## Goal

Deliver `1C.2` in two coordinated tracks:

1. automated alert evaluation
   - trigger `realtime` alert rules from calc-run completion
   - schedule `hourly`, `daily`, and `weekly` rule evaluation without using the
     manual `/variance-analysis` route
   - preserve duplicate safety and retryability

2. remaining-capital-vs-plan UI
   - surface actual remaining capital, planned remaining capital, and deployment
     delta on the variance page
   - reuse canonical metrics that already exist instead of creating a new
     bespoke endpoint

## Non-Goals

`1C.2` does not include:

- email/slack/webhook notification delivery
- trend/deviation/pattern rule engines
- a generalized background job framework for all domains
- replacing the existing variance dashboard contract wholesale
- redesigning reserve-planning or capital-allocation pages

## Actual Codebase Findings

These findings should drive the implementation order and file choices.

1. Calc-run completion automation already exists at startup.
   - `server/routes.ts` calls `registerCompletionHandlers()`
   - `server/services/calc-run-completion-handlers.ts` currently registers only
     metrics attribution and automated baseline creation

2. Completion handlers run in parallel and are retried by design.
   - `runCompletionHandlers()` in `server/services/calc-run-tracking.ts`
     executes registered handlers with `Promise.allSettled(...)`
   - `markCalcRunCompletedIfReady()` transitions `completedAt`, runs handlers,
     and re-drives them on later calls if the run is already completed
   - this makes calc-run completion the correct trigger for downstream work, but
     `1C.2` cannot rely on handler registration order for dependent steps

3. Calc-run baseline creation is idempotent, but not sequencing-safe as
   currently written.
   - `BaselineService.createBaseline()` returns the existing baseline when
     `fund_baselines.source_run_id` already exists
   - however, `createBaselineFromCalcRun()` reaches `getBaselineMetrics(...)`,
     which falls back from `sourceRunId` metrics to the latest fund-level row if
     attributed metrics do not exist yet
   - a parallel `createBaseline` handler can therefore persist a calc-run
     baseline from stale metrics before attribution completes

4. The dedicated evaluator now exists and is schedulable.
   - `VarianceAlertEvaluationService.evaluateVarianceAlerts()` in
     `server/services/variance-tracking.ts` supports `runId`, `baselineId`,
     `source`, and `persistAlerts`
   - it no longer requires a `variance_reports` row

5. Frequency semantics are persisted but not used.
   - `alert_rules.check_frequency` supports `realtime`, `hourly`, `daily`, and
     `weekly`
   - the current evaluator still loads all enabled rules regardless of frequency

6. Open-incident dedupe does not make scheduler or retry execution idempotent.
   - `AlertManagementService.upsertTriggeredAlertIncident()` upserts one open
     incident per `(fund, baseline, rule)` identity
   - but every repeated evaluation still increments `occurrenceCount` and
     updates `lastOccurrence`
   - `1C.2` therefore needs a persisted execution key per calc run or scheduler
     window; otherwise retries mutate alert history even when they do not create
     a second row

7. `lastTriggered` is not a scheduler cursor.
   - `alert_rules.last_triggered` is updated only when a rule actually triggers
   - it should not be reused as "last evaluated at" because non-triggering
     checks would disappear from scheduling state

8. The repo has a durable queue boundary but not an alert worker yet.
   - `job_outbox` exists in `shared/schema.ts`
   - `server/services/portfolio-optimization-service.ts` already uses the same
     table and lifecycle concepts
   - there is no alert-specific planner/processor today

9. `job_outbox` currently has no first-class dedupe key or atomic claim helper.
   - the table has `jobType`, `payload`, status, attempts, and timing fields
   - it does not expose a stable business-key column for multi-instance or
     repeated scheduler enqueue safety
   - existing service code lists pending rows and updates state separately, so
     the `1C.2` processor must define a real claim-and-finish protocol rather
     than assuming outbox rows are already safe to process concurrently

10. The variance page does not currently show remaining-capital-vs-plan.

- `client/src/pages/variance-tracking.tsx` uses `useVarianceDashboard()`,
  `useActiveAlerts()`, and `useVarianceReports()`
- it does not query the canonical unified metrics API

11. The data needed for the UI already exists in the canonical metrics layer.
    - `useFundMetrics()` in `client/src/hooks/useFundMetrics.ts` reads
      `/api/funds/:fundId/metrics`
    - `UnifiedFundMetrics` already exposes:
      - actual deployed/committed capital
      - actual uncalled capital
      - target deployment years and target fund size
      - deployment variance
      - pacing variance
      - projected reserve data

12. The current UI terminology needs tightening before the new card ships.
    - `UnifiedFundMetrics.actual.totalCommitted - actual.totalDeployed` is
      "remaining deployable capital", not the same thing as uncalled capital
    - `UnifiedFundMetrics.actual.totalUncalled` already represents dry powder
      remaining to be called
    - `1C.2` should name the card accordingly or show both values so users do
      not conflate deployment plan with capital call status

13. There is a legacy "calculated metrics" path in the dynamic header.
    - `client/src/components/layout/dynamic-fund-header.tsx` still uses a
      separate query path and its own `remainingCapital` shape
    - `1C.2` should not copy that older pattern into the variance page

14. The alert-rule authoring UI is still wider than the supported backend
    contract.
    - `client/src/pages/variance-tracking.tsx` still offers unsupported
      threshold alternatives (`trend`, `deviation`, `pattern`) and a free-form
      metric input
    - the shared/request contract only supports threshold rules over the fixed
      `alertMetricNameSchema`
    - `1C.2` should either align that authoring surface or explicitly gate it
      before broader automation rollout

15. The current test suite proves the trigger seam but not the new behavior.
    - `tests/unit/services/post-calc-trigger.test.ts` proves retryable handler
      execution
    - `tests/unit/services/calc-run-completion-handlers.test.ts` proves startup
      registration behavior
    - `tests/integration/phase0-migrated-postgres.test.ts` already provides a
      migrated-Postgres calc-run automation harness with repeated
      `markCalcRunCompletedIfReady(runId)` coverage
    - the future `1C.2`-specific automation test files named later in this plan
      do not exist yet, so they cannot be part of the "current state" validation
      command
    - no current test proves:
      - frequency-gated rule selection
      - calc-run-driven realtime alert evaluation
      - calc-run retry idempotency for the same run/rule/baseline identity
      - periodic outbox scheduling
      - periodic job retry idempotency for the same `(fund, frequency, window)`
      - missing-default-baseline skip behavior
      - remaining-capital view-model calculation on the variance page

## Architecture Decision

Use one new orchestration layer for `1C.2`.

Do not put scheduling, frequency filtering, and UI-driven summary assembly back
into `server/services/variance-tracking.ts`. That file already owns baseline
management, report generation, alert persistence, and the `1C.1` evaluator.

Instead:

- keep rule evaluation and incident persistence inside
  `VarianceAlertEvaluationService`
- add a new automation/orchestration service for:
  - sequential calc-run completion automation
  - frequency-based rule selection
  - outbox enqueue/claim/process behavior
- keep the remaining-capital UI on the client, backed by the canonical metrics
  hook

### Precondition: Authoring Parity

Before broadening automation coverage, align the alert-rule authoring UI with
the supported `1C.1` contract.

At minimum:

- constrain the rule-type picker to `threshold`
- replace the free-form metric input with the supported metric catalog
- use the existing shadcn `Select` component rather than another free-text field
- export a shared metric-options constant and label map from
  `shared/variance-validation.ts` so the UI is driven by the same source as the
  server contract
- show `secondaryThreshold` only when `operator === 'between'`
- render inline validation/help text for unsupported combinations instead of
  surfacing only a generic 400 after submit
- keep unsupported future-rule concepts visibly out of the `1C.2` rollout path

## Implementation Strategy

### Track A: Realtime Calc-Run Alert Automation

#### Outcome

Every calc run that reaches authoritative completion runs one sequential
automation step that:

1. ensures calc-run-attributed metrics exist for that run
2. ensures the calc-run milestone baseline exists from `sourceRunId`
3. evaluates only `realtime` alert rules against that run/baseline pair

No `variance_reports` row is created by this path.

#### Files

- new: `server/services/variance-alert-automation.ts`
- update: `server/services/calc-run-completion-handlers.ts`
- update: `server/services/variance-alert-evaluation.ts`
- update: `tests/unit/services/calc-run-completion-handlers.test.ts`
- update: `tests/unit/services/post-calc-trigger.test.ts`
- update: `tests/unit/services/variance-tracking.test.ts`

#### Service Shape

Add a dedicated automation service, for example:

```ts
export class VarianceAlertAutomationService {
  async handleCalcRunCompletion(params: {
    runId: number;
    fundId: number;
    configId: number;
    configVersion: number;
  }): Promise<void>;
}
```

Responsibilities:

- ensure attributed metrics exist by calling
  `ensureAttributedFundMetricsForCalcRun(runId)`
- ensure the calc-run baseline exists by calling
  `baselineService.createBaselineFromCalcRun(runId)`
- select only enabled `realtime` rules for the fund
- call `evaluateVarianceAlerts()` with:
  - `fundId`
  - `baselineId`
  - `runId`
  - `source: 'calc_run_completion'`
  - `persistAlerts: true`
  - an execution key for this calc run

#### Required `1C.1` Follow-On Change

`VarianceAlertEvaluationService.evaluateVarianceAlerts()` should accept both a
rule subset and an execution-key seam so `1C.2` can evaluate only the intended
rules and make retried executions side-effect idempotent.

Preferred shape:

```ts
evaluateVarianceAlerts({
  fundId,
  baselineId,
  runId,
  source,
  persistAlerts,
  rules,
  executionKey,
});
```

This avoids re-querying all enabled rules, makes frequency gating explicit, and
gives alert persistence a concrete key for retry safety.

Canonical per-rule execution keys:

- calc-run path: `(runId, baselineId, ruleId)`
- scheduler path: `(fundId, baselineId, frequency, windowStart, ruleId)`

Lock the persistence strategy now:

- use a dedicated alert-evaluation ledger table keyed by canonical
  `execution_key`
- do not overload `performance_alerts` with only a single "last execution" field
  because that is brittle for out-of-order replays and later baseline/window
  reconciliation
- the evaluator should derive one per-rule key and write the ledger row in the
  same transaction as incident mutation

Recommended keys:

- `calc:{runId}:{baselineId}:{ruleId}`
- `sched:{fundId}:{baselineId}:{frequency}:{windowStartIso}:{ruleId}`

Recommended ledger shape:

```ts
type AlertEvaluationExecution = {
  executionKey: string;
  source: 'calc_run_completion' | 'scheduler';
  fundId: number;
  baselineId: string;
  ruleId: string;
  runId?: number;
  frequency?: 'hourly' | 'daily' | 'weekly';
  windowStart?: string;
  appliedAlertId?: string;
  createdAt: Date;
};
```

#### Completion Handler Wiring

Do not rely on handler registration order.

`runCompletionHandlers()` executes handlers concurrently, so dependent alert
automation should be registered as one handler that performs:

1. `ensureAttributedFundMetricsForCalcRun(runId)`
2. `createBaselineFromCalcRun(runId)`
3. `evaluateRealtimeAlerts`

Make the cutover explicit:

- stop registering the standalone `attributeMetrics` and `createBaseline`
  handlers once the new variance-automation pipeline handler exists
- register one composite handler for the dependent variance steps
- do not leave a transition window where all three handlers run in parallel

This preserves the current top-level retry model because `runCompletionHandlers`
still uses `Promise.allSettled(...)` across handlers. The change is only that
the variance-specific sub-steps become one sequential pipeline instead of two
independent handlers that can race each other.

Within that sequence, `createBaselineFromCalcRun(runId)` should fail and retry
when attributed metrics are missing for `sourceRunId`; it should not silently
fall back to the latest unrelated fund-metrics row for the calc-run path.

Per-step timeout policy for the sequential pipeline:

- `ensureAttributedFundMetricsForCalcRun`: `30s`
- `createBaselineFromCalcRun`: `30s`
- `evaluateRealtimeAlerts`: `30s`

If any step times out or throws:

- fail the composite handler invocation
- log the timed-out step explicitly
- rely on the next `markCalcRunCompletedIfReady(runId)` retry to re-drive the
  full pipeline

Concrete frequency-gated rule query for the calc-run path:

```ts
db.query.alertRules.findMany({
  where: and(
    eq(alertRules.fundId, fundId),
    eq(alertRules.isEnabled, true),
    eq(alertRules.checkFrequency, 'realtime')
  ),
});
```

That preserves the current retry model:

- if alert evaluation fails after completion, the handler error still bubbles
- the next `markCalcRunCompletedIfReady(runId)` call re-drives the same
  idempotent automation
- that retry must not increment alert occurrences for the same run identity

### Track B: Scheduled Hourly/Daily/Weekly Alert Evaluation

#### Outcome

Non-realtime rules are scheduled without using HTTP routes and without creating
variance reports.

Scheduling semantics:

- `realtime`
  - calc-run completion only
- `hourly`
  - evaluate once per fund per hour window
- `daily`
  - evaluate once per fund per day window
- `weekly`
  - evaluate once per fund per week window

#### Baseline And Metric Source

For periodic scheduling:

- baseline: the fund's current default baseline
- metric source: latest metrics at or before scheduler execution time
- evaluator source: `'scheduler'`
- eligibility: only funds with at least one enabled non-realtime rule and an
  active default baseline should be enqueued

This intentionally differs from calc-run completion:

- calc-run completion = milestone baseline + run-attributed metrics
- scheduler = default baseline + current metrics

This also inherits `1C.1` baseline-scoped incident semantics:

- if the fund's default baseline rotates, scheduled evaluation under the new
  baseline writes against the new `(fundId, baselineId, ruleId)` incident
  identity
- older baseline-scoped incidents remain open until manually resolved or a later
  auto-resolution phase explicitly reconciles them

#### Files

- new: `server/services/variance-alert-automation.ts`
- update: `shared/schema.ts`
- add migration for `job_outbox` dedupe support
- update: `server/routes.ts`
- add tests around scheduling

#### Outbox Strategy

Use `job_outbox` as the durable boundary for periodic evaluation jobs.

Add a nullable `dedupeKey` column plus a unique index scoped to
`(job_type, dedupe_key)` so scheduler planners running in more than one process
cannot enqueue the same alert-evaluation window twice.

Do not stop at enqueue dedupe.

The processor also needs an atomic claim protocol so two app instances cannot
pick up the same pending row concurrently. Preferred shape:

- claim via one DB statement/transaction that moves rows from `pending` to
  `processing`
- use a `FOR UPDATE SKIP LOCKED`-style claim or equivalent
- define stale-processing recovery so abandoned rows can return to `pending`

Stale-processing policy for `1C.2`:

- a `processing` job is considered stale when
  `processing_at < now() - 10 minutes`
- run a stale sweep every `5 minutes`
- `1C.2` does not add heartbeat writes; these jobs should complete in seconds,
  and the per-step `30s` timeout on realtime automation plus small scheduled
  batches keeps a `10 minute` lease conservative
- if a stale row has `attemptCount >= maxAttempts`, mark it `failed`
- otherwise reset it to `pending`, clear `processingAt`, set `nextRunAt = now`,
  and retain an error message explaining that the processing lease expired

Suggested payload:

```ts
type VarianceAlertEvaluationJobPayload = {
  kind: 'variance_alert_evaluation';
  fundId: number;
  frequency: 'hourly' | 'daily' | 'weekly';
  windowStart: string;
  windowEnd: string;
};
```

Suggested dedupe key:

```txt
variance-alert:{fundId}:{frequency}:{windowStartIso}
```

Suggested terminal skip semantics:

- if a fund has no default baseline when planning runs, do not enqueue a job
- if a default baseline disappears between enqueue and execution, mark the job
  terminal without retry churn and record a diagnostic message
- if no enabled rules remain for that frequency at execution time, also mark the
  job terminal without retry churn

Concrete frequency-gated rule query for the scheduler path:

```ts
db.query.alertRules.findMany({
  where: and(
    eq(alertRules.fundId, fundId),
    eq(alertRules.isEnabled, true),
    eq(alertRules.checkFrequency, frequency)
  ),
});
```

#### Planner / Processor Split

Inside `VarianceAlertAutomationService`, add two bounded responsibilities:

1. planner
   - find funds with enabled non-realtime rules
   - compute the current due window per frequency
   - enqueue one outbox job per `(fund, frequency, window)`

2. processor
   - claim pending `variance_alert_evaluation` outbox jobs
   - evaluate only rules matching the job frequency
   - evaluate and finish the job with one explicit idempotency strategy for the
     same scheduler window
   - mark the outbox row completed/failed/cancelled with retry metadata

Crash-safety requirement:

- enqueue dedupe alone is insufficient
- if a processor evaluates alerts and then crashes before updating the outbox
  row, a retry of the same job/window must not increment `occurrenceCount` for
  the same alert identity
- `1C.2` should therefore wrap scheduled alert persistence, ledger insertion,
  and outbox completion in one DB transaction whenever practical
- if the outbox completion update must occur outside that transaction boundary,
  the execution ledger remains the alert-layer arbiter so replayed jobs no-op
  instead of incrementing `occurrenceCount`

Do not build a brand-new worker system for `1C.2`.

Use a narrow in-process bootstrap module that:

- exposes explicit `start()` / `stop()` lifecycle methods
- can enable planner and processor loops independently
- avoids auto-starting background intervals in test mode unless a test
  explicitly opts in
- periodically enqueues due jobs
- periodically claims/executes pending alert jobs
- mirrors the existing `job_outbox` lifecycle already used elsewhere

This keeps the slice bounded while still using a durable DB-backed queue.

#### Observability And Health

`1C.2` should ship with first-pass operational visibility.

Required structured log events:

- `alert.calc_run.started`
- `alert.calc_run.completed`
- `alert.calc_run.failed`
- `alert.planner.enqueued`
- `alert.planner.skipped`
- `alert.processor.claimed`
- `alert.processor.completed`
- `alert.processor.failed`
- `alert.processor.recovered_stale`

Required counters / gauges:

- jobs enqueued per frequency
- jobs claimed per frequency
- jobs completed per frequency
- jobs failed per frequency
- stale jobs recovered
- last successful planner timestamp
- last successful processor timestamp

Required health seam:

- expose an internal health surface, for example
  `GET /api/internal/alert-automation/health`
- include planner enabled/disabled state, processor enabled/disabled state, last
  successful planner run, last successful processor run, and current stale-job
  count

#### Bootstrap Wiring

Add a startup registration function, for example:

```ts
registerVarianceAlertAutomation();
```

Call it from `server/routes.ts` next to `registerCompletionHandlers()`, but have
it return a handle that can be disabled or torn down in tests and single-purpose
runtimes.

That matches the current app wiring pattern and keeps alert scheduling behind a
single bootstrap seam.

### Track C: Remaining-Capital-Vs-Plan UI

#### Outcome

The variance overview should surface:

- remaining deployable capital
- planned deployable capital as of today
- delta vs deployment plan
- uncalled capital as supporting context
- deployment status context

#### Files

- update: `client/src/pages/variance-tracking.tsx`
- reuse: `client/src/hooks/useFundMetrics.ts`
- new helper: `client/src/lib/variance-remaining-capital.ts`
- add tests for the helper under the existing client/lib test area

#### Data Source

Use `useFundMetrics()`.

Do not add a new variance-specific endpoint for this card in `1C.2`.

The canonical inputs are already present:

- actual:
  - `metrics.actual.totalCommitted`
  - `metrics.actual.totalDeployed`
  - `metrics.actual.totalUncalled`
- target/plan:
  - `metrics.target.targetFundSize`
  - `metrics.variance.deploymentVariance.target`
- contextual labels:
  - `metrics.variance.deploymentVariance.status`
  - `metrics.variance.paceVariance`
  - `metrics.projected.unallocatedReserves`

#### Derived View Model

Add a small pure helper so the page is not full of financial math:

```ts
type RemainingCapitalPlanSummary = {
  actualRemainingDeployableCapital: number;
  plannedRemainingDeployableCapital: number;
  delta: number;
  uncalledCapital: number;
  status: 'ahead' | 'on-track' | 'behind';
  reserveContext?: number;
};
```

Suggested formulas:

- `actualRemainingDeployableCapital = max(actual.totalCommitted - actual.totalDeployed, 0)`
- `plannedRemainingDeployableCapital = max(target.targetFundSize - deploymentVariance.target, 0)`
- `delta = actualRemainingDeployableCapital - plannedRemainingDeployableCapital`
- `uncalledCapital = max(actual.totalUncalled, 0)`
- `status = deploymentVariance.status`

Use `paceVariance` and `projected.unallocatedReserves` as supporting context,
not as the primary card value.

Query-cost rule:

- the primary card math only needs `actual`, `target`, and
  `variance.deploymentVariance`
- if the first implementation does not display reserve/pacing support, prefer
  `useFundMetrics({ skipProjections: true })` to avoid paying for full
  projection engines
- if the UI does display `paceVariance` or `projected.unallocatedReserves`,
  fetch full metrics and respect `_status` so fallback zeros are not presented
  as trustworthy reserve insight

Labeling rule:

- do not label `actual.totalCommitted - actual.totalDeployed` as generic
  "remaining capital" without qualification
- in this slice it should be presented as deployable capital vs plan, with
  uncalled capital shown separately if space allows

#### UI Placement

Add the card to the variance overview near the top-level summary cards, not deep
inside report detail.

Reason:

- the roadmap names this as `1C.2` workspace-level signal
- the current overview already contains summary stats and recent alerts
- this avoids forcing users into a report-first flow just to understand capital
  position against plan

Page-state rule:

- because `useFundMetrics()` can return partial/fallback quality metadata, the
  card should tolerate missing projection context and degrade gracefully rather
  than block the whole variance overview

## Contract Changes

### Server

No new public alert-evaluation route is required for `1C.2`.

The public surface should remain:

- calc-run completion for automated `realtime` evaluation
- background scheduler for periodic evaluation
- existing alerts read/acknowledge/resolve routes

### Database

Preferred minimal schema change:

- add `job_outbox.dedupe_key text null`
- add unique index on `(job_type, dedupe_key)` where `dedupe_key` is not null
- add a dedicated `alert_evaluation_executions` table keyed by `execution_key`
  for replay-safe alert mutation

This is the cleanest way to make scheduled enqueue deterministic across retries
and multiple app instances.

Idempotency contract:

- `1C.2` uses the dedicated `alert_evaluation_executions` ledger as the
  replay-safe alert-write arbiter
- duplicate `execution_key` inserts must no-op the alert mutation path
- this decision is locked and is not an implementation-time fork anymore

### Client

No new fetch contract is required if the page reads from `useFundMetrics()`.

If the page later needs to reduce query count, that can be a follow-on
consolidation to the variance dashboard response, not a `1C.2` prerequisite.

## Detailed Delivery Slices

### Slice 0: Alert Rule Authoring Parity

- update the variance alert-rule UI to match the supported `threshold`-only
  backend contract
- replace free-form metric entry with a shared-options shadcn `Select`
- export the supported metric options and labels from
  `shared/variance-validation.ts`
- show `secondaryThreshold` conditionally when `operator === 'between'`
- keep user-facing labels explicit enough that a fund manager does not have to
  guess whether `totalValue` means a dollar delta or percentage delta
- prevent `1C.2` rollout from depending on unsupported rule types

This is the literal first delivery in `1C.2`. Do not turn on automated alert
evaluation until it is shipped.

### Slice 0.5: Calc-Run Handler Cutover

- replace the legacy parallel `attributeMetrics` / `createBaseline` handler
  registration with one sequential variance-automation pipeline handler
- add per-step `30s` timeouts and explicit step-level logging
- prove that no deployment state exists where the old parallel handlers and the
  new composite handler all run together
- keep unrelated calc-run completion handlers unaffected

### Slice 1: Frequency-Gated Automation Service

- create `VarianceAlertAutomationService`
- add rule-subset and execution-key support to `VarianceAlertEvaluationService`
- add one sequential calc-run completion orchestration step for `realtime` rules
- tighten calc-run baseline creation so `sourceRunId` paths require attributed
  metrics instead of silently falling back
- add the `alert_evaluation_executions` ledger and prove duplicate-safe retries
  for repeated completion calls without incrementing occurrences for the same
  run identity

### Slice 2: Outbox-Backed Periodic Scheduling

- add `job_outbox` dedupe support
- add atomic claim + stale-processing recovery for `variance_alert_evaluation`
  jobs
- lock the stale lease to `10 minutes` with a `5 minute` recovery sweep
- add planner + processor loops for `hourly`, `daily`, and `weekly`
- wire bootstrap at startup
- add structured logging, counters, and internal health reporting for planner
  and processor loops
- define terminal skip behavior for missing default baselines / no matching
  rules
- prove due-window dedupe and retry behavior without duplicate alert mutations

### Slice 3: Remaining-Capital UI

- add the pure view-model helper
- wire `useFundMetrics()` into the variance page
- add the overview card
- add concise explanatory copy/tooltips so deployable capital and uncalled
  capital are not conflated
- prove the helper math and page states (loading, data, fallback)

## Known Tradeoffs And Follow-On Debt

1. `1C.2` does not add leader election for planner loops.
   - correctness comes from enqueue dedupe plus atomic claim
   - duplicate planner wakeups across app instances are accepted at current
     scale
   - revisit leader election only if multi-instance planner churn becomes
     operationally meaningful

2. `1C.2` does not auto-resolve superseded baseline-scoped incidents.
   - baseline rotation can still accumulate older open incidents
   - the short-term mitigation is truthful status/read behavior plus better
     filtering and resolution UX
   - a follow-on lifecycle slice should decide whether old-baseline incidents
     are manually filtered, automatically superseded, or explicitly resolved

3. `1C.2` keeps the scheduler in-process.
   - this is acceptable only because `job_outbox` is the durable boundary and
     the work is bounded
   - if background workload or deployment topology grows materially, move
     planner and processor ownership into a dedicated worker process rather than
     accreting more interval logic in the web app

## Test Plan

### Server Tests

- `tests/unit/api/variance-tracking-api.test.ts`
  - alert-rule authoring rejects unsupported rule types/metrics from the UI
- `tests/unit/services/calc-run-completion-handlers.test.ts`
  - registers the new composite variance-automation handler once
  - no longer registers the legacy parallel `attributeMetrics` and
    `createBaseline` handlers after cutover
- `tests/unit/services/post-calc-trigger.test.ts`
  - retries alert automation after prior failure
  - still re-drives after `completedAt` was already set
- new `tests/unit/services/variance-alert-automation.test.ts`
  - realtime rule selection only
  - periodic rule selection only
  - default-baseline scheduler evaluation
  - calc-run baseline + `runId` evaluation
  - calc-run execution key prevents duplicate occurrence inflation
  - stale execution key conflict no-ops alert mutation
  - outbox dedupe key behavior
  - stale-processing sweep resets abandoned rows after the configured lease
  - per-step timeout fails the composite calc-run pipeline cleanly
  - scheduler health state reflects last success / failure timestamps
  - missing-default-baseline skip behavior
- `tests/unit/services/variance-tracking.test.ts`
  - evaluator accepts filtered rules without evaluating all enabled rules
  - evaluator/persistence no-op repeated execution keys for the same run/window

### Integration Tests

Add at least one migrated-Postgres proof, not just mocks.

Preferred first step:

- extend `tests/integration/phase0-migrated-postgres.test.ts` with `1C.2`
  assertions, because that harness already provisions calc runs, authoritative
  snapshots, attributed metrics, and automated baselines against migrated
  Postgres

Then add a dedicated file only if the new scheduler coverage would make the
existing harness unwieldy.

Required integration assertions:

- duplicate planner attempts create one outbox row per
  `(fund, frequency, window)`
- duplicate processor attempts do not double-apply the same scheduler window
- repeated `markCalcRunCompletedIfReady(runId)` calls do not mutate alert
  history twice for the same realtime execution key
- stale `processing` rows are recoverable without losing replay safety at the
  alert layer

### Client Tests

Prefer a pure-helper test over heavy page rendering for the first pass.

- new `client/src/lib/__tests__/variance-remaining-capital.test.ts`
  - deployable-capital vs plan math
  - uncalled-capital passthrough
  - negative delta
  - zero-target edge cases
  - pace/deployment status passthrough

If page-render tests are added later, keep them bounded to the overview card
rather than snapshotting the whole variance page.

## Exit Criteria

`1C.2` is complete when all of the following are true:

- alert-rule authoring parity ships first and the UI no longer relies on
  free-text metric names or unsupported rule-type choices
- calc-run completion has cut over from the legacy parallel variance handlers to
  one sequential variance-automation pipeline
- calc-run completion evaluates `realtime` rules without creating
  `variance_reports` rows
- repeated completion calls do not create duplicate alert incidents or duplicate
  occurrence inflation for the same run/baseline/rule identity
- replay safety is enforced by the dedicated `alert_evaluation_executions`
  ledger, not by best-effort in-memory logic
- `hourly`, `daily`, and `weekly` rules are scheduled through `job_outbox`
  rather than ad hoc route calls
- scheduled jobs are dedupe-safe per `(fund, frequency, window)`
- scheduled job retries do not re-apply the same alert side effects for the same
  `(fund, baseline, frequency, window, rule)` identity
- stale `processing` jobs recover on the documented lease/sweep policy
- scheduled evaluation uses the default baseline and current metrics
- funds without a usable default baseline do not churn the scheduler retry path
- planner and processor loops emit basic health/observability signals
- the variance overview shows deployable-capital-vs-plan from canonical unified
  metrics, with uncalled capital kept distinct
- focused tests cover realtime automation, periodic scheduling, and remaining
  capital derivation

## Suggested Validation Commands

Current sandbox-validated command:

```text
npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/services/post-calc-trigger.test.ts tests/unit/services/calc-run-completion-handlers.test.ts tests/unit/services/variance-tracking.test.ts
```

Planned future command once `1C.2` tests land:

```text
npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/services/post-calc-trigger.test.ts tests/unit/services/calc-run-completion-handlers.test.ts tests/unit/services/variance-tracking.test.ts tests/unit/services/variance-alert-automation.test.ts client/src/lib/__tests__/variance-remaining-capital.test.ts
```

And once the migrated-Postgres `1C.2` coverage lands:

```text
npx vitest run tests/integration/phase0-migrated-postgres.test.ts
```
