# Phase 6: Schema, Docs, and Baseline Drift Cleanup — Research

**Researched:** 2026-04-08 **Domain:** Drizzle schema reconciliation against
live Neon endpoint + documentation drift cleanup + baseline number sync
**Confidence:** HIGH

<user_constraints>

## User Constraints (from ROADMAP.md / REQUIREMENTS.md — no CONTEXT.md yet)

### Locked Decisions (from ROADMAP.md Phase 6 + REQUIREMENTS.md)

- REQ-DRIFT-01: Each phantom table MUST be resolved by exactly one of (a) create
  in live DB via a new hand-written migration, (b) delete from
  `shared/schema.ts` if no code references it, (c) gate behind a feature flag if
  planned for a future phase. Per-table decision required.
- REQ-DRIFT-01: A follow-up schema-introspection pass MUST report zero
  unexpected creates AND zero rename prompts.
- REQ-DRIFT-01: `npm run check` stays at 0 errors.
- REQ-DRIFT-02: A grep for hardcoded `\d+/\d+ truth` and
  `phoenix.*\d{2,3}/\d{2,3}` MUST return only deliberate live-command pointers
  (or numbers captured in a generated file that the live command refreshes).
- REQ-DRIFT-03: CLAUDE.md baseline numbers MUST match what
  `.baselines/console-prod-baseline.json`,
  `.baselines/eslint-file-disable-baseline.json`, and the current explicit-any
  count return on the day of the commit.
- Phase exit gates: `npm run check` exits 0; `npm run validate:core` exits 0;
  `npm run phoenix:truth` stays at live count.
- Stabilized perimeter: cannot reopen LP portal / KPI / Compass surfaces without
  explicit override.
- Hand-written SQL migrations are the project's real migration discipline.
  `drizzle-kit push` is unsafe against the live Neon endpoint (rename-prompt
  landmine).
- No emoji in code, docs, commits, logs. Conventional commits. TZ=UTC for tests.

### Claude's Discretion

- Plan split shape (1 / 2 / 3 plans) and wave structure.
- Order of drift items within a plan (schema vs docs first).
- Whether to fold REQ-DRIFT-02 + REQ-DRIFT-03 into one plan or keep separate.
- Specific phrasing of the "run `npm run phoenix:truth` for live count"
  replacement text.
- Which of delete / create-migration / gate is the right verdict for each
  phantom table (the research recommends, the discuss/plan phase ratifies).
- Whether to ship a REFL entry capturing the schema-drift lesson.

### Deferred Ideas (OUT OF SCOPE for Phase 6)

- The 363 explicit-`any` baseline drawdown (separate milestone-sized effort).
- Halving the console or eslint-disable baselines — that is Phase 7.
- Reopening LP / KPI / Compass surfaces.
- Rebuilding portfolio-optimization or cohort-analysis features — only
  reconciling their schema footprint.
- Migrating the project off hand-written SQL to drizzle-kit generate /
  drizzle-kit migrate (that is a bigger effort).
- Historical evidence in `.planning/phases/**/*SUMMARY.md` and `*CONTEXT.md`
  that records the phoenix truth count at execution time — these are forensic
  records, not drift.
- Number updates in `CHANGELOG.md` (append-only log), `docs/archive/**`,
  `archive/**`, `docs/PHOENIX-SOT/evidence-ledger.md` (historical record by
  design). </user_constraints>

<phase_requirements>

## Phase Requirements

| ID           | Description                                                  | Research Support                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REQ-DRIFT-01 | Reconcile `shared/schema.ts` against live Neon endpoint      | Phantom Table Verdict Matrix (below) enumerates all 65 tables across 3 schema files with per-table verdict. Non-destructive introspection command documented. Cohort-analysis landmine (`/api/cohorts` mounted, queries 5 phantom tables) identified.                                                                                   |
| REQ-DRIFT-02 | Remove hardcoded Phoenix truth-case counts from docs         | Classified hit list below distinguishes forward-looking prescriptions (rewrite) from historical evidence records (leave). 6 actionable files identified.                                                                                                                                                                                |
| REQ-DRIFT-03 | Update CLAUDE.md baseline numbers (374→39, 132→29, ~400→363) | ROADMAP targeting is WRONG. The numbers are NOT in `CLAUDE.md` — they live in `.planning/PROJECT.md` (5 hits), `.planning/codebase/CONCERNS.md` (2 hits), `.planning/codebase/CONVENTIONS.md` (1 hit), `.planning/codebase/INTEGRATIONS.md` (1 hit). 9 total hits in 4 files. Zero tripwire scripts hardcode 374/132 — pure doc update. |

</phase_requirements>

## Summary

Phase 6 is a mixed-risk cleanup with a clear asymmetry: REQ-DRIFT-01 is a
genuine runtime landmine (the mounted `/api/cohorts` route queries five tables
that do not exist in the live Neon endpoint, and any call would throw
`relation "cohort_definitions" does not exist`), while REQ-DRIFT-02 and
REQ-DRIFT-03 are low-risk text edits in planning/codebase docs. The three
requirements share nothing at the code level, so sequencing is dictated by risk,
not dependency.

**Primary recommendation:** Split into **2 plans**. Plan 06-01 handles
REQ-DRIFT-01 (schema reconciliation, high-risk) using non-destructive
`drizzle-kit introspect` against the live DB. Plan 06-02 bundles REQ-DRIFT-02 +
REQ-DRIFT-03 (doc drift, low-risk, same surface area). Run them in parallel
(Wave 1) — they touch disjoint files, so there's no merge conflict and no
dependency. If the solo dev wants to serialize, run Plan 06-02 first (zero risk,
zero tripwire impact, builds confidence), then Plan 06-01.

**Critical finding #1 (REQ-DRIFT-03 targeting error):** The ROADMAP and
REQUIREMENTS.md both say "update CLAUDE.md baseline numbers" — but `CLAUDE.md`
at project root does NOT contain "374", "132", or "~400" anywhere. A grep
confirms the stale numbers live in `.planning/PROJECT.md` (5 occurrences: lines
35, 110, 187, 286, 287), `.planning/codebase/CONCERNS.md` (2: lines 66, 68),
`.planning/codebase/CONVENTIONS.md` (1: line 110), and
`.planning/codebase/INTEGRATIONS.md` (1: line 126). REQ-DRIFT-03 acceptance
criteria must be rewritten against these actual targets, not CLAUDE.md.

**Critical finding #2 (zero tripwire impact):**
`scripts/guardrails/console-ratchet.mjs:7` and
`scripts/guardrails/eslint-disable-ratchet.mjs:7` read `.baselines/*.json` at
runtime — they do NOT hardcode 374 or 132. The only literal mentions of those
numbers are in prose docs. REQ-DRIFT-03 is a pure text edit with no pre-push
hook implications.

**Critical finding #3 (cohort_definitions is the active landmine):** The rename
prompt Plan 01-01 hit (`rename drizzle_migrations into cohort_definitions`) was
drizzle-kit's heuristic match because `cohort_definitions` exists in the Drizzle
schema but not in the live DB. `server/routes/cohort-analysis.ts` is mounted at
`/api/cohorts` in `server/app.ts:181` and queries five tables that are all
phantom: `cohortDefinitions`, `sectorTaxonomy`, `sectorMappings`,
`companyOverrides`, `investmentOverrides`. Any POST to `/api/cohorts/analyze`
will throw.

**Critical finding #4 (scenario_matrices / optimization_sessions are orphaned
phantoms):** Both tables are referenced by
`server/services/portfolio-optimization-service.ts` and
`server/routes/portfolio-optimization.ts`, but the route is NOT mounted in
`server/app.ts`. The code is dead surface. Hand-written migrations exist at
`shared/migrations/0001_create_job_outbox.sql`,
`0002_create_scenario_matrices.sql`, `0003_create_optimization_sessions.sql` —
but they are NOT in the `migrations/` directory that drizzle-kit/the deploy path
tracks, so they have never been applied to the live DB.

**Critical finding #5 (notion tables are phantoms AND dead code):**
`notionConnections`, `notionSyncJobs`, `notionPortfolioConfigs`,
`notionDatabaseMappings` are defined in `shared/schema.ts:1990,2016,2047,2090`,
used by `server/services/notion-service.ts`, but `notion-service.ts` is not
imported anywhere in the codebase. Pure delete candidates.

**Critical finding #6 (LP tables are phantoms BUT have SQL migrations in the old
path):** `shared/schema-lp-reporting.ts` (9 tables) and
`shared/schema-lp-sprint3.ts` (6 tables) have migrations in
`migrations/001_lp_reporting_schema.sql`,
`migrations/002_lp_reporting_indexes.sql`,
`migrations/004_lp_sprint3_tables.sql`. Whether those were applied to the live
Neon endpoint is unknown — the planner must confirm via
`drizzle-kit introspect`. LP routes are NOT mounted in `server/app.ts`
(stabilized perimeter exclusion), so they are dead surface regardless. Still, if
the tables DO exist in the live DB, "delete from schema" drops a data-containing
surface — verdict depends on introspection result.

## Phantom Table Verdict Matrix

Inventory of all 65 tables across the 3 schema files referenced in
`drizzle.config.ts`. `code-ref` count = files that import the camelCase symbol
from `@shared/schema*` (excludes the schema definition itself, type re-exports,
archive paths, and tests/utilities). Verdicts: **delete** (no live DB row, no
live code path), **keep-add-migration** (live code path needs the table
created), **introspect-first** (cannot decide without confirming what is in the
live Neon endpoint), **keep-as-is** (live in DB and live in code).

### shared/schema.ts (50 tables)

| Table                         | file:line               | code-refs | Verdict            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ----------------------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fundEvents`                  | `shared/schema.ts:39`   | many      | keep-as-is         | Active across server services and routes (per grep, 45 files reference snapshot/event/metric symbols). Live in Phase 2A path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sensitivityRuns`             | `shared/schema.ts:67`   | 4+        | keep-as-is         | `server/services/sensitivity-run-service.ts:14`, `tests/unit/services/sensitivity-run-service.test.ts:1`, Phase 4 surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `forecastSnapshots`           | `shared/schema.ts:101`  | 3+        | keep-as-is         | Used by performance-prediction service; canonical Phoenix surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `snapshotVersions`            | `shared/schema.ts:161`  | 5+        | keep-as-is         | `server/services/snapshot-version-service.ts:42`, `tests/unit/routes/snapshot-versions-restore.test.ts:2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reserveAllocations`          | `shared/schema.ts:218`  | 2+        | keep-as-is         | Reserve engine surface; covered by integration migrations.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `fundMetrics`                 | `shared/schema.ts:267`  | 5+        | keep-as-is         | `server/services/fund-metrics-calculator.ts:5`, attribution service, performance calculator.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `fundDistributions`           | `shared/schema.ts:301`  | 1+        | keep-as-is         | Migrated in `migrations/0003_phase0_runtime_alignment.sql` per Phase 0 cloud DB session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `activities`                  | `shared/schema.ts:316`  | 1+        | keep-as-is         | Generic activity log; depended on by `server/middleware/enhanced-audit.ts:2`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `dealOpportunities`           | `shared/schema.ts:329`  | many      | introspect-first   | Pipeline domain — covered by `migrations/0001_create_portfolio_tables.sql`, but Phase 6 cannot assume it ran. Confirm via introspect.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pipelineStages`              | `shared/schema.ts:355`  | many      | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dueDiligenceItems`           | `shared/schema.ts:365`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `scoringModels`               | `shared/schema.ts:382`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pipelineActivities`          | `shared/schema.ts:394`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `marketResearch`              | `shared/schema.ts:410`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `financialProjections`        | `shared/schema.ts:426`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `users`                       | `shared/schema.ts:471`  | many      | keep-as-is         | Auth surface; certainly live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `customFields`                | `shared/schema.ts:521`  | low       | introspect-first   | Old extensibility surface; verify presence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `customFieldValues`           | `shared/schema.ts:531`  | low       | introspect-first   | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reserveStrategies`           | `shared/schema.ts:613`  | 2+        | keep-as-is         | Reserve engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pacingHistory`               | `shared/schema.ts:635`  | 2+        | keep-as-is         | Pacing engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `auditLog`                    | `shared/schema.ts:684`  | 3+        | keep-as-is         | `server/middleware/enhanced-audit.ts`, audit logger.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `reserveDecisions`            | `shared/schema.ts:727`  | 2+        | keep-as-is         | Reserve engine.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fundStateSnapshots`          | `shared/schema.ts:772`  | 5+        | keep-as-is         | Phase 1 Phoenix surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `snapshotMetadata`            | `shared/schema.ts:827`  | 3+        | keep-as-is         | Snapshot service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `restorationHistory`          | `shared/schema.ts:868`  | 2+        | keep-as-is         | Snapshot restore flow (Phase 4 covered).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `snapshotComparisons`         | `shared/schema.ts:933`  | 2+        | introspect-first   | Phase 2 backtest dormant per migration `0007_phase2_retire_dormant_saved_comparison_persistence.sql`. Verify retirement state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `fundBaselines`               | `shared/schema.ts:1001` | 3+        | keep-as-is         | Variance baseline; live.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `varianceReports`             | `shared/schema.ts:1081` | 3+        | keep-as-is         | Variance tracking.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `performanceAlerts`           | `shared/schema.ts:1163` | 2+        | keep-as-is         | Alert service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `alertRules`                  | `shared/schema.ts:1258` | 2+        | keep-as-is         | Alert automation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `alertEvaluationExecutions`   | `shared/schema.ts:1314` | 2+        | keep-as-is         | Phase 1c2 migration `0005_phase1c2_alert_automation.sql`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `fundStrategyModels`          | `shared/schema.ts:1420` | 2+        | introspect-first   | Strategy model surface; confirm presence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `portfolioScenarios`          | `shared/schema.ts:1500` | 2+        | introspect-first   | Scenario surface, possibly retired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `reserveAllocationStrategies` | `shared/schema.ts:1590` | low       | introspect-first   | Confirm presence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `performanceForecasts`        | `shared/schema.ts:1689` | 2+        | introspect-first   | Performance prediction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `monteCarloSimulations`       | `shared/schema.ts:1791` | 2+        | introspect-first   | Monte Carlo surface; verify.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `reallocationAudit`           | `shared/schema.ts:1951` | 2+        | introspect-first   | Reallocation flow audit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `notionConnections`           | `shared/schema.ts:1990` | 1         | **delete**         | Only used by `server/services/notion-service.ts`, which has 0 importers in the codebase (`Grep notion-service` returned 1 file = self). Pure dead code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `notionSyncJobs`              | `shared/schema.ts:2016` | 1         | **delete**         | Same — dead service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `notionPortfolioConfigs`      | `shared/schema.ts:2047` | 1         | **delete**         | Same — dead service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `notionDatabaseMappings`      | `shared/schema.ts:2090` | 1         | **delete**         | Same — dead service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `backtestResults`             | `shared/schema.ts:2159` | 2+        | keep-as-is         | Migrated in `migrations/0005b_create_backtest_results.sql` per Phase 0 cloud DB session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `sectorTaxonomy`              | `shared/schema.ts:2313` | 2         | **delete**         | Only `server/routes/cohort-analysis.ts` uses it; that route's `/api/cohorts` mount IS live (`server/app.ts:181`) but has zero callers per stabilization perimeter. Plan must also unmount the route in `server/app.ts:180-181` (see Hazards).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `sectorMappings`              | `shared/schema.ts:2346` | 2         | **delete**         | Same as `sectorTaxonomy`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `companyOverrides`            | `shared/schema.ts:2387` | 2         | **delete**         | Same as `sectorTaxonomy`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `investmentOverrides`         | `shared/schema.ts:2420` | 2         | **delete**         | Same as `sectorTaxonomy`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cohortDefinitions`           | `shared/schema.ts:2457` | 2         | **delete**         | Drizzle-kit's rename heuristic that hit Plan 01-01 was matching to this exact phantom. Same as `sectorTaxonomy`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `jobOutbox`                   | `shared/schema.ts:2550` | 2+        | keep-add-migration | `shared/migrations/0001_create_job_outbox.sql` exists but lives in the orphan `shared/migrations/` path that is NOT in `drizzle.config.ts` `out`. Confirm not in live DB and either (a) re-emit as `migrations/000X_create_job_outbox.sql` in the canonical path and apply, or (b) delete the table from schema if no service uses it. Grep needed for `jobOutbox` consumers.                                                                                                                                                                                                                                                                                                                                   |
| `variancePlannerLeader`       | `shared/schema.ts:2592` | 2+        | introspect-first   | Variance planner surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scenarioMatrices`            | `shared/schema.ts:2609` | 5         | **delete**         | Used by `server/services/portfolio-optimization-service.ts`, `server/routes/portfolio-optimization.ts`, but the route is **NOT mounted in `server/app.ts`**. SQL migration `shared/migrations/0002_create_scenario_matrices.sql` exists in the orphan path only — never applied to live DB. 6 test/file references in `tests/` (`tests/integration/cache-monitoring.integration.test.ts:39,136,185`, `tests/unit/portfolio-optimization/portfolio-optimization-service.test.ts:39,99`, `tests/unit/schema/portfolio-optimization-schema.test.ts:17,121,125,...`, `tests/integration/ScenarioMatrixCache.integration.test.ts:9`) — these tests must be deleted or skipped as part of the same plan. See Hazards. |
| `optimizationSessions`        | `shared/schema.ts:2681` | 5         | **delete**         | Same as `scenarioMatrices` — entire portfolio-optimization surface is dead. SQL migration `shared/migrations/0003_create_optimization_sessions.sql` exists in orphan path only. Same test cleanup required.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### shared/schema-lp-reporting.ts (9 tables)

| Table                    | file:line                           | code-refs | Verdict          | Evidence                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------- | --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limitedPartners`        | `shared/schema-lp-reporting.ts:38`  | 18        | introspect-first | LP routes (`server/routes/lp-api.ts`, `lp-notifications.ts`, `lp-documents.ts`, `lp-distributions.ts`, `lp-capital-calls.ts`) are NOT mounted in `server/app.ts` (stabilized perimeter exclusion). But migrations `migrations/001_lp_reporting_schema.sql` + `002_lp_reporting_indexes.sql` exist in the canonical `migrations/` path. May actually be in live DB. Zero references in `tests/` and `client/`. |
| `lpFundCommitments`      | `shared/schema-lp-reporting.ts:70`  | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `capitalActivities`      | `shared/schema-lp-reporting.ts:107` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `lpDistributions`        | `shared/schema-lp-reporting.ts:151` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `lpCapitalAccounts`      | `shared/schema-lp-reporting.ts:182` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `lpPerformanceSnapshots` | `shared/schema-lp-reporting.ts:217` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `lpReports`              | `shared/schema-lp-reporting.ts:261` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `reportTemplates`        | `shared/schema-lp-reporting.ts:311` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |
| `lpAuditLog`             | `shared/schema-lp-reporting.ts:352` | 18        | introspect-first | Same as above.                                                                                                                                                                                                                                                                                                                                                                                                |

### shared/schema-lp-sprint3.ts (6 tables)

| Table                       | file:line                         | code-refs | Verdict          | Evidence                                                                                       |
| --------------------------- | --------------------------------- | --------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `lpCapitalCalls`            | `shared/schema-lp-sprint3.ts:43`  | 18        | introspect-first | Migration `migrations/004_lp_sprint3_tables.sql` exists in canonical path. Routes not mounted. |
| `lpPaymentSubmissions`      | `shared/schema-lp-sprint3.ts:128` | 18        | introspect-first | Same as above.                                                                                 |
| `lpDistributionDetails`     | `shared/schema-lp-sprint3.ts:179` | 18        | introspect-first | Same as above.                                                                                 |
| `lpDocuments`               | `shared/schema-lp-sprint3.ts:287` | 18        | introspect-first | Same as above.                                                                                 |
| `lpNotifications`           | `shared/schema-lp-sprint3.ts:361` | 18        | introspect-first | Same as above.                                                                                 |
| `lpNotificationPreferences` | `shared/schema-lp-sprint3.ts:419` | 18        | introspect-first | Same as above.                                                                                 |

**Verdict tally:** 4 notion + 5 cohort + 2 portfolio-optimization = **11 hard
delete** candidates. **15 LP** introspect-first. **17** introspect-first across
pipeline / scenarios / monte-carlo / variance-planner clusters. **22**
keep-as-is (active surface). **1** keep-add-migration (`jobOutbox`, pending grep
of consumers).

## Phantom Table Audit Command

The plan MUST NOT invoke `drizzle-kit push` (rename prompt landmine that already
burned Plan 01-01). Use `drizzle-kit introspect` instead — it issues
`pg_dump`-style read-only catalog queries against the live DB and writes the
result to `./drizzle/` (a fresh sub-directory the tool manages itself), without
touching `migrations/` or prompting for renames.

```bash
# Non-destructive: pulls live schema from $DATABASE_URL and writes it to ./drizzle
npx drizzle-kit introspect --config=drizzle.config.ts
```

Output to consume: `./drizzle/schema.ts` (the introspected snapshot of what is
actually in the live Neon endpoint). The plan should
`git add ./drizzle/schema.ts` to a scratch commit, diff it against
`shared/schema.ts` to confirm which phantom tables are truly missing, and then
drop the scratch commit. Do NOT leave `./drizzle/` in the working tree at plan
end.

If `drizzle-kit introspect` is unavailable or rejects the Neon pooler URL, fall
back to a direct catalog query via the existing `@neondatabase/serverless`
driver:

```bash
# Direct read-only catalog query — paste into a one-off scripts/audit-live-tables.mjs
node -e "
import('@neondatabase/serverless').then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql\`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name\`;
  for (const r of rows) console.log(r.table_name);
});
"
```

Both commands are read-only. Neither triggers a write or a rename prompt. Run
BOTH if there is any uncertainty about which one the planner trusts — they
should agree on the table list.

## REQ-DRIFT-02 Hit List

Live count today is **262/262 across 6 test files** (per Phase 5 close at
`.planning/STATE.md:231`). The deferred-ideas list explicitly excludes
`*SUMMARY.md`, `*CONTEXT.md`, `CHANGELOG.md`, `docs/archive/**`, and
`archive/**`. The remaining hits:

| File:line                                                                                  | Current text (paraphrased)                                                                              | Class                               | Action                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/ROADMAP.md:141`                                                                 | "`npm run phoenix:truth` stays at 262/262 (or whatever the live count is on the day Phase 6 lands)"     | forward-looking-prescription        | Replace with: `\`npm run phoenix:truth\` exits 0 (run \`npm run phoenix:truth\` for the live count).` Drop the embedded number.                                                                         |
| `.planning/REQUIREMENTS.md:54-61`                                                          | REQ-DRIFT-02 statement embedding "the current 262/262" as the example live count                        | forward-looking-prescription (meta) | Rewrite: replace `the current 262/262` with `the current live count from \`npm run phoenix:truth\``. The requirement IS the no-hardcoded-numbers rule — it must not contain the very number it forbids. |
| `.planning/PROJECT.md:152`                                                                 | "Phoenix truth cases: 258 → 262 (Plan 02-05 added 4 GFC scenario tests…)"                               | historical-record                   | **Leave** — this is an M8 recap describing what Phase 2 added. Numbers are pinned to the moment of the change; that is the point of a milestone log.                                                    |
| `.planning/PROJECT.md:184-185`                                                             | REQ-DRIFT-02 statement embedding "current live count is 262/262"                                        | forward-looking-prescription (meta) | Same as REQUIREMENTS.md:54-61: replace with `current live count from \`npm run phoenix:truth\``.                                                                                                        |
| `.planning/STATE.md:231`                                                                   | "`npm run phoenix:truth` 262/262 across 6 test files" (Phase 3 close paragraph)                         | historical-record                   | **Leave** — past-tense recap of phase closure on a specific day. Equivalent to a CHANGELOG entry; deferred per user constraints.                                                                        |
| `.planning/STATE.md:236`                                                                   | "`npm run phoenix:truth` 262/262 across 6 test files (was 258/258 across 5…)" (Phase 2 close paragraph) | historical-record                   | **Leave** — same reason as line 231.                                                                                                                                                                    |
| `.planning/phases/03-todo-report-remediation/03-01-archive-stale-docs-PLAN.md:168,186,201` | "Phoenix should still be 262/262" / "(still 262/262)"                                                   | historical-record                   | **Leave** — closed Plan 03-01, frozen at execution time. Effectively a SUMMARY artifact.                                                                                                                |

**Actionable rewrite count: 3 files (`ROADMAP.md`, `REQUIREMENTS.md`,
`PROJECT.md`).** The other hits in `.planning/phases/**` and `STATE.md`
past-tense recaps are deferred-by-policy. Earlier summary said "6 actionable
files" — that was an over-count from before classification; the correct number
after applying the deferred-ideas filter is **3**.

## REQ-DRIFT-03 Target Correction

**The ROADMAP and REQUIREMENTS.md REQ-DRIFT-03 phrasing is wrong.** They both
say "update CLAUDE.md baseline numbers" but a literal grep for `\b(374|132)\b`
in `CLAUDE.md` (project root) returns **zero matches**. The numbers live in
`.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`,
`.planning/codebase/CONVENTIONS.md`, and `.planning/codebase/INTEGRATIONS.md` —
and additionally in REQUIREMENTS.md and ROADMAP.md themselves (the requirements
that describe the drift).

| File:line                                                   | Current text                                                                                                                                    | Replacement                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning/PROJECT.md:35`                                   | `CLAUDE.md baseline numbers reflect reality (374→39, 132→29, ~400→363).`                                                                        | `Codebase doc baseline numbers reflect reality (console 39, eslint-disable 29, explicit-any 363) per .baselines/console-prod-baseline.json, .baselines/eslint-file-disable-baseline.json, and .baselines/eslint-output.json.`                                                                                                             |
| `.planning/PROJECT.md:110`                                  | `Console + eslint-disable ratchets prevent debt regression (374 / 132 …)`                                                                       | `Console + eslint-disable ratchets prevent debt regression (current totals 39 / 29 — see .baselines/*.json).`                                                                                                                                                                                                                             |
| `.planning/PROJECT.md:187`                                  | `CLAUDE.md says "374 / 132 baselines" for console / eslint-disable but`                                                                         | `.planning/codebase/CONCERNS.md says "374 / 132 baselines" for console / eslint-disable but` (corrects the meta-claim about where the stale numbers live; then the surrounding sentence remains valid).                                                                                                                                   |
| `.planning/PROJECT.md:189`                                  | ``.baselines/eslint-file-disable-baseline.json` is **29**. The `~400 any``                                                                      | (no change — this line states the correct live numbers; leave intact).                                                                                                                                                                                                                                                                    |
| `.planning/PROJECT.md:286-287`                              | `New code cannot increase the 374 disallowed-\`console\` baseline or the 132 file-level \`eslint-disable\` baseline.`                           | `New code cannot increase the disallowed-\`console\` or file-level \`eslint-disable\` baselines (current totals: 39 and 29 per \`.baselines/\*.json\`).`                                                                                                                                                                                  |
| `.planning/codebase/CONCERNS.md:62`                         | `\`@typescript-eslint/no-explicit-any\` — \`warn\` (target: \`error\`); ~400 pre-existing \`any\` types as of \`eslint.config.js:181\``         | `\`@typescript-eslint/no-explicit-any\` — \`warn\` (target: \`error\`); 363 pre-existing \`any\` types per \`.baselines/eslint-output.json\` (counted at \`eslint.config.js:181\` rule).`                                                                                                                                                 |
| `.planning/codebase/CONCERNS.md:66`                         | `\`no-console\` — \`warn\` with \`allow: ['warn','error']\`; **374 disallowed calls** at baseline (\`scripts/guardrails/console-ratchet.mjs\`)` | `\`no-console\` — \`warn\` with \`allow: ['warn','error']\`; **39 disallowed calls** at baseline per \`.baselines/console-prod-baseline.json\` (enforced by \`scripts/guardrails/console-ratchet.mjs\`).`                                                                                                                                 |
| `.planning/codebase/CONCERNS.md:68`                         | `\`eslint-disable\` directives — **132 file-level disables** at baseline (\`scripts/guardrails/eslint-disable-ratchet.mjs\`)`                   | `\`eslint-disable\` directives — **29 file-level disables** at baseline per \`.baselines/eslint-file-disable-baseline.json\` (enforced by \`scripts/guardrails/eslint-disable-ratchet.mjs\`).`                                                                                                                                            |
| `.planning/codebase/CONVENTIONS.md:14`                      | `~400 pre-existing baselines (\`eslint.config.js:181\`); the policy goal is`                                                                    | `363 pre-existing baselines per \`.baselines/eslint-output.json\` (rule at \`eslint.config.js:181\`); the policy goal is`                                                                                                                                                                                                                 |
| `.planning/codebase/CONVENTIONS.md:110`                     | `(baseline 374 disallowed calls — new code cannot add to it).`                                                                                  | `(baseline 39 disallowed calls per \`.baselines/console-prod-baseline.json\` — new code cannot add to it).`                                                                                                                                                                                                                               |
| `.planning/codebase/INTEGRATIONS.md:126-127`                | `Console-call ratchet at \`scripts/guardrails/console-ratchet.mjs\` (baseline 374 disallowed calls)`                                            | `Console-call ratchet at \`scripts/guardrails/console-ratchet.mjs\` (baseline 39 disallowed calls per \`.baselines/console-prod-baseline.json\`)`                                                                                                                                                                                         |
| `.planning/REQUIREMENTS.md:63-71` (REQ-DRIFT-03 acceptance) | `Update \`CLAUDE.md\` baseline numbers… CLAUDE.md says "374 / 132 baselines"… Acceptance: CLAUDE.md numbers match…`                             | Replace all four `CLAUDE.md` mentions with `.planning/PROJECT.md and .planning/codebase/{CONCERNS,CONVENTIONS,INTEGRATIONS}.md`. Acceptance becomes: "the four codebase doc files contain `39`, `29`, and `363` (or whatever the live baselines return on the day of the commit) and zero occurrences of `374`, `132`, or `~400` remain." |
| `.planning/ROADMAP.md:102`                                  | `REQ-DRIFT-03 — Update CLAUDE.md baseline numbers (374→39, 132→29, ~400→363)`                                                                   | `REQ-DRIFT-03 — Update .planning codebase doc baseline numbers (374→39, 132→29, ~400→363) in PROJECT.md, CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md`                                                                                                                                                                                    |

**Total: 13 hit-points across 6 files** (`PROJECT.md` ×5, `CONCERNS.md` ×3,
`CONVENTIONS.md` ×2, `INTEGRATIONS.md` ×1, `REQUIREMENTS.md` ×1 block,
`ROADMAP.md` ×1).

**Explicit retargeting statement (must appear in Plan 06-02 CONTEXT and
SUMMARY):** _CLAUDE.md at the project root does NOT contain "374", "132", or
"~400" anywhere. The ROADMAP REQ-DRIFT-03 phrasing is incorrect and is being
retargeted in this plan to the four `.planning/` codebase doc files where the
stale numbers actually live. REQUIREMENTS.md REQ-DRIFT-03 acceptance criteria is
rewritten in the same commit._

## Tripwire Script Audit

Goal: confirm zero pre-push/CI scripts hardcode 374, 132, or any explicit-`any`
count.

**Audited (clean):**

- `scripts/guardrails/console-ratchet.mjs:7` reads
  `.baselines/console-prod-baseline.json` at runtime via `readBaseline()` (lines
  72-77). Compares `current.total > baseline.total` (line 123). Zero literal
  `374` in the file.
- `scripts/guardrails/eslint-disable-ratchet.mjs:7` reads
  `.baselines/eslint-file-disable-baseline.json` at runtime via `readBaseline()`
  (lines 42-45). Compares `files.length > baseline.total` (line 77). Zero
  literal `132` in the file.

**Wider grep `\b(374|132)\b` across `scripts/`:** zero matches outside of
`scripts/validation/results/fees-validation-results.json` (numeric data in a
fees validation report — unrelated to baseline counts).

**Wider grep `\b400\b` across `scripts/`:** all matches are bundle size budgets
(`scripts/ai-tools/bundle-analyzer.mjs:106,415,533,535`,
`scripts/ai-tools/index.js:44,318,355`,
`scripts/ai-tools/orchestrate-bundle-optimization.mjs:14,422,430`,
`scripts/extract-bundle-size.mjs:140`), HTTP status codes
(`scripts/apply-lp-security-fixes.cjs:70-72`), and a domain rubric scale
(`scripts/calculate-domain-score.mjs`). Zero matches relate to explicit-`any`
count.

**Verdict:** REQ-DRIFT-03 has **zero tripwire impact**. It is a pure prose edit.
No script regeneration, no baseline rewrite, no `--write-baseline` invocation
needed. Plan 06-02 cannot break the pre-push hook.

## Plan Split Recommendation

| Plan      | Objective                                                                                                                                                                                                                                                     | files_modified                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Dependencies                                                   | Wave   | Autonomous                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **06-01** | REQ-DRIFT-01 — Reconcile `shared/schema.ts` against live Neon endpoint via `drizzle-kit introspect`, delete confirmed phantoms, unmount or unwire dead routes, delete orphaned tests for deleted tables.                                                      | `shared/schema.ts`, `shared/schema-lp-reporting.ts` (conditional on introspect result), `shared/schema-lp-sprint3.ts` (conditional), `server/app.ts` (unmount cohort route), `server/routes/cohort-analysis.ts` (delete or strip), `server/routes/portfolio-optimization.ts` (delete), `server/services/portfolio-optimization-service.ts` (delete), `server/services/notion-service.ts` (delete), `tests/integration/cache-monitoring.integration.test.ts` (delete or skip), `tests/integration/ScenarioMatrixCache.integration.test.ts` (delete or skip), `tests/unit/portfolio-optimization/**` (delete), `tests/unit/schema/portfolio-optimization-schema.test.ts` (delete), `shared/migrations/0002_create_scenario_matrices.sql` (delete — orphan), `shared/migrations/0003_create_optimization_sessions.sql` (delete — orphan). Optional: re-emit `jobOutbox` migration into canonical `migrations/` path if introspect confirms the table is needed but missing. | None — only depends on live DB read access via `$DATABASE_URL` | Wave 1 | **No** — requires introspect-then-decide cycle and unmount confirmation; the LP introspect-first cluster needs explicit human verdict per cluster. |
| **06-02** | REQ-DRIFT-02 + REQ-DRIFT-03 — Doc drift cleanup. Replace 3 forward-looking phoenix-count prescriptions and 13 hardcoded baseline numbers across 6 codebase doc files. Retarget REQ-DRIFT-03 statement in REQUIREMENTS.md and ROADMAP.md to the correct files. | `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/INTEGRATIONS.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None                                                           | Wave 1 | **Yes** — pure prose edits, zero code, zero tripwire impact, deterministic substitutions.                                                          |

**Wave assignment rationale:** Plans 06-01 and 06-02 touch disjoint files. There
is no merge-conflict risk and no logical dependency in either direction. Run
them as **two parallel tasks in Wave 1**.

**If serializing (solo dev preference):** Run **Plan 06-02 first**. Zero risk,
zero tripwire impact, deterministic outcome — rebuilds confidence after the
Phase 5 quarantine. Then Plan 06-01, which carries the introspect-then-decide
cycle and the route-unmount decision. **Do not** run 06-01 first; if it gets
stuck on the LP introspect cluster, 06-02 should still be allowed to land
independently.

## Validation Architecture

Phase 6 has no Phoenix calc-path implications, so the gate set is mostly "did
the build still pass". Per-task acceptance vs phase-exit gates:

| Gate                                             | Command                                                                                                            | Per-task or per-phase                                                        | Pass criterion                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript baseline                              | `npm run check`                                                                                                    | both                                                                         | exit 0, zero NEW errors vs `.tsc-baseline.json`. Plan 06-02 (prose only) should be a no-op. Plan 06-01 (deletes types/symbols) MUST verify no remaining import resolves to a deleted symbol. |
| Core delivery gate                               | `npm run validate:core`                                                                                            | per-phase                                                                    | exit 0.                                                                                                                                                                                      |
| Phoenix calc gate                                | `npm run phoenix:truth`                                                                                            | per-phase                                                                    | exit 0. Phase 6 must NOT change the count vs the day-of baseline (phase touches no calc paths).                                                                                              |
| Live schema diff (Plan 06-01 only)               | `npx drizzle-kit introspect --config=drizzle.config.ts` then diff `./drizzle/schema.ts` against `shared/schema.ts` | per-task                                                                     | Zero unexpected creates, zero rename prompts. The diff should show only the deleted phantom tables, nothing else.                                                                            |
| Drift post-check (Plan 06-02 only)               | grep `\b(374                                                                                                       | 132)\b`across`.planning/`and project-root`\*.md`                             | per-task acceptance                                                                                                                                                                          | Zero matches inside actively-rewritten files. Plan summary must report the post-grep count.                                                                                      |
| Phoenix-count drift post-check (Plan 06-02 only) | grep `phoenix.\*\d{2,3}/\d{2,3}                                                                                    | \d{2,3}/\d{2,3}\s\*truth`across`.planning/{ROADMAP,REQUIREMENTS,PROJECT}.md` | per-task acceptance                                                                                                                                                                          | Zero hardcoded number matches in the 3 actively-rewritten files. Hits in `STATE.md`, `*SUMMARY.md`, `*CONTEXT.md`, `*PLAN.md`, `CHANGELOG.md` are deferred-by-policy and remain. |
| Lint regression check                            | `npm run lint` (or at minimum `npm run lint -- --max-warnings 0` on touched files)                                 | per-task                                                                     | No new lint errors. Plan 06-02 should be a no-op. Plan 06-01 must run after deletions.                                                                                                       |
| Tripwire ratchets                                | `node scripts/guardrails/console-ratchet.mjs && node scripts/guardrails/eslint-disable-ratchet.mjs`                | per-phase                                                                    | Both exit 0 (current ≤ baseline). Plan 06-01 deletes consume at most a handful of files; counts only go down.                                                                                |
| Pre-push hook                                    | `git push` runs `baseline:check`                                                                                   | per-phase                                                                    | exits 0. The hook compiles client/server/shared separately — Plan 06-01 deletes must hold up under that stricter compile.                                                                    |

**Per-task commit cadence:** Each plan commits after each major step
(introspect/diff scratch, schema delete, route unmount, test cleanup for 06-01;
one file per commit for 06-02). All exit gates run at phase end via
`/gsd-verify-work`.

## Hazards and Rollback

### Plan 06-01 hazards

**Hazard 1: cohort-analysis route is mounted but the tables it queries are
phantoms.** `server/app.ts:181` mounts `cohortAnalysisRouter` at `/api/cohorts`,
and `server/routes/cohort-analysis.ts` issues
`db.select().from(cohortDefinitions)` and similar against five tables that do
not exist in the live DB. **This is a pre-existing broken state** (any POST to
`/api/cohorts/analyze` would throw
`relation "cohort_definitions" does not exist`), but Plan 06-01 must not
silently make it worse. Decision matrix: (a) delete
`server/routes/cohort-analysis.ts` AND remove the `app.use('/api/cohorts', …)`
mount and the import at `server/app.ts:28` — this is the cleanest, since the
route was already non-functional; or (b) leave the route file in place but
unmount it, explicitly noting in the Plan 06-01 SUMMARY that the route is being
preserved as dead code for future re-enablement. Recommendation: **option (a)**
— delete entirely. The 5 phantom tables fall out naturally.

**Hazard 2: `drizzle-kit push` rename prompt.** This is exactly what Plan 01-01
hit. **Plan 06-01 must not invoke `drizzle-kit push` under any circumstance.**
Use `drizzle-kit introspect` (read-only) for the audit and hand-written SQL
`migrations/000X_*.sql` for any creates. Add a check to the plan:
`git grep -n "drizzle-kit push" PLAN.md SUMMARY.md` should return nothing.

**Hazard 3: tests imported from phantom symbols.** Pre-deletion grep for
`cohortDefinitions|sectorTaxonomy|sectorMappings|companyOverrides|investmentOverrides|scenarioMatrices|optimizationSessions|notionConnections`
across `tests/` returns:

| Test file                                                                  | Hit count                                                                                                                     | Action                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/cohorts/resolvers.test.ts`                                     | 5 (all field names of `ResolutionInput`)                                                                                      | **Keep** — does NOT import from `@shared/schema`; tests the client-side `getResolvedInvestments` resolver. The names happen to match because the resolver mirrors the table column names. |
| `tests/integration/cache-monitoring.integration.test.ts`                   | 9 (`scenarioMatrices` import + inserts at lines 39, 136, 185)                                                                 | **Delete or hard-skip** when `scenarioMatrices` is removed from schema. This test imports from `@shared/schema` and inserts into the table.                                               |
| `tests/integration/ScenarioMatrixCache.integration.test.ts`                | 9                                                                                                                             | **Delete or hard-skip** — same reason.                                                                                                                                                    |
| `tests/unit/portfolio-optimization/portfolio-optimization-service.test.ts` | 4                                                                                                                             | **Delete** alongside the deleted service.                                                                                                                                                 |
| `tests/unit/schema/portfolio-optimization-schema.test.ts`                  | 19                                                                                                                            | **Delete** — pure schema introspection test for tables that no longer exist.                                                                                                              |
| `tests/helpers/testcontainers-seeder.ts`                                   | 1                                                                                                                             | **Inspect** — likely a seeding helper. If it references the deleted symbols, prune those references.                                                                                      |
| Cohort/notion/LP table grep across `tests/` (full set)                     | 0 in `client/`, 0 in `tests/` for LP, 0 in `tests/` for notion, 5 in `tests/` for cohort (the resolver field-name test above) | **No additional action** for cohort, notion, or LP.                                                                                                                                       |

Total tests to delete: **3** (`cache-monitoring.integration`,
`ScenarioMatrixCache.integration`, `portfolio-optimization-service`,
`portfolio-optimization-schema`) plus a possible inspection of
`testcontainers-seeder.ts`. The cohort `resolvers.test.ts` is safe — it does not
import Drizzle symbols.

**Hazard 4: LP introspect surprise.** If `drizzle-kit introspect` reveals that
the LP tables ARE in the live Neon endpoint (because
`migrations/001_lp_reporting_schema.sql`, `002_lp_reporting_indexes.sql`,
`004_lp_sprint3_tables.sql` were applied at some point), then "delete from
schema" drops a data-bearing surface. In that case the verdict for all 15 LP
tables flips from `delete` to `keep-as-is` (even though the routes are
unmounted), and Plan 06-01 limits its deletes to the cohort + notion +
portfolio-optimization clusters only. The plan must explicitly branch on the
introspect result before any LP-related delete.

### Plan 06-01 rollback

```bash
# Single-commit rollback
git revert <06-01-commit-sha>

# Multi-commit rollback
git log --oneline | head -20            # find the SHA range
git revert --no-commit <oldest>..<HEAD>
git commit -m "revert(06-01): rollback schema reconciliation"
```

If a route was unmounted in `server/app.ts` and a follow-up commit removed the
import, the revert will restore both atomically as long as they were in the same
commit. The plan SHOULD bundle (route unmount + import removal + route file
delete) into one commit per route to keep the revert clean.

### Plan 06-02 hazards

**Hazard 1: nothing to break.** Pure prose edits in `.planning/` and codebase
doc files. No code, no tripwire, no test. The only failure mode is mis-targeted
text.

**Hazard 2: REQ-DRIFT-03 self-reference.** When rewriting REQUIREMENTS.md
REQ-DRIFT-03 itself, the old text contains the very word "CLAUDE.md" that needs
to be replaced. The plan must use a search-and-replace that targets the four
`.planning/codebase/*.md` paths specifically — a naive
`s/CLAUDE.md/.planning\/PROJECT.md/g` would damage other CLAUDE.md mentions in
other files.

### Plan 06-02 rollback

```bash
git revert <06-02-commit-sha>
```

Single-commit revert is sufficient. If the planner chose multi-commit (one per
file), revert in reverse chronological order. There is no test or build state to
recover.

## RESEARCH COMPLETE
