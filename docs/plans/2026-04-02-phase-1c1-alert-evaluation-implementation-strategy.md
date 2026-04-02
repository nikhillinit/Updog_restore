# Phase 1C.1 Alert Evaluation Implementation Strategy

## Context

Parent planning documents:

- `docs/plans/2026-03-31-variance-roadmap-revision.md`
- `docs/plans/2026-04-01-variance-phase1a1c-implementation-plan.md`

This strategy locks the currently-open `1C.1` architecture question to the
actual repo state as of `2026-04-02`.

The goal is to deliver a standalone alert-evaluation path that can be scheduled
later without creating ad hoc variance reports or duplicating alert incidents.

## Goal

Implement a dedicated, idempotent alert-evaluation architecture for variance
rules that:

- evaluates enabled rules without writing a `variance_reports` row
- resolves baselines through fund-owned lookup instead of bare baseline IDs
- can evaluate against calc-run-attributed metrics when automation provides a
  `runId`
- persists alert incidents with real rule, threshold, baseline, and occurrence
  metadata
- enforces suppression and duplicate control in the service layer
- leaves manual report generation available for human-triggered analysis
- creates a clean seam for `1C.2` calc-run completion and scheduler wiring

## Sandbox Validation

Validated against the current sandbox implementation on `2026-04-02` with:

- `npx vitest run tests/unit/api/variance-tracking-api.test.ts tests/unit/services/variance-tracking.test.ts tests/unit/services/post-calc-trigger.test.ts`

Result:

- `141` tests passed

What that suite confirms:

- the current manual variance-analysis flow still routes through
  `performCompleteVarianceAnalysis()`
- the calc-run completion path is retried and can safely re-drive idempotent
  downstream work
- the current variance API and service tests still encode the report-first alert
  workflow

What it does not currently prove:

- foreign baseline IDs are rejected everywhere before evaluation
- automated evaluation can bind to calc-run-attributed metrics by `runId`
- `/api/funds/:id/alerts` honors its advertised `status` query parameter
- `includeAlertGeneration` and unsupported alert-rule fields are actually
  enforced rather than silently ignored

## Actual Codebase Findings

These findings are the basis for the strategy and should not be abstracted away
in the implementation.

1. `performCompleteVarianceAnalysis()` is not schedulable as-is. It resolves a
   baseline, calls `generateVarianceReport()` with `reportType: 'ad_hoc'`, then
   inserts alert rows from `report.alertsTriggered`. Relevant code:
   - `server/services/variance-tracking.ts`

2. `generateVarianceReport()` already mixes two concerns:
   - compute the live variance snapshot
   - persist a variance report row It also computes `alertsTriggered`, but only
     as embedded report payload. Relevant code:
   - `server/services/variance-tracking.ts`

3. Rule evaluation is materially narrower than the public contract. The request
   schema allows:
   - `ruleType`: `threshold | trend | deviation | pattern`
   - operators including `between`
   - arbitrary `conditions`, `filters`, `escalationRules` The live evaluator
     only supports:
   - `${metricName}Variance` lookup
   - `gt | lt | gte | lte | eq`
   - no `between`
   - no trend/deviation/pattern logic
   - no conditions/filters logic Relevant code:
   - `shared/variance-validation.ts`
   - `server/services/variance-tracking.ts`

4. Alert persistence currently throws away most of the schema.
   `performance_alerts` has fields for `baselineId`, `varianceReportId`,
   `thresholdValue`, `actualValue`, `varianceAmount`, `variancePercentage`,
   `firstOccurrence`, `lastOccurrence`, `occurrenceCount`, `ruleId`,
   `ruleVersion`, `contextData`, and escalation metadata. `createAlert()`
   currently writes only:
   - `fundId`
   - `alertType`
   - `severity`
   - `category`
   - `title`
   - `description`
   - `metricName`
   - `triggeredAt` Relevant code:
   - `shared/schema.ts`
   - `server/services/variance-tracking.ts`

5. The client alert read model is intentionally thin. `toClientAlert()` exposes:
   - `ruleId`
   - `ruleName`
   - `message`
   - `status`
   - timestamps and notes It currently maps `ruleName` from `alert.title`, which
     is only accurate if the persisted title is the canonical display name for
     the rule/incident. Relevant code:
   - `server/routes/variance.ts`

6. The manual analysis route contract is ahead of the implementation.
   `VarianceAnalysisRequestSchema` already declares:
   - `includeAlertGeneration`
   - `analysisDepth` `VarianceAnalysisResponseSchema` declares
     `analysisMetadata`. The route currently ignores those request fields and
     returns only:
   - `report`
   - `alertsGenerated`
   - `alertCount` Relevant code:
   - `shared/variance-validation.ts`
   - `server/routes/variance.ts`

7. The automation seam already exists and is retried. Calc-run completion
   handlers are registered at startup, and `markCalcRunCompletedIfReady()`
   re-drives downstream handlers after the completion transition so idempotent
   work can recover from failures. Relevant code:
   - `server/services/calc-run-completion-handlers.ts`
   - `server/services/calc-run-tracking.ts`

8. The repo already has an exactly-once async pattern. `job_outbox` exists and
   `portfolio-optimization-service` already uses it as the durable queue
   boundary. `1C.1` does not need to schedule through it, but the alert
   evaluator should be designed so `1C.2` can reuse the same pattern rather than
   inventing a second queue model. Relevant code:
   - `shared/schema.ts`
   - `server/services/portfolio-optimization-service.ts`

9. Baseline resolution is not consistently fund-scoped. `POST /variance-reports`
   checks fund ownership before calling `generateVarianceReport()`, but
   `generateVarianceReport()` itself looks up a baseline by bare `id`, and
   `performCompleteVarianceAnalysis()` forwards a caller-supplied `baselineId`
   without performing the same ownership check. Relevant code:
   - `server/routes/variance.ts`
   - `server/services/variance-tracking.ts`

10. Current metric resolution is not run-aware.
    `getCurrentMetrics(fundId, asOfDate)` reads the latest `fund_metrics` row at
    or before `asOfDate`, while the calc-run completion path already persists
    run-attributed `fund_metrics` rows and exposes `getAttributedKPIs()`. `1C.1`
    should make the current-metric source explicit when automation calls the
    evaluator from a calc run. Relevant code:
    - `server/services/variance-tracking.ts`
    - `server/services/fund-metrics-attribution-service.ts`

11. The alerts read contract already drifts at the query boundary.
    `GetAlertsQuerySchema` accepts `status`, but the route drops it and
    `getActiveAlerts()` hardcodes `status = 'active'`. Relevant code:
    - `shared/variance-validation.ts`
    - `server/routes/variance.ts`
    - `server/services/variance-tracking.ts`

12. The green focused test suite still leaves key `1C.1` risks untested. Current
    passing tests do not assert:
    - `includeAlertGeneration`
    - `analysisDepth` removal or implementation
    - foreign baseline rejection on manual analysis
    - run-attributed metrics selection for automated evaluation
    - alert-query `status` handling Relevant code:
    - `tests/unit/api/variance-tracking-api.test.ts`
    - `tests/unit/services/variance-tracking.test.ts`
    - `tests/unit/services/post-calc-trigger.test.ts`

## Architecture Decision

Choose the dedicated alert-evaluation path.

Do not try to make scheduled automation safe by adding report dedupe on top of
`performCompleteVarianceAnalysis()`. The current code already proves that the
report-generation workflow is user/report-centric, not incident-centric.

The correct split is:

- manual report generation remains report-first
- automated alert evaluation becomes alert-first and report-free

`1C.1` should therefore produce a new internal service path that:

1. resolves a fund-owned target baseline
2. computes the current variance snapshot from an explicit metric source
3. evaluates supported alert rules against that snapshot
4. upserts or updates alert incidents transactionally
5. returns structured evaluation results without creating a report row

## Scope

`1C.1` includes:

- dedicated service path for alert evaluation
- reusable variance snapshot computation without report persistence
- fund-owned baseline resolution for all evaluation/report entrypoints
- run-aware metric sourcing for automated evaluation
- explicit supported rule surface for this phase
- duplicate and suppression enforcement
- alert incident persistence that actually fills the schema
- contract cleanup for the manual `/variance-analysis` route
- contract cleanup for `/api/funds/:id/alerts` query semantics
- focused service, route, and concurrency tests

`1C.1` does not include:

- scheduler or bootstrap wiring
- notification delivery to email/slack/webhook
- remaining-capital UI
- trend, deviation, or pattern rule engines
- archival or deletion jobs for old alerts
- report-side redesign

## Target End State

After `1C.1`, the repo should have these two distinct flows:

### 1. Manual Report Flow

Route:

- `POST /api/funds/:id/variance-analysis`

Behavior:

- may generate a report
- may optionally persist alerts through the dedicated evaluator
- remains idempotent at the HTTP layer
- is never used as the scheduler entrypoint

### 2. Automated Alert Evaluation Flow

Internal service only in `1C.1`.

Behavior:

- no report persistence
- deterministic baseline resolution
- deterministic rule evaluation
- duplicate-safe alert persistence
- safe to call repeatedly for the same fund/baseline/run window

`1C.2` then wires this automated flow to calc-run completion and/or outbox jobs.

## Detailed Delivery Strategy

### Slice 1: Contract Cleanup And Supported Rule Surface

#### Files

- `shared/variance-validation.ts`
- `server/routes/variance.ts`
- `tests/unit/api/variance-tracking-api.test.ts`
- `tests/unit/shared/variance-validation.test.ts`

#### Work

1. Introduce an explicit supported metric catalog for variance alerting. The
   current free-form `metricName` contract is too loose because the evaluator
   only knows how to read specific variance keys.

   Preferred canonical values:
   - `totalValueVariance`
   - `totalValueVariancePct`
   - `irrVariance`
   - `multipleVariance`
   - `dpiVariance`
   - `tvpiVariance`

2. Add a normalization layer for existing short-form rule records and requests.
   The repo already behaves as if:
   - `irr` means `irrVariance`
   - `multiple` means `multipleVariance`
   - `dpi` means `dpiVariance`
   - `tvpi` means `tvpiVariance`
   - `totalValue` currently means dollar delta, not percent delta

   Preserve backward compatibility for stored rows by normalizing those aliases
   in the evaluator, but stop expanding the public contract further.

3. Narrow `1C.1` rule support to `ruleType: 'threshold'`. `trend`, `deviation`,
   and `pattern` are not implemented anywhere in the service layer. For this
   phase, the strategy should not pretend otherwise.

4. Implement the missing `between` operator or remove it from the supported
   request surface for this phase. Prefer implementing it now because:
   - the request schema already exposes it
   - the database schema already stores `secondaryThreshold`

5. Make an explicit decision about `conditions`, `filters`, and
   `escalationRules` for this phase. Recommended:
   - keep them storable in the database
   - reject them at create/update time for `1C.1` if non-empty
   - stop silently dropping them in the route/service layer
   - document them as future-scope rather than silently ignoring them

6. Align the `/variance-analysis` shared schema with the live route behavior.
   Recommended:
   - implement `includeAlertGeneration`
   - remove `analysisDepth` and `analysisMetadata` from the shared contract for
     now unless they are actually implemented in this slice

7. Align the `/alerts` query contract with real behavior. Recommended:
   - if `status` remains in `GetAlertsQuerySchema`, thread it through the route
     and service query
   - otherwise remove it from the shared query schema for `1C.1`
   - do not keep advertising `status` while silently returning only `active`
     rows

#### Acceptance

- alert-rule creation only accepts the rule surface the evaluator can actually
  execute
- `between` no longer silently falls through to `false`
- the manual variance-analysis request/response schema matches real behavior
- the `/alerts` query schema matches real behavior

### Slice 2: Extract Reusable Variance Snapshot Computation

#### Files

- `server/services/variance-tracking.ts`
- optional new file: `server/services/variance-alert-evaluation.ts`
- `tests/unit/services/variance-tracking.test.ts`

#### Work

1. Centralize baseline resolution around fund ownership. The extracted
   computation should take a resolved `FundBaseline` or perform a shared
   fund-scoped lookup. Do not let report or alert entrypoints keep performing
   their own bare `baselineId` reads.

2. Extract the report-free computation core out of `generateVarianceReport()`.

   The reusable computation should include:
   - fund-owned baseline lookup and validation
   - current metric lookup, with optional `runId`-aware attribution
   - baseline metric extraction
   - top-level variance calculation
   - optional portfolio variance analysis when appropriate
   - insights generation if alert evaluation needs them later

3. Preserve `generateVarianceReport()` as a thin wrapper over that computation
   plus report persistence.

4. Replace the current `checkAlertTriggers()` shape with two layers:
   - pure rule evaluation against a computed snapshot
   - persistence of triggered incidents

5. Keep the report payload field `alertsTriggered` if it is still useful for the
   manual report surface, but stop treating it as the persistence source of
   truth for automation.

#### Recommended Service Shape

Either:

- keep the extracted logic inside `VarianceCalculationService` as a new public
  method such as `computeVarianceSnapshot()`

Or:

- move the shared computation into a small helper module used by both report and
  alert paths

Do not duplicate the baseline/current-metric calculation path in a second
service.

#### Acceptance

- report generation still works through the existing route
- explicit baseline IDs are resolved as fund-owned baselines before evaluation
- alert evaluation can reuse the same underlying snapshot computation without
  writing a report

### Slice 3: Dedicated Alert Evaluation And Incident Persistence

#### Files

- new file: `server/services/variance-alert-evaluation.ts` recommended
- `server/services/variance-tracking.ts`
- `shared/schema.ts`
- migrations in both schema streams if new indexes/constraints are added
- `tests/unit/services/variance-tracking.test.ts`

#### Work

Implement a dedicated evaluator with an internal API shaped roughly like:

```ts
interface EvaluateVarianceAlertsParams {
  fundId: number;
  baselineId?: string;
  runId?: number;
  asOfDate?: Date;
  source: 'manual' | 'calc_run_completion' | 'scheduler';
  persistAlerts: boolean;
}
```

The service should:

1. Resolve baseline ownership/defaulting once.
2. Resolve current metric lineage once:
   - `runId`-attributed metrics when `runId` is present
   - latest `fund_metrics` at or before `asOfDate` only when `runId` is absent
3. Compute a report-free variance snapshot.
4. Load enabled rules for the fund.
5. Normalize and validate each rule against the supported metric catalog.
6. Produce a structured evaluation result for every rule:
   - `triggered`
   - `not_triggered`
   - `suppressed`
   - `unsupported`
7. Persist triggered incidents transactionally when `persistAlerts=true`.

#### Recommended Persistence Semantics

Treat alerts as incident rows, not append-only event spam.

For `1C.1`, define one open incident per:

- `fundId`
- `baselineId`
- `ruleId`

Open statuses:

- `active`
- `acknowledged`
- `investigating`

Persistence rules:

1. If the rule does not trigger:
   - do not create an alert
   - do not auto-resolve existing open alerts in `1C.1` Auto-resolution is a
     separate product decision and should not be invented implicitly here.

2. If the rule triggers and an open incident already exists:
   - update that row in place
   - refresh `lastOccurrence`
   - increment `occurrenceCount`
   - update `actualValue`, `varianceAmount`, `variancePercentage`,
     `contextData`, and `updatedAt`
   - leave status unchanged
   - use `suppressionPeriod` to decide whether the evaluation is considered
     `suppressed` for downstream notification hooks

3. If the rule triggers and no open incident exists:
   - insert a new `performance_alerts` row
   - set:
     - `triggeredAt = asOfDate ?? now`
     - `baselineId`
     - `ruleId`
     - `thresholdValue`
     - `actualValue`
     - `varianceAmount`
     - `variancePercentage`
     - `firstOccurrence = triggeredAt`
     - `lastOccurrence = triggeredAt`
     - `occurrenceCount = 1`
     - `contextData`
     - `ruleVersion`

4. Update the originating `alert_rules` row:
   - `lastTriggered`
   - `triggerCount`

#### Recommended Alert Content Rules

To keep `toClientAlert()` simple and accurate:

- persist `title` as the display name of the rule/incident
- persist `description` as the current breach message
- persist `contextData.ruleName` as a stable fallback for future readers

Do not keep generating generic titles like `Variance Alert: irr` if the client
expects `ruleName`.

#### Recommended Context Payload

`contextData` should include enough audit detail to understand the incident
without joining back to the report path:

- `ruleName`
- `metricKey`
- `metricLabel`
- `baselineName`
- `baselinePeriodStart`
- `baselinePeriodEnd`
- `evaluationSource`
- `suppressed`
- `suppressionPeriodMinutes`
- `actualValue`
- `thresholdValue`
- `varianceAmount`
- `variancePercentage`

### Slice 4: Database Guardrails For Duplicate Safety

#### Files

- `shared/schema.ts`
- `schema/src/tables.ts` if mirrored
- `shared/migrations/*`
- `server/migrations/*`

#### Work

The service-level upsert logic is necessary but not sufficient because `1C.2`
will intentionally make repeated and potentially concurrent evaluation calls
possible.

Add database-level guardrails for the open-incident identity:

1. Add an index on `performance_alerts.rule_id`. The current table has indexes
   on fund/severity/status/metric/baseline/report but not the key the evaluator
   will use most often.

2. Add a partial unique index for open incidents if the current data allows it.
   Recommended shape:

- unique on `(fund_id, baseline_id, rule_id)`
- predicate: `status IN ('active', 'acknowledged', 'investigating')`

3. If data hygiene allows it, convert `performance_alerts.rule_id` to a real
   foreign key to `alert_rules.id`. If that is too risky for `1C.1`, at least
   document it as immediate follow-up debt.

#### Acceptance

- concurrent evaluations cannot create two open incidents for the same
  rule/baseline/fund tuple

### Slice 5: Read Path Alignment

#### Files

- `server/routes/variance.ts`
- `shared/variance-validation.ts`
- `tests/unit/api/variance-tracking-api.test.ts`

#### Work

1. Decide whether `/api/funds/:id/alerts` should return only `active` alerts or
   all open incidents.

Recommended:

- broaden the default query to open incidents:
  - `active`
  - `acknowledged`
  - `investigating`
- if the request provides `status`, honor that filter explicitly instead of
  dropping it

Reason:

- those are still live incidents
- the current endpoint already exposes `status`
- hiding acknowledged or investigating incidents will undercount the open alert
  state once incident updates land

2. Update `toClientAlert()` so `ruleName` is not coupled to `title` alone.
   Prefer:

- `contextData.ruleName`
- fallback to `title`

3. Keep the dashboard surface unchanged unless read semantics need to reflect
   open-incident counting rather than only raw `active` rows.

#### Acceptance

- the dashboard and alerts API still render a truthful view of open incidents
- the client does not lose rule naming quality after the persistence cleanup

## Recommended Manual Route Behavior After 1C.1

Keep `/api/funds/:id/variance-analysis` as a manual route.

Recommended service semantics:

- always generate a report when this route is called
- if `includeAlertGeneration=true`, also invoke the dedicated alert evaluator
  with `source: 'manual'`
- if `includeAlertGeneration=false`, skip alert persistence entirely

Do not wire this route to the scheduler in `1C.2`.

If `analysisDepth` is not implemented in this slice, remove it from the shared
contract now instead of leaving another dead field behind.

## Test Strategy

### Unit Tests

Add or update focused tests for:

- metric-name normalization from legacy aliases
- foreign baseline rejection for manual and service entrypoints
- `between` operator evaluation
- unsupported `ruleType` handling
- unsupported metric handling
- run-attributed metric selection when `runId` is provided
- open-incident update instead of duplicate insert
- `suppressionPeriod` handling during repeated triggering
- insertion of a new incident after no open incident exists
- `ruleId`, `baselineId`, threshold, and occurrence fields being persisted
- `lastTriggered` and `triggerCount` updates on the rule row

### Route And Contract Tests

Add or update tests for:

- alert-rule creation rejecting unsupported rule types for `1C.1`
- alert-rule creation rejecting unsupported metrics
- alert-rule creation rejecting non-empty `conditions`, `filters`, and
  `escalationRules` for `1C.1`
- manual `/variance-analysis` respecting `includeAlertGeneration`
- `/variance-analysis` request/response schemas matching the route output
- `/alerts` honoring `status` or no longer accepting it in the shared contract

### Concurrency Tests

Add at least one service-level test proving that repeated evaluation calls with
the same fund/baseline/rule do not create duplicate open alerts.

If a database-backed integration test is practical in this slice, prefer it over
only mocking the insert sequence because this is precisely the class of bug that
mocked unit tests tend to miss.

### Regression Tests

Keep these existing surfaces green:

- report generation through `/api/funds/:id/variance-reports`
- report generation through manual `/variance-analysis`
- dashboard alert counts and recent report reads
- baseline automation idempotency

## Sequencing Recommendation

Implement `1C.1` in this order:

1. Contract cleanup and supported alert metric catalog
2. Reusable variance snapshot extraction
3. Dedicated alert evaluator without persistence side effects
4. Alert incident persistence and rule-row updates
5. Database duplicate-safety guardrails
6. Manual route alignment
7. Tests and rollout notes

This order keeps the core logic honest first, then adds persistence and contract
polish once the evaluator is real.

## Risks And Explicit Tradeoffs

1. Existing stored alert rules may use legacy short metric names. The evaluator
   should normalize them rather than failing hard on read.

2. Existing manual consumers may implicitly rely on the current generic alert
   title/message format. Keep the client DTO stable while improving the stored
   alert content.

3. Auto-resolution semantics are intentionally deferred. `1C.1` should not guess
   whether a non-trigger means resolve, dismiss, or do nothing. Keep that as an
   explicit later decision.

4. Notification dispatch is not part of this slice. `notificationChannels` and
   `suppressionPeriod` should be made truthful for future delivery hooks, but no
   email/slack/webhook work should be smuggled into `1C.1`.

5. The current service file is already large. Prefer a new alert-evaluation
   service module rather than adding more responsibility to
   `server/services/variance-tracking.ts`.

6. The current focused tests being green does not mean `1C.1` is already safe.
   They largely validate the existing report-first flow; they do not yet prove
   foreign-baseline safety, run-aware evaluation, or truthful alert query
   semantics.

## Exit Criteria

`1C.1` is complete only when all of the following are true:

- there is a dedicated alert-evaluation service path that does not write a
  variance report
- explicit baseline IDs are resolved as fund-owned inputs, not global baseline
  IDs
- automated evaluation can bind to calc-run-attributed metrics when `runId` is
  supplied
- the supported alert-rule contract matches what the evaluator can actually run
- `between` is either implemented or removed from supported behavior
- repeated evaluations update an existing open incident instead of inserting
  duplicates
- suppression is enforced in the service layer
- persisted alert rows include rule, baseline, threshold, actual-value, and
  occurrence metadata
- the manual `/variance-analysis` route contract is truthful
- the `/alerts` query contract is truthful
- the code is ready for `1C.2` to call the evaluator from calc-run completion or
  outbox-driven scheduling without using `performCompleteVarianceAnalysis()`
