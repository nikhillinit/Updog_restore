---
status: ACTIVE
last_updated: 2026-05-29
---

# Scenario Release Lane

## Purpose

ADR-022 scenarios are the next release boundary. The lane is release-hardening
work for existing scenario surfaces, not a vehicle for broad refactors,
dependency churn, route rewrites, money utility migration, schema directory
renames, or engine dedupe.

## Current Starting Point

- Fee-profile and reserve-allocation scenario calculations exist.
- Scenario set routes live in `server/routes/fund-scenario-sets.ts`.
- The async reserve lane has a worker-backed status endpoint:
  `GET /api/funds/:fundId/scenario-sets/:scenarioSetId/calculation-status`.
- Results already expose scenario availability through the fund-results read
  model.
- Scenario snapshots currently overwrite by `(fund_id, scenario_set_id)`.
- Scenario input hashes currently depend on raw JSON serialization.

## Release Gate Order

1. Canonical scenario input hashing.
2. Economics fail-closed comparison reasons.
3. Append-only scenario retention and calculation runs.
4. Postgres/Redis/worker scenario release gate.
5. Scenario UX workspace.
6. Override expansion.
7. Reserve optimization.

The full release gate asserts comparison-unavailable semantics, so economics
fail-closed work lands before the full gate. A smaller infrastructure lifecycle
gate may land first if it does not assert typed comparison reasons.

## Compatibility Rules

- Preserve public URLs, auth gates, provider order, persisted keys, request IDs,
  route contracts, and existing compatibility exports.
- Add route-contract tests before adding new route behavior.
- Use existing Pino/logger paths for diagnostics.
- Use canonical fund-store and guard facades; do not create scenario-specific
  mirrors.
- Do not collapse route mounts or split `App` as part of scenario work.
- Do not delete env, Vitest, or TypeScript configs.
- Do not add dependencies.

## Verification Commands

Use current scripts only:

```bash
npm run check
npm run lint
npm run calc-gate
npm run calc-gate:full
npm run validate:core
npm run test:integration
npm run test:integration:routes
npm run docs:routing:check
npm run docs:check-links
git diff --check
```

Do not use retired aliases such as `test:phase4`, `test:phase4:client`, or
`test:wave4`.

## CI Policy

Prefer extending existing Postgres/Redis-backed jobs in
`.github/workflows/ci-unified.yml`. Create a dedicated scenario workflow only if
the unified workflow cannot host the release gate without weakening existing
jobs.

## Migration Policy

ADR-022 SQL migrations currently live under `server/db/migrations/*.sql`.
`npm run db:push` and `scripts/run-migrations.ts` do not apply that directory.
Any PR that adds a new `server/db/migrations/*.sql` file must include:

- Local/integration application proof for that migration.
- Explicit staging/production application instructions using the repo
  `db-migration` path or direct SQL execution against the target database.
- A verification query proving the table/indexes exist after application.

`0016_fund_scenario_calculation_runs.sql` is a raw ADR-022 migration under
`server/db/migrations/`. It is not applied by `npm run db:push` or
`scripts/run-migrations.ts`. Apply it through the repo `db-migration` release
lane or by executing the SQL file directly against the target database in the
same release as the code that removes the old scenario-set upsert (see the
deployment-ordering note below).

Verification query:

```sql
SELECT to_regclass('public.fund_scenario_calculation_runs') AS runs_table,
       to_regclass('public.fund_scenario_calc_runs_active_dedup_idx') AS runs_idx,
       to_regclass('public.fund_snapshots_scenarios_dedup_idx') AS snapshots_idx;
```

For `0016_fund_scenario_calculation_runs.sql`, apply the migration and deploy
the append-only, conflict-safe code together in the same release window. Do not
split them in either order: dropping
`fund_snapshots_scenario_set_calculation_unique` while the old
`ON CONFLICT (fund_id, scenario_set_id)` upsert code is still live fails inserts
with Postgres `42P10` (no matching unique constraint), and deploying append-only
writes while that unique index still exists fails the second write per
`(fund_id, scenario_set_id)` with `23505` (unique violation). Co-deploy
atomically.
