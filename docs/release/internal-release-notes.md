---
status: PROVEN
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

Current local release-check evidence (PROVEN): on 2026-06-04,
`npm run release:check` passed end-to-end -- all ten stages, exit 0 -- without
`--skip-db` (and with `UPDOG_RELEASE_CHECK_SKIP_DB` unset), from a clean clone
of `ac71eb1a` on the supported Node 20.19.5 runtime inside WSL2 Ubuntu-22.04,
against Docker 28.3.2 on its native unix socket, with `CI=true` (the invocation
the DB-proof harness and CI both rely on; without it the test's local container
stop races an open connection and exits non-zero by design). Stages: TypeScript
baseline, lint and guardrails, client and server/CI surface locks, the fund
lifecycle DB proof, the scenario release gate, core validation, the production
build, the whitespace diff, and release-owned file tracking.

Three journaled-migration fixes were required so a migration-built database
matches the Drizzle schema the application code targets; all three are landed on
`main`:

- `shared/migrations/0001_create_job_outbox.sql` -- the `job_outbox` indexes now
  use `CREATE INDEX IF NOT EXISTS`, matching Drizzle `0005` so the shared raw
  SQL no longer collides with the Drizzle-applied indexes.
- `migrations/0009_fund_snapshots_scenario_set_id.sql` -- adds
  `fund_snapshots.scenario_set_id` plus its partial unique dedup index, which
  the finalize -> publish reserve and pacing snapshot inserts require
  (previously failed with Postgres `42703`).
- `migrations/0010_fund_scenario_sets.sql` -- journals `fund_scenario_sets` and
  `fund_scenario_variants`, so `GET /api/funds/:fundId/results` resolves its
  scenarios section to a clean `SCENARIOS_NONE_EXIST` instead of a caught
  `SCENARIOS_LOAD_FAILED` on a migration-built database.

Scope honesty: the release-check gate is proven green, but "gate green" is not
"all migrations reconciled." Residual schema-to-journaled-migration drift
remains and is NOT exercised by this gate -- the rest of the scenario-set family
(`fund_scenario_set_events`, `fund_scenario_calculation_runs`), the LP, shares,
and sector schema families, and the split between the journaled `./migrations`
stream and the unwired `server/db/migrations/` stream. Reconciling those is
tracked in issue #781, not a release-check blocker.

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
