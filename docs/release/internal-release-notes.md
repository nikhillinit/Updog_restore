---
status: PROVEN
last_updated: 2026-06-12
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

Current-head CI evidence (CORRECTED 2026-06-12): every full `CI Unified` run on
`main` failed between the #801 merge (2026-06-06) and 2026-06-12 on exactly one
stale integration test, `tests/integration/storage-health-mode.test.ts`, which
probed the now-protected `/health/detailed` anonymously (verified identical
single-test failure on runs 27243198438, 27393791456, 27447553556). Docs-only
pushes in that window produced fast path-filtered "green" runs that skip
integration; any green sampled from those runs was vacuous and must not be cited
as baseline health. PR #835 fixes the stale test; CI baseline health is restored
only when the first post-#835 full main run completes green.

Current local release-check evidence (PROVEN, current head): on 2026-06-12,
`npm run release:check` passed end-to-end -- all eleven stages, exit 0 --
without `--skip-db` (and with `UPDOG_RELEASE_CHECK_SKIP_DB` unset), from clean
WSL2 Ubuntu-22.04 clones of both `0e0781a8` and `a01c180b` (the head after the
boundary-smoke and CI-pin merges), on Node 20.19.x with Docker 28.3.2 and
`CI=true TZ=UTC`. Stages: TypeScript baseline (0 errors), lint and guardrails,
client surface lock, server/CI surface lock, the fund lifecycle DB proof
(Testcontainers Postgres), the migration drift guard, the scenario release gate,
core validation, the production build, the whitespace diff, and release-owned
file tracking. The earlier `037cef40` proof of 2026-06-06 is historical only.

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

Deployed production smoke for the #800-#801 auth boundaries (PROVEN
unauthenticated surface, 2026-06-12):
`tests/smoke/production-boundaries.spec.ts` (merged via PR #833) ran against the
deployed Vercel environment `https://updog-restore.vercel.app` -- 7 passed, 0
failed, 2 credential-gated skips. Proven against the live deployment: the public
`/api/health` probe is a real JSON handler (not an SPA rewrite), `/api/metrics`
denies unauthenticated requests (403 JSON), the bare `/metrics` path is not
exposed, protected health diagnostics deny anonymous access (401), RUM
prefix-lookalike origins are rejected while the exact deployed origin is
accepted (204). Every assertion carries a content-type guard because `/healthz`
and `/health` are SPA-rewritten to `index.html` on this topology and must never
be cited as health proof.

The two credential-gated assertions (`/api/metrics` with bearer `METRICS_KEY`
returning Prometheus text; `/api/health/db` with `X-Health-Key` returning 200
JSON) are EXPLICITLY UNPROVEN, classified by the release owner on 2026-06-12 as
non-blocking pending a real credentialed run. A local 9-skipped Playwright
result (junit 2026-06-12T22:21Z) is environment-less readiness only, not proof.

Deployed-environment defects found and fixed during this proof (2026-06-12):
`ENABLE_QUEUES` carried a trailing CRLF that made Zod config validation throw
inside `requireAuth`, turning every JWT-protected route into a 500; and
`ALLOWED_ORIGINS` was unset, so the strict-CORS perimeter returned a blanket 403
for every Origin-bearing request, including the deployed SPA's own mutations.
Both were fixed by production env corrections plus a redeploy of the same build,
then re-verified live. The smoke spec's previous default target
`fund.presson.vc` does not resolve; the deployed target is
`https://updog-restore.vercel.app` and must be passed via `PRODUCTION_URL`.

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
