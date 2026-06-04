---
last_updated: 2026-05-11
---

# Phase 1A.2: Baseline Automation Hardening Plan (Sandbox-Validated)

## Context

Phase 0 already established the calc-run completion pipeline, attributed
`fund_metrics`, baseline idempotency, and system actor seeding. The existing
pipeline works end-to-end, but automated baseline creation still has lineage and
contract gaps:

- KPI sourcing can silently fall back to the wrong calc run.
- Reserve/pacing snapshots are not scoped to the triggering run.
- Automated baseline timestamps can drift to retry time rather than completion
  time.
- Backfill behavior is underspecified around tags and default-baseline status.
- The system actor guard needs to fail before write time, not as an advisory
  check.

This phase hardens those paths without redesigning the calc-run completion
architecture.

## Scope

This is a hardening and cleanup slice on top of the existing implementation.

Non-goals:

- `sourceSnapshotId` wiring
- Splitting baseline and alert work into separate completion handlers
- Scheduler or periodic alert redesign
- Portfolio drift detection before portfolio mutation timestamps exist
- Re-drive coalescing or serialization windows; replay remains immediate

## Key Revisions Integrated

1. `createBaselineFromCalcRun` needs an explicit options contract. It cannot
   remain `runId`-only if backfill mode needs different tags and
   default-baseline behavior.
2. Backfill-mode baselines must never auto-promote to default. This leaves funds
   with only backfilled baselines outside periodic alert scheduling until a
   manual promotion occurs; the rollout must state that consequence explicitly.
3. The system actor guard should validate on automated write execution. Do not
   cache success for process lifetime.
4. Migration-stream audit should be verified through migrated integration tests
   and deployment inventory, not `drizzle-kit push`.
5. Temporal-skew telemetry should be scoped to real-time calc-run mode or
   recorded as telemetry rather than warn-level noise for replay/backfill.
6. Automated baseline modes must require `sourceRunId`. Falling back to manual
   semantics because a caller forgot the run identifier weakens the
   strict-sourcing contract.
7. Idempotent baseline reuse should be measured distinctly from creation.
   Replays and race winners should log and emit `reuse`, not inflate `create`
   metrics.

## Implementation Plan

### Step 1: Add dedicated fallback telemetry

Files:

- [variance-metrics.ts](../../server/metrics/variance-metrics.ts)
- [variance-tracking.ts](../../server/services/variance-tracking.ts)

Work:

- Add a dedicated Prometheus counter such as
  `baseline_metric_fallback_total{mode,reason}`.
- Increment it only on the explicit escape-hatch fallback path.
- Emit structured telemetry for fallback events; do not route these through
  `recordSystemError()`.
- If temporal-skew telemetry is added in
  [fund-metrics-attribution-service.ts](../../server/services/fund-metrics-attribution-service.ts),
  scope it to real-time calc-run creation or downgrade it from warn-level
  logging so replay/backfill does not create false alarms.

### Step 2: Make baseline creation mode and default behavior explicit

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)

Work:

- Add `BaselineCreationMode = 'manual' | 'calc_run' | 'backfill'`.
- Add `BaselineDefaultBehavior = 'auto' | 'force_default' | 'never_default'`.
- Thread `mode` and `defaultBehavior` through `createBaseline()`.
- Reject automated-mode baseline creation when `sourceRunId` is missing.
- Extend `createBaselineFromCalcRun(runId, options)` to accept:
  - `mode?: 'calc_run' | 'backfill'`
  - `additionalTags?: string[]`
  - `defaultBehavior?: BaselineDefaultBehavior`
- Use `additionalTags`, not raw `tags`, so mode-derived tags remain canonical.

### Step 3: Make metric sourcing strict for automated modes

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)

Work:

- In `getBaselineMetrics(reader, fundId, mode, sourceRunId?)`:
  - `manual`: keep latest-by-fund fallback
  - `calc_run` / `backfill`: require `fund_metrics.run_id = sourceRunId`
- If attributed metrics are missing for automated modes, throw a hard integrity
  error.
- Keep `ALLOW_METRIC_FALLBACK=1` only as a temporary rollout escape hatch.

### Step 4: Make reserve/pacing sourcing strict and deterministic

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)
- [fund.ts](../../shared/schema/fund.ts)

Work:

- In `getReserveSnapshot(...)` and `getPacingSnapshot(...)`:
  - `manual`: keep latest-by-fund behavior
  - `calc_run` / `backfill`: require same-run snapshots by `runId`
- Select same-run snapshots deterministically with:
  - `ORDER BY snapshotTime DESC, createdAt DESC`
- If automated-mode snapshots are missing, throw integrity errors rather than
  reading newer unrelated snapshots.

### Step 5: Tighten calc-run invariants and automated timestamp semantics

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)

Work:

- `createBaselineFromCalcRun()` must require `run.completedAt`.
- Pass `snapshotDate: run.completedAt` into `createBaseline()`.
- Keep manual baselines on `new Date()`.
- Derive `periodEnd` from `completedAt`, not retry time.

### Step 6: Preserve immediate re-drive and strengthen baseline logging

Files:

- [calc-run-tracking.ts](../../server/services/calc-run-tracking.ts)
- [variance-tracking.ts](../../server/services/variance-tracking.ts)

Work:

- Keep replay behavior in
  [calc-run-tracking.ts](../../server/services/calc-run-tracking.ts)
  functionally unchanged.
- Add comments documenting that immediate re-drive is intentional recovery.
- Add explicit baseline lifecycle logs:
  - `baseline.created`
  - `baseline.reused`
  - `baseline.reused_after_race`
- Record baseline operation metrics as `create` vs `reuse` so idempotent replays
  do not inflate creation counts.

### Step 7: Add an execution-time system actor guard

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)
- [system-actor.ts](../../shared/constants/system-actor.ts)
- [schema.ts](../../shared/schema.ts)

Work:

- Before any automated baseline insert, verify `users.id = SYSTEM_ACTOR_ID` and
  `username = SYSTEM_ACTOR_USERNAME`.
- Fail with a clear application error before attempting the write.
- Do not cache successful validation for process lifetime.

### Step 8: Defer portfolio drift detection explicitly

Files:

- [variance-tracking.ts](../../server/services/variance-tracking.ts)
- [portfolio.ts](../../shared/schema/portfolio.ts)

Work:

- Add a code comment documenting that portfolio composition still reads live
  `portfolioCompanies` and `investments`.
- Do not add pseudo-drift tags or half-implemented staleness checks until the
  schema has the necessary mutation timestamps or immutable snapshots.

### Step 9: Audit migration-stream ownership correctly

Files:

- [0002_phase0_variance_automation.sql](../../migrations/0002_phase0_variance_automation.sql)
- [005_fundmetrics_attribution.sql](../../server/migrations/005_fundmetrics_attribution.sql)

Work:

- Treat top-level `migrations/0002_phase0_variance_automation.sql` as the
  authoritative automation migration.
- Mark `server/migrations/005_fundmetrics_attribution.sql` deprecated via header
  comment only.
- Verify migration-stream alignment through:
  - deployment inventory
  - migrated integration tests
  - environment-specific migration ownership
- Do not use `npm run db:push` as the validation mechanism for this audit.

### Step 10: Add a scoped backfill tool with explicit non-default behavior

Files:

- `scripts/backfill-automated-baselines.ts`
- `docs/plans/`

Work:

- Scan `calc_runs` with `completedAt IS NOT NULL` and no matching
  `fund_baselines.source_run_id`.
- For each candidate:
  1. `ensureAttributedFundMetricsForCalcRun(runId)`
  2. `createBaselineFromCalcRun(runId, { mode: 'backfill', additionalTags: [...], defaultBehavior: 'never_default' })`
- Default tags for backfill mode should be `['backfill', 'approximate']`.
- Add CLI controls:
  - `--dry-run`
  - `--max-age-days 7`
  - `--batch-size`
  - `--fund-id`
  - `--delay-between-batches-ms`
- Document the operational consequence: funds with only backfilled baselines
  will still have no default baseline and therefore no periodic alert scheduling
  until manual promotion.

### Step 11: Lock the architecture in code comments

Files:

- [calc-run-completion-handlers.ts](../../server/services/calc-run-completion-handlers.ts)
- [calc-run-tracking.ts](../../server/services/calc-run-tracking.ts)
- [variance-alert-automation.ts](../../server/services/variance-alert-automation.ts)

Work:

- Document:
  - `markCalcRunCompletedIfReady()` is the sole completion trigger
  - one registered completion handler
  - one sequential runtime pipeline: `metrics -> baseline -> realtime alerts`
  - immediate re-drive is intentional and safe because of idempotency guards

## Sandbox Validation

The following proof slice was implemented in the sandboxed repo to validate the
plan before finalizing it:

- explicit `BaselineCreationMode`
- explicit `BaselineDefaultBehavior`
- `createBaselineFromCalcRun(runId, options)` contract
- automated backfill baselines default to `never_default`
- strict automated `fund_metrics` sourcing
- strict same-run reserve/pacing snapshot sourcing
- execution-time system actor validation with no process-lifetime cache

Validation results:

- [baseline-idempotency.test.ts](../../tests/unit/services/baseline-idempotency.test.ts)
  passed with a new backfill non-default contract check
- [system-actor.test.ts](../../tests/unit/services/system-actor.test.ts) passed
  with execution-time actor-guard coverage
- [variance-tracking.test.ts](../../tests/unit/services/variance-tracking.test.ts)
  passed with strict automated metric/snapshot sourcing checks
- `npm run check` passed with zero new TypeScript errors

New implementation-level revision surfaced by this validation:

- Automated calc-run baseline tests must seed same-run `RESERVE` and `PACING`
  snapshots explicitly. Old tests that only seeded calc-run metadata or
  `fund_metrics` no longer represent valid automated baseline preconditions.

## Rollout Order

1. Land telemetry and explicit mode/default-behavior contracts.
2. Land strict sourcing, timestamp fixes, and execution-time actor validation
   behind `ALLOW_METRIC_FALLBACK=1`.
3. Run unit and migrated integration tests.
4. Deploy with the escape hatch enabled.
5. Watch the dedicated fallback counter until it remains at zero for a steady
   real-time traffic window.
6. Run the scoped backfill for recent orphaned runs.
7. Manually promote any backfilled baseline that should become the fund default.
8. Remove `ALLOW_METRIC_FALLBACK`.
9. Land architecture-lock comments if they were kept separate from the behavior
   change set.

## Exit Bar

- A completed calc run creates at most one automated baseline regardless of
  replay count.
- Automated baselines carry `source_run_id` and `created_by = 999999`.
- Automated KPI fields come only from `fund_metrics.run_id = sourceRunId`.
- Automated reserve and pacing payloads come only from same-run snapshots.
- `snapshotDate` and `periodEnd` reflect `completedAt`, not retry time.
- Replay remains immediate and safely idempotent.
- Backfill uses the same attribution sequence as runtime and never auto-promotes
  itself to default.
- Funds that only have backfilled baselines are explicitly handled operationally
  through manual default promotion.
- Manual baseline creation remains unchanged.
- The behavior is proven in both focused unit tests and migrated integration
  coverage before rollout.
