---
phase: 06-schema-docs-and-baseline-drift-cleanup
plan: 01
type: findings
date: 2026-04-09
status: superseded-by-v2
---

# Plan 06-01 Introspect Findings — BLOCKING

Introspected live Neon endpoint (`ep-snowy-boat-ad1z3h07-pooler`) and diffed
against shared schema files. **Plan 06-01 underestimated scope by ~3x and
contains factual errors that require plan revision before execution.**

## Method

1. `drizzle-kit introspect` initially ran but wrote a STALE `migrations/schema.ts`
   (63 tables reported, but the file content diverged from live DB). Output
   was not trustworthy — see §"Drizzle-kit gotcha" below.
2. Switched to authoritative `information_schema.tables` query via direct
   `pg` client connection. **Live Neon has 49 public tables + 1 `drizzle_migrations`**.
3. Extracted all `pgTable('<name>', ...)` definitions from 12 schema files
   across `shared/*.ts`, `shared/schema/*.ts`, and `schema/src/*.ts`.
   **Shared files define 78 tables** (Plan 06-01 only looked at 3 files;
   reality has 12+).

## Summary: Live Neon vs Shared Schemas

| Category | Count | Plan expected |
|---|---|---|
| Live Neon public tables | 49 | (not cataloged) |
| Shared schema total | 78 | 66 (3 files only) |
| **Phantoms (shared, not in live)** | **30** | 11 + LP cluster verdict |
| **Orphans (live, not in shared)** | **0** | N/A |

## Phantom Breakdown (30 tables)

### A. Plan's 11 hard-delete targets — ALL CONFIRMED PHANTOMS ✓

The plan was correct on these:

1. `cohort_definitions`
2. `sector_taxonomy`
3. `sector_mappings`
4. `company_overrides`
5. `investment_overrides`
6. `notion_connections`
7. `notion_sync_jobs`
8. `notion_portfolio_configs`
9. `notion_database_mappings`
10. `scenario_matrices`
11. `optimization_sessions`

**Note:** An earlier analysis using the stale `migrations/schema.ts` from
drizzle-kit falsely reported the 4 Notion tables as "live" — authoritative
SQL disproved this. See §"Drizzle-kit gotcha" below.

### B. LP cluster — verdict `DELETE ALL 15`

The plan said "introspect-first; keep if live-DB-present, delete if absent".
**Live DB absence for all 15:**

From `shared/schema-lp-reporting.ts` (9 tables):
- `limited_partners`, `lp_fund_commitments`, `capital_activities`,
  `lp_distributions`, `lp_capital_accounts`, `lp_performance_snapshots`,
  `lp_reports`, `report_templates`, `lp_audit_log`

From `shared/schema-lp-sprint3.ts` (6 tables):
- `lp_capital_calls`, `lp_payment_submissions`, `lp_distribution_details`,
  `lp_documents`, `lp_notifications`, `lp_notification_preferences`

**Verdict:** None of the 15 LP tables exist in live Neon. Per plan, delete
both schema files. Plan's "keep-as-is if live-DB-present" clause does not
apply.

### C. Phantoms OUTSIDE plan scope — 4 newly surfaced

Plan 06-01 did NOT catalog these. Introspect surfaced them:

| Phantom | Defined in | Notes |
|---|---|---|
| `sensitivity_runs` | `shared/schema.ts` (`sensitivityRuns`) | REFL-037 noted sensitivity infra; may have dead code paths |
| `share_analytics` | `shared/schema/shares.ts` (`shareAnalytics`) | Shares-tracking subsystem, not in plan |
| `shares` | `shared/schema/shares.ts` (`shares`) | SAFE harbor shares table — needs dead-code audit before deleting |
| `snapshot_versions` | `shared/schema.ts` (`snapshotVersions`) | Distinct from `snapshot_comparisons` / `snapshot_metadata` which ARE live |

**Implication:** Plan's schema-file scope (3 files) is incomplete. Reality
includes `shared/schema/*.ts` and `schema/src/*.ts` which the plan never
mentions. Plan Task 4's file-deletion list is scoped too narrowly.

## Plan 06-01 Factual Errors

### E1. `jobOutbox` re-emit task is UNNECESSARY

Plan §"1 jobOutbox table — keep-add-migration" says:
> Confirm via introspect whether the table exists. If not, re-emit
> `shared/migrations/0001_create_job_outbox.sql` into the canonical `migrations/` path

**Reality:** `job_outbox` IS in live Neon (verified via
`information_schema.tables`). No migration re-emit needed. Skip the entire
subtask.

### E2. "15 LP tables" count slightly wrong

Plan says 15 LP tables across 2 files. Actual count is 15 — but the plan
also mentions 7 of these (the non-Sprint-3 ones) as potentially "live-DB-
present". None are. Revised verdict: DELETE ALL 15.

### E3. Schema-file scope underestimated

Plan names only:
- `shared/schema.ts`
- `shared/schema-lp-reporting.ts`
- `shared/schema-lp-sprint3.ts`

Reality defines tables in:
- `shared/schema.ts` (60 tables)
- `shared/schema-lp-reporting.ts` (9 tables)
- `shared/schema-lp-sprint3.ts` (6 tables)
- `shared/schema/fund.ts`
- `shared/schema/portfolio.ts`
- `shared/schema/scenario.ts`
- `shared/schema/shares.ts` (shares, share_analytics — 2 phantoms here)
- `schema/src/tables.ts`
- `schema/src/fund-management.ts`
- `schema/src/pipeline.ts`
- `schema/src/reserves.ts`
- `schema/src/other.ts`

Plan's hard-delete file list does not include edits to the additional files,
even though phantoms live there.

### E4. `migrations/schema.ts` from drizzle-kit is stale/untrusted

Running `drizzle-kit introspect --config=drizzle.config.ts` with
`DATABASE_URL` pointing at live Neon produced a `migrations/schema.ts` file
that contains `pgTable('notion_connections', ...)` and other entries that do
NOT exist in live Neon (confirmed via direct SQL query). Drizzle-kit emitted:

```
[✓] 63 tables fetched
[i] No SQL generated, you already have migrations in project
[✓] Your schema file is ready ➜ migrations\schema.ts
```

Hypothesis: drizzle-kit sees existing migration `.sql` files in `migrations/`
and merges/reuses their schema projection instead of a clean live-DB
snapshot. The `[i] No SQL generated` suggests it is NOT writing fresh SQL
from live state.

**Action:** Do NOT use `migrations/schema.ts` as a source of truth for future
plans. Use direct `information_schema.tables` queries instead. The two new
untracked files (`migrations/schema.ts` + `migrations/relations.ts`) should
be deleted, not committed.

## Drizzle-kit gotcha

When an earlier diff naively compared `migrations/schema.ts` (drizzle-kit
output) against `shared/schema.ts`, it produced FALSE POSITIVES — reporting
`notion_connections`, `notion_sync_jobs`, etc. as "live DB tables that the
plan wanted to delete". Direct SQL query proved those tables do NOT exist
in live Neon. Lesson: always cross-check drizzle-kit introspect output
against `SELECT table_name FROM information_schema.tables WHERE
table_schema='public'` before acting on a phantom/orphan verdict.

## Live Neon Public Tables (49 — authoritative)

```
activities, alert_evaluation_executions, alert_rules, audit_log,
backtest_results, calc_runs, custom_fields, custom_fieldvalues,
deal_opportunities, drizzle_migrations, due_diligence_items,
financial_projections, forecast_snapshots, fund_baselines,
fund_distributions, fund_events, fund_metrics, fund_snapshots,
fund_state_snapshots, fund_strategy_models, fundconfigs, funds,
investment_lots, investments, job_outbox, market_research,
monte_carlo_simulations, pacing_history, performance_alerts,
performance_forecasts, pipeline_activities, pipeline_stages,
portfolio_scenarios, portfoliocompanies, reallocation_audit,
reserve_allocation_strategies, reserve_allocations, reserve_decisions,
reserve_strategies, restoration_history, scenario_audit_logs,
scenario_cases, scenarios, scoring_models, snapshot_comparisons,
snapshot_metadata, users, variance_planner_leader, variance_reports
```

Plus `neon_auth.users_sync` (Neon-managed auth schema, not ours).

## Decision Required

Plan 06-01 as-written cannot execute safely. Three paths:

### Path A: Minimal subset (plan-as-written, corrected for E1)

Execute only the 11 plan-named phantom deletes + route/service cleanup.
Skip the `jobOutbox` subtask (it already exists). Leave LP cluster alone.
Leave the 4 out-of-scope phantoms alone. File a follow-up plan for the
rest.

- **Pros:** Matches plan contract; low blast radius; easy to review.
- **Cons:** Leaves 19 phantoms in place; LP schema files remain stale;
  phantom landmines partially persist.

### Path B: Full cleanup (all 30 phantoms)

Delete all 30 phantoms and their dependent code, per-cluster atomic commits:
1. Cohort cluster (5 tables + route + tests)
2. Notion cluster (4 tables + service)
3. Portfolio-optimization cluster (2 tables + service + route + tests + 2 SQL files)
4. LP cluster (15 tables + 2 schema files — verify no mounted routes first)
5. Extra phantoms (sensitivityRuns, shares/shareAnalytics, snapshotVersions — requires dead-code audit first)

- **Pros:** Leaves repo in a clean state matching live DB.
- **Cons:** Much larger blast radius; requires per-cluster dead-code audit;
  may uncover hidden dependencies; LP cluster deletion is permanent even
  though the tables might be re-added in a future sprint.

### Path C: Revise the plan first

Close Plan 06-01 with this findings doc as the outcome. Write a revised
Plan 06-01-v2 with the correct phantom inventory, the correct file scope
(12 schema files), the correct LP verdict, and the updated `jobOutbox`
status. Execute the v2 plan in a separate session.

- **Pros:** Preserves discipline (plan drives execution, not ad-hoc); v2
  is reviewable.
- **Cons:** Slower; requires another planning pass.

## Recommended: Path C

Per CLAUDE.md persistence rules and my own "planning docs drift from main"
memory feedback, revising the plan rather than executing ad-hoc is the safer
route. The plan-as-written has enough factual errors (wrong scope, wrong LP
verdict, unnecessary `jobOutbox` task, incomplete schema-file list) that
executing it would either miss cleanup work or create divergence from plan
intent. Closing the current plan with this findings doc and writing v2 gives
the next session a clean execution contract.

## Artifacts

- `.scratch/all-shared-snake.txt` — 78 table names from all 12 shared schema files
- `.scratch/live-sql-truth.txt` — 49 authoritative live Neon public tables
- `.scratch/shared-camel-map.json` — camelCase → snake_case + file mapping for every shared table
- `migrations/schema.ts` — drizzle-kit introspect output (STALE, DO NOT TRUST)
- `migrations/relations.ts` — drizzle-kit relations output
- `.env.local` — Neon connection string (gitignored, do NOT commit)

## Next Actions (pending user decision)

- [ ] User picks path A / B / C
- [ ] If A or B: proceed with per-cluster execution + per-cluster verification gates
- [ ] If C: close Plan 06-01, write Plan 06-01-v2 with corrected inventory
- [ ] Clean up: delete stale `migrations/schema.ts` + `migrations/relations.ts` (untracked) and optionally keep `.scratch/` as a sibling to 06-01-INTROSPECT-FINDINGS.md or delete it
- [ ] Decide whether to delete `.env.local` or keep it for future introspects
