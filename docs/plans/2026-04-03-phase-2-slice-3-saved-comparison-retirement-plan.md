---
last_updated: 2026-04-03
---

# Phase 2 Slice 3 Plan: Retire Dormant Saved-Comparison Persistence

## Context

Parent plan:

- `docs/plans/2026-04-02-phase-2-scenario-comparison-consolidation-plan.md`

Slices `0` through `2` removed the dead routed/runtime comparison product and
made `/sensitivity-analysis` the only live scenario-analysis surface.

What remains is not product behavior. It is dormant schema and documentation
debt that still implies a saved-comparison backend exists:

- `scenario_comparisons`
- `comparison_configurations`
- `comparison_access_history`
- `portfolioIntelligenceService.comparisons`
- stale docs that still describe activation/persistence as if it were current

Slice `3` should finish that retirement work so Phase 2 no longer carries two
different stories:

1. the real backtesting comparison workflow in `backtest_results`
2. an unused saved-comparison persistence model that never shipped

## Goal

Retire the dormant saved-comparison persistence family from the repo and the
database plan without touching the live backtesting comparison contract.

Concretely, Slice `3` must:

- remove the unused `portfolioIntelligenceService.comparisons` wrapper
- remove or formally deprecate `scenario_comparisons`,
  `comparison_configurations`, and `comparison_access_history`
- clean dependent schema-boundary, seeding, and documentation references
- preserve `backtest_results.scenarioComparisons` and
  `backtest_results.scenarioComparisonSummary`

## Non-Goals

Slice `3` does not include:

- changes to `/api/backtesting/*`
- changes to `backtest_results`
- changes to local wizard scenario math
- changes to fund-results version comparison
- removal of `monte_carlo_simulations` or any broader simulation persistence
  surface outside the dormant saved-comparison family
- destructive data deletion before an environment data audit

## Actual Codebase Findings

1. `shared/schema.ts` still exports the full dormant schema family.
   - `scenario_comparisons`
   - `comparison_configurations`
   - `comparison_access_history`

2. `server/services/portfolio-intelligence-service.ts` still exposes
   `comparisons.create()` and `comparisons.getById()`, but sandbox validation
   against `server/routes/portfolio-intelligence.ts` shows the feature-gated
   compare path does not call that namespace. The active compare handler writes
   to `storage.comparisons` instead.

3. `shared/lib/data-boundaries.ts` still models scenario-comparison data as a
   simulation-only concern, but it has three separate problems:
   - `scenario_comparison_configs` is listed even though no such table exists
   - `comparison_configurations` is missing entirely
   - `comparison_access_history` is missing entirely

4. `tests/helpers/testcontainers-seeder.ts` still orders all three dormant
   tables in the default seed list, which means test helpers continue to imply
   they are normal, supported schema surfaces.

5. `docs/portfolio-construction-modeling.md` still presents
   `scenario_comparisons` as an active core table.

6. `docs/adr/ADR-013-scenario-comparison-activation.md` is stale. It describes
   a route that has now been deliberately removed, while `docs/adr/README.md`
   still indexes that ADR.

7. The live comparison truth already has a different persistence model:
   `backtest_results.scenarioComparisons` and
   `backtest_results.scenarioComparisonSummary`. Slice `3` must not touch those
   fields.

8. `shared/schema.ts` still exports direct insert helpers and types tied to the
   dormant family:
   - `insertScenarioComparisonSchema`
   - `ScenarioComparison`
   - `InsertScenarioComparison`
   - `insertComparisonConfigurationSchema`
   - `ComparisonConfiguration`
   - `InsertComparisonConfiguration`
   - `insertComparisonAccessHistorySchema`
   - `ComparisonAccessHistory`
   - `InsertComparisonAccessHistory`

9. There is a real name collision risk in cleanup work:
   `backtest_results` has a live JSONB column named `scenario_comparisons`
   while the dormant table family also includes a table named
   `scenario_comparisons`.

10. `migrations/meta/_journal.json` had drifted behind the live migration set.
    `0006_phase2_backtest_scenario_comparison_summary.sql` existed on disk but
    was not registered in the journal, which meant a fresh-db migration run
    could silently skip the live `scenario_comparison_summary` column unless
    Slice `3` repaired the journal while appending the new drop migration.

## Recommendation

Use a two-gate retirement:

1. repo retirement in one cleanup branch
2. environment data audit before applying the schema drop

Default assumption:

- the saved-comparison family is dead and should be removed, not preserved on a
  long deprecation tail

Safety gate:

- if any target environment contains non-zero rows in the dormant tables,
  export/archive the rows before the destructive migration is applied

Ordering note:

- Slice `3` should execute before Slice `4` so schema-boundary, seeding, and
  documentation truth are corrected before the integration rewrite locks in the
  final live contract story

## Implementation Validation Update (`2026-04-03`)

Sandbox implementation completed the planned retirement work and surfaced one
extra repo-integrity fix:

- retired the dormant schema family from `shared/schema.ts`
- removed `portfolioIntelligenceService.comparisons`
- corrected `shared/lib/data-boundaries.ts` and
  `tests/helpers/testcontainers-seeder.ts`
- added `migrations/0007_phase2_retire_dormant_saved_comparison_persistence.sql`
- repaired `migrations/meta/_journal.json` so fresh-db migration order now
  includes both the live `0006_phase2_backtest_scenario_comparison_summary`
  migration and the new Slice `3` drop migration
- updated active docs to supersede ADR-013 and remove the saved-comparison
  table from the modeling story

## Owned Files

- `shared/schema.ts`
- `server/services/portfolio-intelligence-service.ts`
- `shared/lib/data-boundaries.ts`
- `tests/helpers/testcontainers-seeder.ts`
- `tests/integration/schema-isolation.test.ts`
- `docs/portfolio-construction-modeling.md`
- `docs/adr/ADR-013-scenario-comparison-activation.md`
- `docs/adr/README.md`
- new migration file(s) for schema removal
- `migrations/meta/_journal.json`

## Execution Sequence

### 1. Prove Nothing Live Still Depends On The Dormant Family

Use repo search as the first gate.

Required checks:

- no mounted route writes or reads the three dormant tables
- no current page, hook, or service outside `portfolio-intelligence-service.ts`
  imports the dormant comparison types or schemas
- the feature-gated `portfolio-intelligence` compare route is explicitly
  verified to use in-memory `storage.comparisons`, not
  `portfolioIntelligenceService.comparisons`
- no current user-facing docs still claim the dormant route is pending
  activation

Acceptance:

- the remaining references are limited to schema exports, test helpers, and
  stale docs that this slice owns

### 2. Make The Documentation Truthful Before The Drop Lands

Update or archive docs that still describe the dead runtime as an active or
near-active product path.

Minimum doc changes:

- retire the saved-comparison story in
  `docs/portfolio-construction-modeling.md`
- mark `docs/adr/ADR-013-scenario-comparison-activation.md` as superseded by
  the consolidation decision rather than merely archiving it
- update `docs/adr/README.md` so the ADR index no longer marks ADR-013 as
  `Accepted`

Acceptance:

- no active doc claims the removed scenario-comparison route is pending
  activation
- no active doc presents saved-comparison persistence as a live product
  capability

### 3. Remove Runtime And Schema Exports Together

In the same implementation slice:

- remove `portfolioIntelligenceService.comparisons`
- remove the dormant table definitions from `shared/schema.ts`
- remove insert-schema and type exports tied only to those tables:
  - `insertScenarioComparisonSchema`
  - `ScenarioComparison`
  - `InsertScenarioComparison`
  - `insertComparisonConfigurationSchema`
  - `ComparisonConfiguration`
  - `InsertComparisonConfiguration`
  - `insertComparisonAccessHistorySchema`
  - `ComparisonAccessHistory`
  - `InsertComparisonAccessHistory`
- remove stale entries from `shared/lib/data-boundaries.ts`
- remove the dormant tables from `tests/helpers/testcontainers-seeder.ts`

Important:

- grep-based cleanup must distinguish the dormant `scenario_comparisons` table
  family from the live `backtest_results.scenario_comparisons` column
- do not touch `backtest_results.scenarioComparisons`
- do not touch `backtest_results.scenarioComparisonSummary`
- do not widen the cleanup into unrelated portfolio-intelligence tables

Search guard:

- dead targets: `scenarioComparisons` table/export context,
  `comparisonConfigurations`, `comparisonAccessHistory`,
  `portfolioIntelligenceService.comparisons`
- live targets that must remain: `backtest_results.scenarioComparisons`,
  SQL/Drizzle references to `backtest_results` in `scenario_comparisons`
  column context

Acceptance:

- the repo no longer exports or consumes the dormant saved-comparison runtime
  model
- the remaining comparison story is the live backtesting contract only

### 4. Add The Drop Migration With Explicit Ordering

Add a migration that drops the dormant family in dependency order:

1. `comparison_access_history`
2. `comparison_configurations`
3. `scenario_comparisons`

Recommended SQL approach:

- use `DROP TABLE IF EXISTS`
- rely on table drops to remove dependent indexes automatically
- keep the migration narrowly scoped to the dormant family
- repair `migrations/meta/_journal.json` if it is behind the on-disk migration
  set so fresh-db migration order does not skip the live
  `0006_phase2_backtest_scenario_comparison_summary` migration while appending
  the new Slice `3` drop migration
- do not widen the migration to `monte_carlo_simulations`; that table is a
  separate simulation-persistence concern and needs its own caller audit and
  retirement decision if it ever becomes a target

Acceptance:

- migration scope is limited to the dormant saved-comparison family
- fresh-db journal order still includes the live backtesting summary migration
- no live backtesting tables are included

### 5. Run The Environment Data Audit Before Applying The Migration

Before the destructive migration is applied in the target environment, check row
counts:

```sql
select count(*) as scenario_comparisons_count from scenario_comparisons;
select count(*) as comparison_configurations_count from comparison_configurations;
select count(*) as comparison_access_history_count from comparison_access_history;
```

If any count is non-zero:

- export/archive the data first
- record where the export lives
- then apply the drop

Operational runbook:

- owner: the developer merging and applying the retirement PR
- timing: after code review approval, before the destructive migration is
  applied in the target environment
- connect with `psql "$DATABASE_URL"` against the target environment
- run the count queries above first
- if any count is non-zero, export each table before applying the migration
- use `npm run db:push` from the repo root to apply the environment schema
  change; the checked-in `0007` migration file and updated
  `migrations/meta/_journal.json` remain the source of truth for fresh-db and
  test-harness migration order
- repo-native helper: `npm run phase2:slice3:audit -- --environment <env>` now
  automates the existence audit, row counts, conditional CSV export, summary
  artifact generation, and the post-apply verification path

Example export commands:

```sql
\copy (select * from scenario_comparisons) to './artifacts/scenario_comparisons_pre_drop.csv' csv header
\copy (select * from comparison_configurations) to './artifacts/comparison_configurations_pre_drop.csv' csv header
\copy (select * from comparison_access_history) to './artifacts/comparison_access_history_pre_drop.csv' csv header
```

- store the export artifact location in the PR or deployment record
- only then apply the migration

Operator checklist:

1. Confirm the rollout revision.
   - The branch or deploy artifact must include:
     - `migrations/0007_phase2_retire_dormant_saved_comparison_persistence.sql`
     - `migrations/meta/_journal.json`
   - Record the target environment, operator, and commit SHA in the PR or
     deployment record.

2. Preferred path: run the repo-native helper in audit mode first.

```bash
npm run phase2:slice3:audit -- --environment staging
```

This writes a JSON summary artifact and any needed CSV exports under
`./artifacts/phase2-slice3` by default.

3. Manual path: open a session against the target environment.

```bash
psql "$DATABASE_URL"
```

4. Verify you are pointed at the expected schema before the audit.

```sql
select
  to_regclass('public.scenario_comparisons') as scenario_comparisons_table,
  to_regclass('public.comparison_configurations') as comparison_configurations_table,
  to_regclass('public.comparison_access_history') as comparison_access_history_table,
  to_regclass('public.backtest_results') as backtest_results_table;
```

Gate:

- if `backtest_results_table` is `null`, stop; this is the wrong database
- if all three dormant tables are already `null`, stop and verify whether Slice
  `3` has already been applied in that environment

5. Run the row-count audit.

```sql
select count(*) as scenario_comparisons_count from scenario_comparisons;
select count(*) as comparison_configurations_count from comparison_configurations;
select count(*) as comparison_access_history_count from comparison_access_history;
```

Gate:

- if all three counts are `0`, continue to apply
- if any count is non-zero, export the rows before applying the drop

6. Export any non-zero tables before the drop.
   - Create a local artifact directory outside the repo if needed.
   - Use stable filenames that include the environment name and date.

```sql
\copy (select * from scenario_comparisons) to './artifacts/scenario_comparisons_pre_drop.csv' csv header
\copy (select * from comparison_configurations) to './artifacts/comparison_configurations_pre_drop.csv' csv header
\copy (select * from comparison_access_history) to './artifacts/comparison_access_history_pre_drop.csv' csv header
```

Gate:

- store the final export paths in the PR or deployment record before continuing

7. Apply the schema change from the repo root.

```bash
npm run db:push
```

Or use the repo-native helper to perform audit + export + apply in one guarded
flow:

```bash
npm run phase2:slice3:audit -- --environment staging --apply --yes
```

8. Verify the post-apply schema state immediately.

```sql
select
  to_regclass('public.scenario_comparisons') as scenario_comparisons_table,
  to_regclass('public.comparison_configurations') as comparison_configurations_table,
  to_regclass('public.comparison_access_history') as comparison_access_history_table;

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'backtest_results'
  and column_name in ('scenario_comparisons', 'scenario_comparison_summary')
order by column_name;
```

Gate:

- all three retired tables must now be `null`
- `backtest_results.scenario_comparisons` must still exist
- `backtest_results.scenario_comparison_summary` must still exist

9. Record closure evidence.
   - Save the `db:push` output, post-apply verification results, operator name,
     environment, and timestamp in the PR or deployment record.

Rollback note:

- the table drop is not an in-place rollback operation
- if a hidden dependency is found after deployment:
  - revert application code as needed
  - add an emergency recreate migration from the pre-drop schema definition
  - restore archived rows from the pre-drop export artifacts

Acceptance:

- the migration is not applied blind against unknown data

## Test Plan

Minimum verification:

- update `tests/integration/schema-isolation.test.ts` for the boundary-list
  cleanup
- run the schema-isolation integration suite
- run any targeted type/schema tests that import `shared/schema.ts`
- run a targeted repo search after edits to confirm the dormant family is gone
  from live code paths

Recommended commands:

```bash
npx vitest run tests/integration/schema-isolation.test.ts --config vitest.config.int.ts
npx vitest run tests/unit/schema/backtest-results-schema.test.ts tests/unit/services/backtesting-service.test.ts
rg -n "scenario_comparisons|comparison_configurations|comparison_access_history|portfolioIntelligenceService\\.comparisons" server shared client tests docs
```

## Risks And Tradeoffs

1. Hidden environment data is the only real reason not to drop immediately.
   The data audit gate exists to prevent accidental loss.

2. `shared/lib/data-boundaries.ts` already contains drifted naming. Cleaning
   only the schema without cleaning boundary metadata would preserve a false
   security model. The current list is both wrong and incomplete.

3. Leaving stale docs active after code cleanup would recreate the same product
   ambiguity in a different form.

4. Dropping only `scenario_comparisons` while leaving
   `comparison_configurations` and `comparison_access_history` would preserve a
   misleading half-model. This slice should retire the family together.

5. ADR cleanup matters here. Leaving ADR-013 marked as accepted would preserve
   a misleading architectural history even if the code and schema are cleaned
   correctly.

## Exit Criteria

Slice `3` is complete when:

- the repo no longer exports or uses the dormant saved-comparison schema family
- `portfolioIntelligenceService.comparisons` is gone
- schema-boundary and seeding helpers no longer reference the retired tables
- active docs no longer describe the removed runtime as current or pending
- a drop migration exists for the dormant family
- `migrations/meta/_journal.json` includes the live `0006` migration and the
  new Slice `3` drop migration in order
- the migration is guarded by a target-environment row-count audit
- `backtest_results.scenarioComparisons` and
  `backtest_results.scenarioComparisonSummary` remain intact
