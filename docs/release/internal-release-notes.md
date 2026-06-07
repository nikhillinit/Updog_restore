---
status: PROVEN
last_updated: 2026-06-06
---

# Lean Spine Internal Release Notes

These notes describe the lean internal release surface from
`docs/superpowers/specs/2026-06-02-prove-and-ship-the-spine-lean-release-design.md`.
They are a support matrix, not a broad roadmap.

## Supported Surface

- Scenario set workspace cards distinguish synchronous scenario sets from
  reserve-allocation scenario sets. Fee-profile, allocation, and sector-profile
  sets must not call the reserve `/calculation-status` endpoint; reserve
  allocation remains the status-polled async surface.
- Scenario result summaries expose shared-contract `calculationMode` provenance.
  Waterfall setup and mixed overview evidence remain config-backed or aggregate
  surfaces and must not be described as calculation-run-backed.
- R2b reserve scenario polling is supported in the scenario workspace. Only
  reserve-allocation scenario sets poll `/calculation-status`; fee-profile,
  allocation, and sector-profile scenario sets stay on the synchronous
  calculation path.
- Finalize and publish are covered by a real-DB lifecycle proof that exercises
  mounted `GET /api/funds/:fundId/state` and `GET /api/funds/:fundId/results`,
  then replays the same idempotency key to prove no duplicate persisted rows.
- Previously tracked security residuals are treated as closed by current
  route/queue tests unless a future regression proves otherwise: backtesting job
  access uses fund/requester checks, and LP report fund resolution rejects
  unauthorized or mixed fund IDs.
- The scenario release gate remains explicit. Pull-request affected runs keep a
  direct `test:scenario-release-gate` invocation, while the main/full
  integration path discovers it through `vitest.config.int.ts`.
- Analytics release doctrine is governed by merged PR #763. Analytics is not an
  open blocker for this lean spine release.
- The Theme-2 design-token rollout is shipped UI foundation across the current
  product surface. Future design work should be route-classified stabilization,
  not another broad token migration.

## Release Verification

Run the full wrapper before declaring this surface ship-ready:

```bash
npm run release:check
```

The wrapper preserves `validate:core` and adds the lean-spine targeted surface
tests, the fund lifecycle DB proof, the scenario release gate, the production
build, and `git diff --check`.

The fund lifecycle DB proof is an inline no-Redis proof for reserve and pacing
snapshot publication. The scenario release gate remains the Redis-backed
worker-path proof. Do not merge those claims together.

Current-head CI evidence: `CI Unified` completed successfully on
`7eb20a37033542cd173a5889c81d98e565bb4aec` (post-#801 head). This is baseline
health only, not release proof.

Current local release-check evidence (PROVEN): on 2026-06-06,
`npm run release:check` passed end-to-end -- all ten stages, exit 0 -- without
`--skip-db` (and with `UPDOG_RELEASE_CHECK_SKIP_DB` unset), from a clean clone
of `037cef40` on the supported Node 20.19.0 runtime inside WSL2 Ubuntu-22.04,
against Docker 28.3.2 on its native unix socket, with `CI=true` (the invocation
the DB-proof harness and CI both rely on; without it the test's local container
stop races an open connection and exits non-zero by design). Stages: TypeScript
baseline (0 errors), lint and guardrails, client surface lock (6 files, 132
tests), server/CI surface lock (9 files, 144 tests), the fund lifecycle DB proof
(1 file, 1 test via Testcontainers), the scenario release gate (1 file, 1 test),
core validation (265+ tests, 2 skipped), the production build (build
verification passed), the whitespace diff, and release-owned file tracking.

Note: the above release:check run was on `037cef40`. PRs #799-#801 have since
landed. A re-run against the current head (`7eb20a37`) in WSL2 is required
before the next release cut.

## Journaled Migration History (issue #781 closed)

Issue #781 (schema-to-journaled-migration drift) is closed by PR #799. Seven
journal migrations are now on `main` and replay-safe:

- `shared/migrations/0001_create_job_outbox.sql` -- `job_outbox` indexes use
  `CREATE INDEX IF NOT EXISTS`, matching Drizzle `0005` to avoid collision.
- `migrations/0009_fund_snapshots_scenario_set_id.sql` -- adds
  `fund_snapshots.scenario_set_id` and its partial unique dedup index.
- `migrations/0010_fund_scenario_sets.sql` -- journals `fund_scenario_sets` and
  `fund_scenario_variants`.
- `migrations/0011_scenario_share_sensitivity_drift.sql` -- journals
  `fund_scenario_set_events`, `fund_scenario_calculation_runs`,
  `scenario_matrices`, `optimization_sessions`, `shares`, `share_snapshots`,
  `share_analytics`, and `sensitivity_runs`.
- `migrations/0012_sector_variance_drift.sql` -- journals `sector_taxonomy`,
  `sector_mappings`, `company_overrides`, `investment_overrides`,
  `cohort_definitions`, and `variance_planner_leader`.
- `migrations/0013_lp_reporting_core_drift.sql` -- journals the LP reporting
  core tables (`limited_partners`, `lp_fund_commitments`, `capital_activities`,
  `lp_distributions`, `lp_capital_accounts`, `lp_performance_snapshots`,
  `lp_reports`, `report_templates`, `lp_audit_log`, `vehicles`,
  `cash_flow_events`, `valuation_marks`, `lp_metric_runs`, `narrative_runs`,
  `evidence_records`, `lp_report_packages`, `lp_report_package_exports`,
  `lp_vehicle_participation`, `lp_vehicle_participation_history`).
- `migrations/0014_lp_evidence_sprint3_drift.sql` -- journals LP sprint-3 tables
  (`lp_capital_calls`, `lp_payment_submissions`, `lp_distribution_details`,
  `lp_documents`, `lp_notifications`, `lp_notification_preferences`).

A migration drift guard (`tests/integration/migration-drift.test.ts`) now runs
inside `release:check` as a dedicated stage after the fund lifecycle DB proof.
It replays all journaled migrations against a Testcontainers Postgres instance
and asserts table presence for the full #781 table set. Table-presence parity is
the current guard scope; column/index/constraint parity is not enforced and
remains a future improvement if regressions emerge.

## Observability and Security Hardening (#800-#801)

PR #800 (merged 2026-06-06):

- `authenticateMetrics` wired on all three metrics mount surfaces
  (`registerRoutes`, `makeApp`, `createServer`). Requires `METRICS_KEY` bearer
  token or `METRICS_ALLOW_FROM` IP allowlist in production; denies by default.
- `makeApp()` 500 error handler now returns `"internal_error"` in production
  instead of the raw `err.message`. Dev and 4xx responses retain real messages.

PR #801 (merged 2026-06-06):

- Detailed health diagnostics (`/api/health/schema`, `/api/health/migrations`,
  `/api/health/queues`, `/api/health/workers/:type`, `/api/health/db`,
  `/api/health/cache`, `/api/health/alerts`) now require `X-Health-Key` header
  or bearer JWT auth. Minimal probes (`/healthz`, `/readyz`, `/health`,
  `/api/health/ready`, `/api/health/live`) remain public.
- RUM origin validation replaced `startsWith` prefix matching with
  `new URL().origin` exact matching, closing the
  `https://app.example.com.evil.com` bypass.
- `public-api-boundary.ts` allowlist tightened to exact minimal paths only.

Production smoke for the #800-#801 auth boundaries has not been run against a
deployed Vercel environment. This is required before the next release cut (see
M1 in the prioritized backlog).

Current visual/a11y evidence: the route-governed screenshot audit passes across
54 desktop/mobile captures with LP reporting enabled, including scenario
results, LP pages, shared dashboard, reports, and the required core/internal
routes. The StressPanel non-color delta cue is covered by its focused unit test.

Current PR disposition: PR #606 was closed on 2026-06-04, unmerged. It was
superseded release work (head `qa-design-cleanup-2026-04-28`, conflicting with
main). Not an active merge candidate.

## Deferred Or Experimental

- Broader browser progress transport beyond reserve scenario polling remains
  deferred.
- R3A/R3B scenario comparison breadth remains deferred.
- R4 broad multi-scenario UX and non-scenario evidence completion remain
  deferred.
- Route-classified a11y follow-up remains for long-tail financial/status color
  cues and report/PDF/canvas literal color semantics; do not treat it as a broad
  token migration.
- R5 advisory-engine expansion and the full analytics buildout beyond merged PR
  #763 doctrine are deferred.
- R7 / v3.1.1 multi-entity operating workspace is not started.
- Forecast modes and actuals are not built for this release.
- Cohort promotion and cohort rebalancing remain experimental and are not
  authoritative readiness surfaces.
- Economics remains flag-gated where the current product surface marks it as
  such.
- Broad dependency and test-platform modernization beyond the Vitest 4 work
  forced by PR #764 is out of scope.
