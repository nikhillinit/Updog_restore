---
status: DRAFT
last_updated: 2026-06-04
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

Current-head CI evidence: `CI Unified` run `26937341250` completed successfully
on `f523b89d622fef695bdb2ed7546bef1dbc2f1e2f`. This is baseline health only, not
release proof.

Current local release-check evidence: on 2026-06-04, `npm run release:check` was
run without `--skip-db` (and with `UPDOG_RELEASE_CHECK_SKIP_DB` unset) from a
clean clone of `ac71eb1a` on the supported Node 20.19.5 runtime inside WSL2
Ubuntu-22.04, against Docker 28.3.2 on its native unix socket. The wrapper
passed TypeScript baseline, lint and guardrails, and both lean release client
and server/CI surface locks (stages 1-4). The Testcontainers runtime now starts
and migrates cleanly after a migration idempotency fix:
`shared/migrations/0001_create_job_outbox.sql` creates the `job_outbox` indexes
with `IF NOT EXISTS`, matching the Drizzle `0005` convention so the shared raw
SQL no longer collides with the Drizzle-applied indexes.

The fund lifecycle DB proof itself still fails on a pre-existing
schema-to-migration drift: `fund_snapshots.scenario_set_id` (and sibling
columns) are declared in `shared/schema/fund.ts` but exist in no migration file,
so a migration-built database lacks the column and the finalize -> publish
reserve and pacing snapshot inserts fail with Postgres `42703`
(`column "scenario_set_id" ... does not exist`). This is latent because the DB
proof had not previously run locally and current CI is baseline health only, not
release proof. The drift is routed to the database-migration specialist for
reconciliation. Release readiness is therefore not proven.

Current visual/a11y evidence: the route-governed screenshot audit passes across
54 desktop/mobile captures with LP reporting enabled, including scenario
results, LP pages, shared dashboard, reports, and the required core/internal
routes. The StressPanel non-color delta cue is covered by its focused unit test.

Current PR disposition: PR #606 remains open but is superseded release work, not
an active merge candidate. Live GitHub state on 2026-06-04 reports
`mergeable: CONFLICTING`, `mergeStateStatus: DIRTY`, base `main`, and head
`qa-design-cleanup-2026-04-28`.

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
