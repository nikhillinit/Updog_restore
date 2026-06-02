---
status: DRAFT
last_updated: 2026-06-02
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

Current local caveat: `npm run release:check` requires a working Testcontainers
container runtime. If the local machine cannot start containers, the DB proof is
not green locally and release readiness must not be claimed from a skipped run.

Current main caveat: after PR #764 merged, `CI Unified` run 26808954780 failed
on `main` at `27fa8aec`. Do not claim current main is green until that run class
is fixed or superseded by a green run on the relevant head.

## Deferred Or Experimental

- R2b reserve polling and browser progress transport are fast-follow work.
- R3A/R3B scenario comparison breadth remains deferred.
- R4 broad multi-scenario UX and non-scenario evidence completion remain
  deferred.
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
