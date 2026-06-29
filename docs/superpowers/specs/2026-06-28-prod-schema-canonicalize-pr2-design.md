---
status: DRAFT
created: 2026-06-29
source: docs/superpowers/plans/2026-06-28-prod-schema-drift-debate-synthesis.md
verified_head: 3524a1bfcc2ce05d3574430f92b39442c3df29d1
---

# PR-2 Schema Canonicalization Design

## Objective

Design PR-2 so schema canonicalization removes false-green and false-red
validation paths before any legacy migration surface is retired.

The approved strategy is:

- `shared/schema.ts`, `shared/schema-lp-reporting.ts`, and
  `shared/schema-lp-sprint3.ts` are the Drizzle shape source.
- `migrations/` plus `migrations/meta/_journal.json` is the journaled
  applied-SQL ledger.
- Production DDL is operator/reconcile-gated through
  `scripts/reconcile-prod-schema.mjs`; normal `db:push` is not the production
  apply path.
- `server/migrations/` and `shared/migrations/` are not deleted or ignored until
  PR-2 proves their active consumers and unique DDL content have been
  classified.

This spec approves PR-2a/PR-2b with amendments. It rejects the original four-way
topology because that design undercounted `shared/migrations`, missed direct
`server/migrations` consumers, and overstated production `db:push`.

## Verified Baseline

Live verification was refreshed on `main` at
`3524a1bfcc2ce05d3574430f92b39442c3df29d1`. `git status --short --branch`
reported `## main...origin/main` plus this spec as an untracked file:
`?? docs/superpowers/specs/2026-06-28-prod-schema-canonicalize-pr2-design.md`.

- `drizzle.config.ts:7-14` writes to `./migrations` and reads
  `./shared/schema.ts`, `./shared/schema-lp-reporting.ts`, and
  `./shared/schema-lp-sprint3.ts`.
- `package.json:35-49` has `release:check`, `validate:schema-drift`, and
  `db:push`; it has no `db:migrate` script.
- Root `migrations/` has 37 `.sql` files. `migrations/meta/_journal.json` has 22
  tags. All 22 tags have files, leaving 15 loose root SQL files:
  `0001_create_portfolio_tables`, `0001_portfolio_schema_hardening`,
  `0001_portfolio_schema_hardening_ROLLBACK`, `0002_add_organizations`,
  `0002_multi_tenant_rls_setup`, `0002_multi_tenant_rls_setup_ROLLBACK`,
  `0008_demo_profile_import_rows_rollback`, `001_lp_reporting_schema`,
  `002_lp_reporting_indexes`, `003_lp_dashboard_materialized_view`,
  `004_lp_sprint3_tables`, `20251030_stage_normalization_log`,
  `20251031_add_agent_memories`, `999_fix_materialized_view`,
  `manual-migration`.
- Journaled root SQL marker status is mixed. Drift patches `0012`, `0014`,
  `0016`, `0017`, and `0020` already carry `-- @drift-patch`, but existing
  journaled files including `0011_scenario_share_sensitivity_drift`,
  `0013_lp_reporting_core_drift`, and `0019_investments_id_fund_unique` have no
  `-- @generated` or `-- @drift-patch` marker. PR-2a must avoid false-reding
  these already-applied files as if they were new generated SQL.
- `tests/unit/mount-parity-migrations.test.ts:32-38` claims journaled migrations
  in the suite name at `:49`, but concatenates every root `migrations/*.sql`.
  That is the current false-green path.
- `tests/helpers/testcontainers.ts:81-103` applies Drizzle `./migrations` and
  then applies raw SQL from `./shared/migrations`. Those five shared SQL files
  are therefore live test setup until proven otherwise.
- `tests/helpers/testcontainers-migration.ts:61-89` already contains a
  journal-aware reader for one helper, but it falls back to sorted SQL files
  when no journal exists. PR-2a needs a canonical journal-only helper for root
  `migrations/`.
- `scripts/db-push-core.mjs:7-9` names the production refusal message;
  `:208-230` refuses explicit production URL matches, Vercel production, and a
  known production host; `scripts/db-push.mjs:86-157` runs postcheck sentinels
  after non-production `db:push`.
- `scripts/reconcile-prod-schema.mjs:42-60` is audit-only unless `--apply --yes`
  is present; `:75-87` requires a direct `DATABASE_URL` and refuses pooled URLs;
  `:150-162` already requires `-- @generated` or `-- @drift-patch`; `:330-362`
  prints an audit report and exits without DDL in audit-only mode; `:407-420`
  reads the target from `DATABASE_URL` and supports expected identity through
  `--expect-db` / `UPDOG_EXPECTED_DATABASE`.
- `scripts/deploy-production.ts:300-302` and `scripts/ga-checklist.mjs:429-433`
  still call `npm run db:migrate -- --dry-run`, which is stale because the
  package has no `db:migrate` script.
- `scripts/quality-gates.ts:455-470` prefers `server/migrations/` over
  `migrations/` whenever both directories exist. That is a false-red or
  false-green risk after root `migrations/` becomes canonical.
- `scripts/schema-drift-active-surfaces.ts:106-112`, `:158-164`, `:210-215`,
  `:257-262`, `:307-312`, and `:351-365` still use `server/migrations` patterns
  as migration evidence.
- Active tests/helpers still read `server/migrations` directly:
  `tests/integration/allocation-scenario-apply.test.ts:77-84`,
  `tests/helpers/apply-investment-round-constraints.ts:46-51`, and
  `tests/integration/lp-reporting-foundation-migration.test.ts:15-24, 43-45`.
- Shared schema comments still name exact `server/migrations` files, for example
  `shared/schema/lp-reporting-evidence.ts:4-13` and
  `shared/schema/investment-rounds.ts:1-9`.
- `server/migrations/` currently contains 57 SQL files.
- `shared/migrations/` currently contains five raw SQL files and is named in
  `scripts/release-check.mjs:32-36` as release-owned.
- `shared/migrations/` creates procedural objects, not only declarative shape:
  `0001_create_job_outbox.sql` creates `update_job_outbox_updated_at()` and
  `job_outbox_updated_at`; `0002_create_scenario_matrices.sql` creates
  `update_scenario_matrices_updated_at()` and `scenario_matrices_updated_at`;
  `0003_create_optimization_sessions.sql` creates
  `update_optimization_sessions_updated_at()` and
  `optimization_sessions_updated_at`.
- `vitest.config.testcontainers.ts` has an explicit include list and does not
  currently include `tests/integration/migration-shape-equivalence.test.ts`. A
  new shape-equivalence file with that name will not be collected unless the
  config is updated or the test reuses an already included path.

## RALPLAN-DR Summary

### Principles

1. Validate the same ledger the runtime/test path actually applies.
2. Do not retire or delete a legacy surface until all active consumers and
   unique DDL content have been inventoried.
3. Keep production DDL behind `scripts/reconcile-prod-schema.mjs`; use `db:push`
   only as a non-production shape-build path.
4. Prove catalog shape, not file identity: tables, columns, types, nullability,
   constraints, foreign keys, indexes, and any in-scope procedural objects must
   compare equal.
5. Prefer one canonical helper and one reconcile framework over parallel
   validators that can disagree.

### Decision Drivers

1. Eliminate false-green tests caused by loose root SQL files satisfying
   assertions without being journaled.
2. Eliminate false-red ops checks caused by stale `db:migrate` and
   `server/migrations` assumptions.
3. Preserve operator safety by deferring destructive cleanup until a green,
   evidence-backed canonical path exists.

### Options Considered

#### Option A: Original four-way topology

Approach: Treat root `migrations/`, shared schemas, `server/migrations/`, and
production `db:push` as peer surfaces and canonicalize them together.

Pros:

- Single narrative for all schema surfaces.
- Could reduce migration confusion in one pass.

Cons:

- Omits `shared/migrations`, even though Testcontainers applies it.
- Understates direct `server/migrations` consumers in scripts, tests, helpers,
  and comments.
- Overstates production `db:push`; current code refuses production `db:push` and
  points to reconcile.

Verdict: rejected.

#### Option B: Two-stage PR-2a/PR-2b

Approach: PR-2a adds validation teeth and reconcile alignment without deletions.
PR-2b folds and retires legacy surfaces only after PR-2a proves the canonical
path.

Pros:

- Fixes false validation paths before removing any legacy files.
- Keeps production mutation gated by the existing reconcile script.
- Allows `shared/migrations` and `server/migrations` to be classified from
  evidence instead of assumption.

Cons:

- Requires two PRs and two review passes.
- Leaves legacy directories present for one PR longer.

Verdict: selected.

#### Option C: Big-bang retirement

Approach: Move useful SQL to root `migrations/`, delete `server/migrations/`,
delete `shared/migrations/`, and fix all consumers in one PR.

Pros:

- Fastest path to an apparently clean topology.

Cons:

- Highest rollback cost.
- Can break active tests and helpers before proving the replacement path.
- Makes per-file orphan classification easy to skip.

Verdict: rejected.

## Canonical Topology After PR-2a

PR-2a should establish this truth model without deleting legacy directories:

| Surface                                                                            | Role                                                         | PR-2a treatment                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/schema.ts`, `shared/schema-lp-reporting.ts`, `shared/schema-lp-sprint3.ts` | Declarative Drizzle shape source                             | Keep as DB-B shape-build authority                                                                                                              |
| `migrations/meta/_journal.json` + tagged root `migrations/<tag>.sql`               | Canonical applied-SQL ledger                                 | Use journal tags only for ledger readers                                                                                                        |
| Loose root `migrations/*.sql`                                                      | Unclassified legacy SQL                                      | Detect and classify; do not use for parity proof                                                                                                |
| `shared/migrations/*.sql`                                                          | Raw Testcontainers-applied SQL, including functions/triggers | Prove on a like-for-like track: separate apply/introspect proof under Resolution A, or symmetric apply to both DB-A and DB-B under Resolution B |
| `server/migrations/*.sql`                                                          | Legacy direct-consumer ledger                                | Inventory and compare before any retirement                                                                                                     |
| `scripts/reconcile-prod-schema.mjs`                                                | Production audit/apply path                                  | Reuse; do not build a parallel reconciler                                                                                                       |
| `npm run db:push`                                                                  | Non-production Drizzle shape push                            | Keep production refusal/postcheck behavior                                                                                                      |

## PR-2a: Teeth + Reconcile, No Deletions

PR-2a must be a validation and alignment PR. It must not remove
`server/migrations/`, `shared/migrations/`, or loose root SQL files.

### 1. Add a Journal-Only Migration Reader Helper

Add a reusable helper, for example `scripts/migration-ledger.ts`, with exports
similar to:

- `readDrizzleJournal(rootDir, migrationsDir = 'migrations')`
- `readJournaledMigrationFiles(rootDir, migrationsDir = 'migrations')`
- `findLooseMigrationSql(rootDir, migrationsDir = 'migrations')`
- `classifyMigrationSqlFile(file, journalTags)`

Hard requirements:

- Root `migrations/` readers must use `_journal.json` order only.
- Missing `_journal.json` is a failure for canonical root migrations.
- A journal tag without a matching SQL file is a failure.
- A loose SQL file is never silently included in the journaled SQL set.
- The helper must preserve enough metadata for tests to print exact paths and
  classifications.

Do not reuse the fallback behavior from
`tests/helpers/testcontainers-migration.ts:83-90` for canonical root validation.
The fallback is useful for generic helper compatibility, but PR-2a needs a
strict reader for the canonical ledger.

### 2. Fix Mount-Parity to Read Journal Tags Only

Update `tests/unit/mount-parity-migrations.test.ts` so `migrationSql()` reads
only files named by `migrations/meta/_journal.json`.

Acceptance criteria:

- A loose root SQL file that creates a missing table does not make mount-parity
  pass.
- A missing journaled SQL file fails with the missing tag/path.
- The test name can keep "journaled migrations" because it will finally match
  the implementation.

Expected outcome and failure rule (verified at this baseline):

- The flip is expected to stay GREEN. At
  `3524a1bfcc2ce05d3574430f92b39442c3df29d1`, every C1 mounted table has its
  `CREATE TABLE` in a journaled file, not a loose one:
  `cohort_definitions`/`sector_taxonomy`/`sector_mappings`/`company_overrides`/
  `investment_overrides` in `0012_sector_variance_drift`; the seven LP/evidence
  tables (`vehicles`, `cash_flow_events`, `valuation_marks`, `lp_metric_runs`,
  `evidence_records`, `narrative_runs`, `lp_report_packages`,
  `lp_report_package_exports`) in `0014_lp_evidence_sprint3_drift`;
  `reconciliation_runs` in `0016_reconciliation_runs`; `fund_calculation_modes`
  in `0017_moic_exit_probability_modes`; `tasks` in
  `0020_operating_tasks_drift`. The implementer must re-verify this mapping
  before landing, because a loose file currently masks any future regression.
- If the flip turns RED for a mounted table, that is a real missing-journal
  finding, not a test that needs loosening. Fix it by journaling the table's DDL
  into the ledger with a marker (or a documented `-- @drift-patch`), never by
  re-including loose `migrations/*.sql` files into `migrationSql()`.

Recurrence guard for the mounted-table set itself (debate D6 — 3-voice
consensus):

- `C1_MOUNTED_TABLES` (`tests/unit/mount-parity-migrations.test.ts:7-24`) is a
  HARDCODED list. The journal-only flip fixes WHERE DDL is read but not WHICH
  tables must exist, so a newly mounted `makeApp` DB-backed route whose table
  nobody adds to the list passes parity and re-opens the original latent-500
  class. The hardcoded list is itself a latent false-green of the class this
  effort targets.
- PR-2a must add a cross-check between the mounted route surface
  (`server/app.ts` `makeApp` route registration) and `C1_MOUNTED_TABLES`: fail
  if a newly mounted DB-backed route is not classified as covered, deferred
  (`DEFERRED_DOMAIN_LOCKED_TABLES`), or non-table-backed. Keep
  `C1_MOUNTED_TABLES` as the enforcement set; full auto-derivation of tables
  from route handlers is not required, but an unclassified new mount must not
  pass silently.

### 3. Add Loose/Orphan SQL Detector and Classifier

Add a detector that reports every root SQL file not referenced by
`migrations/meta/_journal.json`.

Initial live loose list from this baseline:

- `0001_create_portfolio_tables`
- `0001_portfolio_schema_hardening`
- `0001_portfolio_schema_hardening_ROLLBACK`
- `0002_add_organizations`
- `0002_multi_tenant_rls_setup`
- `0002_multi_tenant_rls_setup_ROLLBACK`
- `0008_demo_profile_import_rows_rollback`
- `001_lp_reporting_schema`
- `002_lp_reporting_indexes`
- `003_lp_dashboard_materialized_view`
- `004_lp_sprint3_tables`
- `20251030_stage_normalization_log`
- `20251031_add_agent_memories`
- `999_fix_materialized_view`
- `manual-migration`

Classifier categories:

- `journaled-generated`: file is in `_journal.json` and marked `-- @generated`.
- `journaled-drift-patch`: file is in `_journal.json` and marked
  `-- @drift-patch`.
- `legacy-journaled-unmarked`: file is already in `_journal.json` at the PR-2a
  baseline but lacks `-- @generated` / `-- @drift-patch`. This is a remediation
  class, not a new-migration failure class. Known baseline examples include
  `0011_scenario_share_sensitivity_drift`, `0013_lp_reporting_core_drift`, and
  `0019_investments_id_fund_unique`.
- `loose-rollback`: file name or content indicates rollback/down SQL.
- `loose-legacy-drift`: file appears to be an older drift or manual repair.
- `loose-shared-ledger-candidate`: file overlaps `shared/migrations` or
  Testcontainers setup.
- `loose-server-ledger-candidate`: file overlaps `server/migrations`.
- `loose-materialized-view`: file creates/repairs a materialized view
  (`003_lp_dashboard_materialized_view`, `999_fix_materialized_view`). Called
  out because Drizzle shape push does not own materialized views, so these need
  an explicit PR-2b decision rather than landing in `unknown-loose` by default.
- `loose-rls`: file sets up row-level security or tenancy policy
  (`0002_multi_tenant_rls_setup`, `0002_multi_tenant_rls_setup_ROLLBACK`). Same
  rationale: RLS is not shape-source-emitted and needs a dedicated PR-2b call.
- `unknown-loose`: insufficient evidence; must block deletion.

PR-2a may mark files as unclassified or candidate classes, but it must not turn
all 15 loose files into delete candidates without per-file evidence.

### 4. Reuse Existing Marker Convention

Extend the existing reconcile marker convention across canonical migration
validation:

- `-- @generated` for Drizzle-generated SQL.
- `-- @drift-patch` for hand-authored, shape-preserving drift SQL.

Existing precedent:

- `scripts/reconcile-prod-schema.mjs:31-32` defines the marker regex.
- `scripts/reconcile-prod-schema.mjs:156-162` rejects manifest SQL without one
  of the markers.
- Current root migration drift patches already use `-- @drift-patch` on `0012`,
  `0014`, `0016`, `0017`, and `0020`.

Grandfather/remediation rule (debate D5 — REVISED to allowlist, 3-voice
consensus):

- Do NOT add markers by editing the already-applied `legacy-journaled-unmarked`
  files (`0011_scenario_share_sensitivity_drift`,
  `0013_lp_reporting_core_drift`, `0019_investments_id_fund_unique`). Even a
  comment-only edit changes the file's content, and Drizzle keys applied
  migrations by a SHA-256 of file content
  (`tests/helpers/testcontainers-migration.ts:127-133` `hashMigration()`;
  drizzle-orm `pg-core/dialect.js` stores that hash in `drizzle_migrations`). A
  content change perturbs the checksum surface and risks a mismatch in any
  environment that already ran `migrate()` against the old hash. (Prod uses
  `db:push`, not `migrate()`, and CI clones are fresh, so the practical risk is
  low — but it is non-zero and avoidable.)
- Instead, maintain a `LEGACY_JOURNALED_UNMARKED_ALLOWLIST` inside the validator
  (e.g. `scripts/migration-ledger.ts`), keyed by
  `{ tag, current content hash }`, listing the three tags above. The validator
  treats allowlisted tags as satisfying the marker requirement without a marker
  in the file.
- Keying the allowlist on the current content hash makes it self-tightening: if
  one of these files is later edited substantively, its hash no longer matches
  the allowlist entry, so the validator stops grandfathering it and forces it
  through the strict path below — exactly the desired behavior.
- The marker validator should report each allowlisted file by tag and matched
  hash so reviewers can see what is grandfathered versus newly marked.
- Strict marker + journal + snapshot requirements apply to everything NOT on the
  allowlist. New `-- @generated` files, or substantive edits to `-- @generated`
  files, must carry the matching `_journal.json` tag and
  `migrations/meta/*snapshot*` companion metadata.

For legacy loose files, classification may record missing markers without
editing them unless the file is promoted into the canonical ledger.

### 5. Add No-Hand-Edit Guard for Generated SQL

Add a guard in the migration validator, not a separate reconciliation framework.

The guard should reject generated SQL changes when the change does not look like
a Drizzle regeneration. A practical first version:

- `-- @generated` SQL under root `migrations/` may be added or changed only when
  the corresponding `_journal.json` tag and matching
  `migrations/meta/*snapshot*` metadata are present in the same change.
- `-- @drift-patch` SQL must be journaled and must include a short reason line
  after the marker, for example `-- Reason: production drift patch for ...`.
- New root SQL files without either marker fail validation.
- `legacy-journaled-unmarked` files are handled by the
  `LEGACY_JOURNALED_UNMARKED_ALLOWLIST` (see §4) and must NOT be edited to add a
  marker. If PR-2a (or any later change) modifies the executable SQL of one of
  those files, the content-hash key no longer matches the allowlist, the file
  drops out of grandfathering, and it must pass the same strict guard as any
  other journaled SQL change.
- Existing loose SQL files remain reported as loose/unclassified until PR-2b or
  a later cleanup PR classifies them.

Unit tests must prove:

- Missing marker fails.
- `-- @generated` without matching journal/meta context fails.
- `-- @drift-patch` without a reason fails.
- Legacy loose files are reported, not deleted.

### 6. Replace Stale `db:migrate --dry-run` References

Replace active operational callsites that invoke the nonexistent script:

- `scripts/deploy-production.ts:300-302`
- `scripts/ga-checklist.mjs:429-433`

Use the existing safe audit path:

```bash
node scripts/reconcile-prod-schema.mjs --manifest-dir scripts/prod-schema-manifests
```

The replacement command must run with a direct `DATABASE_URL`. The reconcile CLI
refuses missing, `memory://`, and pooled URLs because DDL requires the direct
database endpoint. When the target identity is known, pass `--expect-db <name>`
or set `UPDOG_EXPECTED_DATABASE=<name>` so the audit confirms the expected
database before reporting success.

Do not include `--apply --yes` in deploy or GA check preflight. Audit-only mode
is the intended dry-run equivalent because `scripts/reconcile-prod-schema.mjs`
exits before DDL unless `--apply --yes` is supplied. `--apply --yes` remains an
operator-only production mutation command outside PR-2a validation.

The deploy/GA preflight must not hard-fail when no direct endpoint is reachable.
Today `scripts/ga-checklist.mjs:429-436` always returns `false` because the
`db:migrate` script is missing, and `scripts/deploy-production.ts:299-303` runs
the check as `critical: false`. The replacement must preserve a non-blocking
posture in environments without a direct `DATABASE_URL`: detect a missing,
`memory://`, or pooled URL before invoking reconcile and SKIP with an explicit
`schema audit skipped: no direct DATABASE_URL` message, rather than letting the
reconcile CLI exit non-zero and re-introduce the false-red this section is
trying to remove. Run the audit only when a direct endpoint and the manifest dir
are both available. DECISION (2026-06-28 eng review): **the skip-guard is
SELECTED** over removing the schema check entirely, so a real audit signal is
preserved wherever a direct `DATABASE_URL` is available.

Unit tests must prove the replacement does not silently regress to a new
false-red or false-green:

- With no/`memory://`/pooled `DATABASE_URL`, the deploy/GA check SKIPS with the
  explicit message and returns a non-failing result (not a throw, not `false`).
- With a direct `DATABASE_URL` and a manifest dir, the check invokes the
  audit-only reconcile path (no `--apply --yes`) and surfaces its audit result.
- The check never passes `--apply --yes` from deploy or GA preflight.

Also update user-facing stale references in follow-up docs or console output
when touched, but the blocking PR-2a scope is the active deploy/GA scripts.

### 7. Add Shape-Equivalence Proof

Add a Testcontainers proof that compares two clean databases. Build both in the
same container as separate databases (`CREATE DATABASE`).

Reuse the existing journaled-clone harness instead of building a parallel one
(Principle 5). The journaled DB-A build mechanism already exists and is proven
green-in-CI: `tests/integration/prod-schema-clone.test.ts` spins up
`pgvector/pgvector:pg16`, applies the root journal in `_journal.json` order via
`tests/helpers/testcontainers-migration.ts` `runMigrationsWithConnectionString`
(Drizzle `migrate()` over journal tags only), and is already collected by
`vitest.config.testcontainers.ts`. That existing test does a ONE-SIDED sentinel
check (16 expected tables + constraints from the PR-1 manifests), not a
two-sided shape diff. "Reuse" therefore means EXTEND it to a two-sided DB-A vs
DB-B comparison, hosting the DB-B build and the catalog diff in or alongside
that file so they inherit its container, its journal-aware helper, and its
`skipIfNoDocker = !process.env.CI && process.platform === 'win32'` guard. A new
filename is acceptable only if it reuses the same helper/container and the PR
justifies the parallel validator against Principle 5; if used, it must be added
to the `vitest.config.testcontainers.ts` include list (see below). The
testcontainers global setup starts containers before the per-file
`skipIfNoDocker` guard, so on a host with no container runtime this command
HARD-FAILS in global setup, not as a clean skip; either way, local Windows is
NON-EVIDENCE. Real proof comes from CI or the supported Docker/Node environment,
the same evidence tier as `release:check`.

Extensions are defensive, not load-bearing on the current image. Keep a
`CREATE EXTENSION IF NOT EXISTS pgcrypto` (and `vector` if a vector column ever
enters scope) as cheap image-independent insurance, but do NOT justify it with
"both builds fail to construct without it" — that is empirically false on the
pg16 image. The journaled DB-A clone already builds with NO explicit extension
creation (`prod-schema-clone.test.ts` is green in CI): `gen_random_uuid()` is a
PostgreSQL 16 core function, and the only `CREATE EXTENSION vector` in root
`migrations/` lives in the LOOSE, non-journaled
`20251031_add_agent_memories.sql`, which the journaled path never applies. DB-B
(built from the three Drizzle shape sources) needs no `vector` either: none of
`shared/schema.ts`, `shared/schema-lp-reporting.ts`, or
`shared/schema-lp-sprint3.ts` declares a vector column. Match whatever the
chosen container image and shape source actually require, and confirm against
the existing harness rather than asserting a failure that does not occur.

- DB-A: journal-built path.
  - Create required extensions, then apply root `migrations/` in `_journal.json`
    order only. This is the equivalence assertion the M3 debate fixed: "apply
    all journaled `migrations/` to empty ⇒ catalog == `shared/schema`." The root
    journal, not `shared/migrations`, is the ledger being proven equivalent to
    the shape source.
- DB-B: shared-schema-built path.
  - Create the same extensions, then build schema from the Drizzle shape source
    used by `drizzle.config.ts`.
  - Prefer programmatic `drizzle-kit/api` `pushSchema` for DB-B. The existing
    non-production `db:push` wrapper is a fallback, but `scripts/db-push.mjs`
    runs prod-shaped postcheck sentinels after the push (`:86-157`) that can
    false-fail against a fresh shape-only DB-B and abort the build; if the
    wrapper is used, the postcheck must be bypassed or scoped for the disposable
    database. Either way, keep production refusal semantics intact.

Handle `shared/migrations` explicitly, because it is the part the original
design got wrong. It is FIVE files, not only the three procedural ones:
`0001`/`0002`/`0003` create base tables that ARE in the shape source
(`job_outbox`, `scenario_matrices`, and `optimization_sessions` are defined in
`shared/schema.ts`) PLUS procedural objects (the `update_*_updated_at` functions
and triggers) that a Drizzle `db:push` from the shape source structurally cannot
emit; `0004_variance_alert_automation.sql` adds an `alert_evaluation_executions`
table, a `job_outbox.dedupe_key` column, ordinary and partial unique indexes
(including `performance_alerts_open_incident_unique`), and a one-time data
`UPDATE`; `0005_backtest_scenario_comparison_summary.sql` adds a
`backtest_results.scenario_comparison_summary` JSONB column. Two consequences:

- The `shared/migrations` proof must introspect these non-procedural additions
  (table, columns, ordinary/partial indexes), not only `pg_trigger`/`pg_proc`,
  or it false-greens `0004`/`0005`. Under Resolution B the symmetric full-shape
  diff covers them automatically; under Resolution A the separate track must
  diff them explicitly.
- `shared/migrations` must be applied AFTER the base tables it references exist
  (`0004` carries FKs to `funds`, `fund_baselines`, `alert_rules`, `calc_runs`,
  `performance_alerts`), mirroring the live helper order
  (`tests/helpers/testcontainers.ts` applies Drizzle `./migrations` first, then
  raw `shared/migrations`). The `0004` data `UPDATE` is a no-op on an empty
  clone, so it is an ordering/dependency concern, not a data-correctness risk in
  the proof.

Therefore:

- Do NOT apply `shared/migrations` to DB-A only and then assert DB-A == DB-B
  including procedural objects. That comparison is red by construction: DB-A has
  triggers/functions DB-B can never contain. Including `shared/migrations`
  one-sidedly while also comparing `pg_trigger`/`pg_proc` (below) cannot go
  green.
- DECISION (2026-06-28 eng review): **Resolution A is SELECTED.** Resolution B
  is retained below only as the considered alternative. The proof keeps the core
  assertion root-journal vs `shared/schema` and proves the procedural-only
  `shared/migrations` objects on a separate NAMED-PRESENCE track (not a vacuous
  apply-and-introspect step — see the D2 hardening below).
  - Resolution A (SELECTED, M3-aligned): keep the core assertion as root-journal
    DB-A vs `shared/schema` DB-B. Put `shared/migrations` on a separate track.
    CRITICAL (debate D2 — 3-voice consensus): the separate track must NOT be a
    vacuous "apply-and-introspect" step. `shared/migrations` procedural objects
    have no shape-source counterpart to diff against, so "introspect" collapses
    into the existing apply-and-proceed
    (`tests/helpers/testcontainers.ts:88-103` asserts nothing) and proves
    nothing. Resolution A's track must instead be an explicit NAMED-PRESENCE
    assertion that FAILS if any expected object is absent:
    `update_job_outbox_updated_at()`, `update_scenario_matrices_updated_at()`,
    `update_optimization_sessions_updated_at()` (functions);
    `job_outbox_updated_at`, `scenario_matrices_updated_at`,
    `optimization_sessions_updated_at` (triggers); `alert_evaluation_executions`
    (table), `job_outbox.dedupe_key` (column),
    `idx_job_outbox_job_type_dedupe` + `performance_alerts_open_incident_unique`
    (indexes), `backtest_results.scenario_comparison_summary` (column).
  - Required per-object matrix (debate STRONGEST OBJECTION — Codex, confidence
    9/10): before scoping anything to the "no shape counterpart" track, PR-2a
    must build a matrix with columns `shared/migrations object` |
    `in shared/schema?` | `in root journal?` | `procedural-only?` |
    `Resolution A assertion`. The base tables `job_outbox`/`scenario_matrices`/
    `optimization_sessions` ARE in `shared/schema` (so they belong to the main
    journal-vs-shape sentinel gate, NOT the separate track), and the `0004`
    alert-automation objects may overlap the root-journal
    `0005_phase1c2_alert_automation` ledger entry — verify with local proof.
    Only objects that are genuinely procedural-only (the 3 functions + 3
    triggers) have "no shape-source counterpart"; everything else is covered by
    the sentinel gate and must not be double-counted or skipped. This matches
    the PR-2b plan to classify `shared/migrations` from evidence.
  - Resolution B: apply `shared/migrations/*.sql` symmetrically to BOTH DB-A and
    DB-B after each is built, so the procedural objects exist on both sides and
    the comparison is apples-to-apples. This proves the journaled ledger and the
    shape source agree AND that `shared/migrations` applies cleanly on top of
    both, at the cost of folding a raw-SQL surface into the equivalence proof.
- Do not silently drop `shared/migrations` from the test setup; both resolutions
  keep its DDL proven, just on a like-for-like footing.

The proof must be executable under the current Testcontainers Vitest config.

DECISION (2026-06-28 eng review): **Extend
`tests/integration/prod-schema-clone.test.ts`.** It is already collected by
`vitest.config.testcontainers.ts`, so NO include-list edit is required and there
is no risk of the gate silently never collecting the comparator. Add the DB-B
build and the two-sided catalog diff to that file (it does a one-sided 16-table
sentinel check today). A separate
`tests/integration/migration-shape-equivalence.test.ts` is the rejected
alternative; if a future change still wants it, it MUST be added to the
`vitest.config.testcontainers.ts` include list in the same change.

The PR evidence must show Vitest collected and ran the DB-A/DB-B comparator. A
source-only comparator that is never discovered by the configured gate is not
acceptable.

Two tiers: a deterministic GATING sentinel set, and a non-gating full-text
DIAGNOSTIC (debate D1 — 3-voice consensus). The mandatory full `pg_get_*` text
diff was demoted because raw catalog text (`int4` vs `integer`,
default-expression formatting, FK-action wording, def whitespace/quoting,
catalog-dependent ordering) is normalization-fragile and would false-RED — the
exact trust-eroding failure mode this effort fights. But demoting it must NOT
re-introduce a type-drift false-green, so the gating set below explicitly
includes normalized column TYPE and nullability, not just presence.

GATING sentinel set (a mismatch here FAILS the gate) — compared by normalized
NAME + shape, never by raw definition text:

- Tables in `public`.
- Columns by table and column name.
- Column type, normalized so equivalent spellings compare equal (`int4` ==
  `integer`, `timestamptz` == `timestamp with time zone`, etc.) — derived from
  catalog formatting, not only broad `information_schema.data_type`.
- Nullability.
- Primary keys, unique constraints, checks, and FKs, by `conname`.
- FK referenced table/columns and update/delete actions.
- Index names (`indexname`), uniqueness, and predicate (partial-index `WHERE`).

DIAGNOSTIC tier (reported as info, does NOT fail the gate unless a GATING
sentinel above also mismatches):

- `pg_get_constraintdef` / `pg_get_indexdef` / `pg_get_triggerdef` /
  `pg_get_functiondef` full text for in-scope objects, plus `pg_trigger` rows
  for in-scope user triggers (excluding PostgreSQL internal triggers) and the
  relevant `pg_proc` rows. Surface these for reviewer eyes; do not gate on their
  byte-equality.

Recommended catalog sources:

- `pg_class`, `pg_namespace`, `pg_attribute`, `pg_type`, and `format_type` for
  tables and column type details.
- `pg_constraint` and `pg_get_constraintdef` for PK/unique/check/FK shape.
- `pg_index`, `pg_class`, and `pg_get_indexdef` for indexes.
- `pg_trigger`, `pg_proc`, `pg_get_triggerdef`, and `pg_get_functiondef` for
  in-scope procedural shape.

Normalize identifier quoting and type spelling for the GATING sentinels, but
never drop constraint/FK/index names from the comparison — the prior bug class
was name-and-shape sensitive (a missing FK/unique name caused the 42830 that
silently skipped the following index). Reserve fragile whitespace/def-text
normalization for the diagnostic tier, where a mismatch only informs.

Exclude Drizzle's migration bookkeeping from the diff. If DB-A is built via the
reuse path (Drizzle `migrate()` in `runMigrationsWithConnectionString`, which
writes `migrationsTable: 'drizzle_migrations'`, `migrationsSchema: 'public'`),
DB-A gets a `public.drizzle_migrations` table that DB-B does not — `db:push` /
`drizzle-kit/api pushSchema` are stateless and create no migrations table. A
full `public`-table diff would therefore false-RED on `drizzle_migrations`
alone, the same red-by-construction class as the procedural-object asymmetry.
The comparator must exclude the bookkeeping relation
(`public.drizzle_migrations` under this config, or `__drizzle_migrations` if the
default schema is ever used) from the table/column/index comparison.

Procedural-object proof depends on composition. Under Resolution A (SELECTED),
prove the procedural-only objects by NAMED-PRESENCE assertion (the function/
trigger list above), NOT by a cross-DB `pg_trigger`/`pg_proc` diff — there is no
procedural counterpart on the shape side, so a diff is a guaranteed false-red.
Under Resolution B, a cross-DB `pg_trigger`/`pg_proc` diff is valid because both
sides applied the same raw SQL. Either way, do not omit the procedural objects
from their proof: `shared/migrations` carries executable behavior (the
`update_*_updated_at` triggers) that a table/column-only comparison would
false-green. Named-presence is the Resolution A escape from that false-green;
one-sided diffing against the Drizzle shape source is not.

### 8. Add Dual-Ledger Divergence Detector

Before any `server/migrations` retirement, add a detector that compares
`server/migrations/*.up.sql` to the canonical root journal ledger.

The detector should answer:

- Which server migration files create tables, columns, constraints, FKs, or
  indexes not present in the root journal plus `shared/migrations` DB-A build?
- Which server migration files are exact or shape-equivalent duplicates of root
  journal entries?
- Which server migration files are still read by tests/helpers/scripts?
- Which comments/contracts name exact server migration files and must be
  rewritten when the content moves?

PR-2a may land the detector and report divergence. PR-2b is the first PR allowed
to move or retire content based on that report.

CI semantics (debate D4 — 3-voice consensus, with Codex's crash/finding split):

- In PR-2a the detector is report-only: reported divergence ROWS are non-gating
  reviewer data and MUST NOT fail `npm run validate:schema-drift` or any other
  gate.
- BUT detector execution/parse ERRORS (the script throws, can't read a file,
  emits unparseable output) MUST fail CI — "report-only" must not silently
  swallow a broken detector and present an empty report as "no divergence."
- The divergence report MUST be attached to the PR description as a non-blocking
  artifact. PR-2b is where unresolved divergence becomes blocking.

### 9. Wire Validation Into Existing Gates

Do not create a competing reconciliation framework.

Preferred wiring:

- Keep `npm run validate:schema-drift` as the top-level PR-2a schema gate.
- Extend `scripts/schema-drift-active-surfaces.ts` or a helper it imports so the
  command also runs journal/orphan/marker validation.
- Keep `scripts/reconcile-prod-schema.mjs` responsible for production manifest
  audit/apply behavior.

## PR-2a Verification Gates

Required commands, split into two lanes (debate D3 — 3-voice consensus). Even
though PR-2a stays one PR (user decision), the gates must be split so the cheap
deterministic guards cannot be hidden behind the Docker proof's reliability.

Unit / deterministic lane (must pass INDEPENDENTLY of Docker; no skip):

```bash
npx cross-env TZ=UTC vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/mount-parity-migrations.test.ts
npx cross-env TZ=UTC vitest run --config vitest.config.mjs --configLoader native --project=server tests/unit/migration-ledger*.test.ts tests/unit/migration-marker*.test.ts
# deploy/GA skip-guard behavior (see PR-2a section 6)
npm run check
npm run lint
npm run validate:schema-drift
```

Docker / Testcontainers lane (real proof only in CI or the supported Docker/Node
environment):

```bash
npx cross-env TZ=UTC vitest run --config vitest.config.testcontainers.ts tests/integration/prod-schema-clone.test.ts
npm run release:check
```

The shape-equivalence proof extends
`tests/integration/prod-schema-clone.test.ts` (already in the include list — see
§7), so no `vitest.config.testcontainers.ts` edit is needed. The comparator must
actually instantiate DB-A and DB-B and compare catalog shape; a mock-only test
is insufficient. On local Windows without a container runtime, the
testcontainers global setup HARD-FAILS before the per-file `skipIfNoDocker`
guard can produce a clean skip; either way, local Windows is NON-EVIDENCE.
Merge requires BOTH lanes green: the unit lane proven locally or in CI, and the
Docker lane proven in CI / the supported environment. A flaky Docker proof must
never be able to mask a red unit-lane guard.

`npm run release:check` must run in the supported Docker/Node environment for
this repo. If the local environment cannot run the supported gate, the PR must
state that gap and include supported-environment release proof before merge.

PR-2a is not complete unless the PR description includes:

- Journal tag count, root SQL count, loose SQL count, and loose file list.
- Which `shared/migrations` resolution was used (A: separate track, or B:
  symmetric apply to both databases) and the like-for-like procedural-object
  comparison evidence, including the non-procedural `0004`/`0005` additions.
- Whether the comparator extended `tests/integration/prod-schema-clone.test.ts`
  / its helper and container, or used a new file; if new, the Principle 5
  justification and the `vitest.config.testcontainers.ts` include-list edit.
- Confirmation that the comparator excludes `public.drizzle_migrations` from the
  shape diff (the journaled DB-A build via `migrate()` creates it; DB-B does
  not).
- The extensions created (if any) and confirmation they match the image/shape
  requirements — note that the pg16 journaled clone builds with none, so this is
  defensive, not a precondition.
- Confirmation that the DB-A/DB-B comparator was collected and run by
  `vitest.config.testcontainers.ts` in CI or the supported environment (a local
  Windows run is not proof, and without a container runtime HARD-FAILS in
  global setup before `skipIfNoDocker` can produce a clean skip).
- The dual-ledger divergence report summary for `server/migrations`.
- Confirmation that deploy/GA no longer call `db:migrate --dry-run`.
- Confirmation that no production DDL was run.

## PR-2b: Fold + Retire

PR-2b can start only after PR-2a is green and reviewed. Its job is to remove the
legacy topology after the canonical validation path has teeth.

### 1. Inventory Every Direct `server/migrations` Consumer

The initial live inventory includes:

- `scripts/schema-drift-active-surfaces.ts`
- `scripts/quality-gates.ts`
- `scripts/run-migrations.ts`
- `tests/integration/allocation-scenario-apply.test.ts`
- `tests/helpers/apply-investment-round-constraints.ts`
- `tests/helpers/testcontainers.ts`
- `tests/integration/lp-reporting-foundation-migration.test.ts`
- `tests/unit/schema/schema-drift-active-surfaces.test.ts`
- `tests/unit/schema/lp-reporting-evidence-schema.test.ts`
- `server/services/sensitivity-run-service.ts`
- Shared schema comments under `shared/schema/*`, including
  `shared/schema/lp-reporting-evidence.ts`,
  `shared/schema/investment-rounds.ts`, and
  `shared/schema/investment-round-model-overrides.ts`
- Shared contract comments under `shared/contracts/lp-reporting/*`, including
  `cash-flow-event.contract.ts`, `evidence-record.contract.ts`,
  `lp-metric-run.contract.ts`, and `valuation-mark.contract.ts`
- Active script references to stale `db:migrate`, including
  `scripts/deploy-production.ts`, `scripts/ga-checklist.mjs`,
  `scripts/fix-critical-issues.ts`, and `scripts/verify-fixes.ts`
- Docs and historical plans that mention exact server migration paths, lower
  priority unless they instruct active behavior

PR-2b must refresh this list before editing with:

```bash
rg --line-number "server/migrations|shared/migrations|run-migrations|db:migrate" scripts tests shared server docs package.json
```

Treat active source, script, helper, and test references as blocking. Treat docs
and historical references as lower priority unless they still instruct active
operator or development behavior.

### 2. Repoint Active Gates

Update:

- `scripts/schema-drift-active-surfaces.ts`
- `tests/unit/schema/schema-drift-active-surfaces.test.ts`
- `scripts/quality-gates.ts`

Required behavior:

- Active migration evidence points to the canonical root journal ledger or to a
  documented drift patch.
- `quality-gates.ts` no longer prefers `server/migrations/` over `migrations/`.
- Missing canonical migration evidence fails with a path that points to the new
  ledger.

### 3. Update Tests, Helpers, and Schema Comments

Update exact server migration file references in:

- Test setup that reads server SQL directly.
- Helpers that extract constraints from server migration text.
- Shared schema and contract comments that say "mirrors
  `server/migrations/...`".

Where a test needs a small statement such as a constraint add, prefer importing
or generating it from the canonical journal/drift helper rather than copying SQL
into the test.

### 4. Migrate Unique Server Content

For each `server/migrations/*.up.sql` file:

- If the shape is already present in DB-A, mark it as duplicate and eligible for
  retirement.
- If the shape is absent but belongs in the current app, migrate it into the
  canonical root ledger as either Drizzle-generated SQL or a documented
  `-- @drift-patch`.
- If the shape is historical and no active code/tests require it, document the
  evidence and retire it with the directory.

Do not promote server `down.sql` files into the root canonical ledger unless a
specific forward-only recovery need is proven. Production reconcile remains
forward-only and ledgered.

### 5. Retire `server/migrations/` With a Guard

Only after active consumers are gone and unique content has been folded:

- Remove `server/migrations/`.
- Add a guard that rejects new files under `server/migrations/`.
- Update documentation that previously instructed new schema work to add
  `server/migrations` files.

The guard can live in the existing schema-drift or guardrails infrastructure; do
not add a standalone framework if an existing gate can own it.

### 6. Remove `scripts/run-migrations.ts` Last

`scripts/run-migrations.ts` reads `shared/migrations` and documents
`npm run db:migrate`, but package scripts no longer expose `db:migrate`.

Removal is allowed only after:

- Active `db:migrate` callsites have been removed or replaced.
- `shared/migrations` has been classified and either folded or intentionally
  retained.
- Docs/console output no longer direct operators to `npm run db:migrate`.

## PR-2b Verification Gates

PR-2b requires all PR-2a gates plus:

```bash
rg --line-number "server/migrations|db:migrate|run-migrations|shared/migrations" scripts tests shared server docs package.json
npm run validate:schema-drift
npm run release:check
```

`npm run release:check` must run in the supported Docker/Node environment for
this repo. If run outside that environment, the PR must state the environment
gap and include the supported-environment proof before merge.

PR-2b is not complete unless:

- The consumer inventory proves no active `server/migrations` dependency
  remains.
- Any retained `shared/migrations` usage is intentionally documented and covered
  by DB-A/DB-B shape proof.
- `scripts/run-migrations.ts` is removed only if no active callsite or retained
  shared-ledger role depends on it.
- The PR description names every server migration file with unique content and
  where it moved.

## Non-Goals

- Do not mutate production.
- Do not run production `db:push`.
- Do not delete `server/migrations/` in PR-2a.
- Do not delete or classify all 15 loose root SQL files as delete candidates
  without per-file evidence.
- Do not create a second production reconciliation framework parallel to
  `scripts/reconcile-prod-schema.mjs`.
- Do not weaken `db:push` production refusal or postcheck behavior.

## Open Risks and Mitigations

| Risk                                                                                        | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/migrations` may be real test setup, obsolete baggage, or a separate raw-SQL ledger. | PR-2a keeps its DDL proven on a like-for-like footing (Resolution A separate track or Resolution B symmetric apply), never one-sided in the journal-vs-shape assertion. PR-2b cannot remove it without consumer and shape evidence.                                                                                                                                                                           |
| Clean DB-A/DB-B builds fail before any comparison.                                          | Reuse the proven `prod-schema-clone.test.ts` journaled-build path, which already constructs a green clone on pg16. Add `CREATE EXTENSION IF NOT EXISTS` defensively, but treat extensions as image-dependent insurance, not a precondition: `gen_random_uuid()` is pg16 core, `vector` is only used by the loose (out-of-scope) `agent_memories` file, and no in-scope shape source declares a vector column. |
| Comparator false-REDs on Drizzle bookkeeping.                                               | If DB-A is built via `migrate()`, exclude `public.drizzle_migrations` (or `__drizzle_migrations`) from the table/column/index diff; DB-B via `db:push`/`pushSchema` is stateless and has no such table.                                                                                                                                                                                                       |
| New comparator duplicates the existing journaled-clone gate.                                | Extend `prod-schema-clone.test.ts` (one-sided sentinel today) into the two-sided diff, reusing its container, helper, and `skipIfNoDocker` guard, rather than adding a parallel validator.                                                                                                                                                                                                                    |
| Hidden `server/migrations` consumers exist.                                                 | PR-2b starts with a fresh `rg` inventory and updates active tests/helpers/scripts before retirement.                                                                                                                                                                                                                                                                                                          |
| Shape-equivalence can be too weak.                                                          | Compare constraints, FKs, indexes, types, and nullability, not only tables and columns.                                                                                                                                                                                                                                                                                                                       |
| Shape-equivalence false-greens procedural drift.                                            | Compare `pg_trigger`/`pg_proc` on a like-for-like composition (separate `shared/migrations` track, or symmetric apply to both DBs); never one-sided against the Drizzle shape source, which cannot emit triggers and would force a guaranteed false-red.                                                                                                                                                      |
| Reconcile replacement stays red where no direct endpoint exists.                            | Guard the deploy/GA check to skip with an explicit message when no direct `DATABASE_URL` is present; run the audit only when a direct endpoint and manifests are available.                                                                                                                                                                                                                                   |
| New Testcontainers comparator is never collected.                                           | Update `vitest.config.testcontainers.ts` include list or reuse an included test filename, and attach run evidence.                                                                                                                                                                                                                                                                                            |
| Stale ops scripts keep deploy/GA red.                                                       | PR-2a replaces active `db:migrate --dry-run` calls with audit-only reconcile.                                                                                                                                                                                                                                                                                                                                 |
| Generated SQL guard blocks legitimate Drizzle regeneration.                                 | Provide a documented regeneration path and tests for journal/meta companion changes.                                                                                                                                                                                                                                                                                                                          |
| Baseline journaled files without markers are false-reded.                                   | Classify them as `legacy-journaled-unmarked` and allow marker-only remediation before strict future rules apply.                                                                                                                                                                                                                                                                                              |
| Loose root files are silently relied on by tests.                                           | Mount-parity and ledger helpers must read journal tags only; loose files are reported separately.                                                                                                                                                                                                                                                                                                             |

## ADR

### Decision

Adopt the two-stage PR-2a/PR-2b plan. PR-2a adds journal-only validation,
orphan/marker guards, stale ops-script fixes, shape-equivalence proof, and
dual-ledger divergence detection without deleting legacy migration surfaces.
PR-2b folds and retires `server/migrations` only after PR-2a is green.

### Drivers

- Current mount-parity can pass from loose root SQL that Drizzle never applies.
- Current ops scripts still call a nonexistent `db:migrate` script.
- Current tests/helpers/scripts still consume `server/migrations` directly.
- Production DDL already has a reconcile/audit path and must remain
  operator-gated.

### Alternatives Considered

- Original four-way topology: rejected because it omits `shared/migrations`,
  undercounts `server/migrations` consumers, and misstates production `db:push`.
- Big-bang retirement: rejected because it raises rollback cost and can delete
  useful SQL before proving equivalence.

### Why Chosen

The selected split first makes validation truthful, then lets retirement proceed
from evidence. It keeps the production safety model intact and makes future
schema work choose between Drizzle-generated shape and documented drift patch
instead of ad hoc SQL surfaces.

### Consequences

- PR-2 takes two PRs instead of one.
- Legacy directories remain briefly, but with explicit detector output.
- The shape-equivalence Testcontainers proof is the main correctness bar for
  schema canonicalization, but post-D1 the GATING half is the normalized
  named-sentinel set (tables/columns/type/nullability/named constraints + FK
  actions/named indexes); the full `pg_get_*` catalog diff is a non-gating
  diagnostic. The bar is "named-shape equivalence," not byte-equal catalog text.

### Follow-ups

- After PR-2b, update any remaining historical docs that still teach
  `server/migrations` as the migration destination.
- Consider moving the shape comparator into a reusable release-check helper once
  it has proven stable.
- Consider adding a short `DECISIONS.md` entry if PR-2 changes the long-term
  migration authoring policy.

## Execution Handoff Guidance

Recommended `$ralph` path:

```bash
$ralph docs/superpowers/specs/2026-06-28-prod-schema-canonicalize-pr2-design.md
```

Use one sequential owner for PR-2a because it touches validation flow, tests,
and operational scripts that must stay coherent.

Recommended `$team` path if parallel execution is needed:

```bash
$team docs/superpowers/specs/2026-06-28-prod-schema-canonicalize-pr2-design.md
```

### Available-Agent-Types Roster and Staffing

- `explore`: refresh `server/migrations`, `shared/migrations`, and loose SQL
  consumers before edits.
- `executor`: implement helper, tests, and script rewires.
- `test-engineer`: build the DB-A/DB-B Testcontainers proof.
- `critic`: review the detector classifications and retirement preconditions.
- `verifier`: run gates and confirm no production mutation path was used.

Team verification path:

- Team proves PR-2a gates before shutdown.
- Ralph or a final verifier reruns `npm run validate:schema-drift` and the
  shape-equivalence Testcontainers gate after integration.
- PR-2b does not begin until PR-2a evidence is attached to the handoff.

## Changed Sections and Residual Risks

- Changed `Verified Baseline` to state the actual untracked spec status, mixed
  journal-marker baseline, direct reconcile URL requirement, procedural objects
  in `shared/migrations`, and explicit Testcontainers include-list behavior.
- Changed PR-2a marker rules to introduce `legacy-journaled-unmarked` and allow
  marker-only remediation for already-journaled SQL before strict future marker
  and snapshot rules apply.
- Changed DB-A/DB-B shape proof to keep `shared/migrations` procedural objects
  on a like-for-like track instead of applying them to only DB-A.
- Changed Testcontainers instructions so the comparator must be collected by
  `vitest.config.testcontainers.ts`, not merely added to the tree.
- Changed deploy/GA guidance to replace stale `db:migrate --dry-run` with
  audit-only `scripts/reconcile-prod-schema.mjs` using direct `DATABASE_URL`, no
  `--apply --yes`, and optional `--expect-db` / `UPDOG_EXPECTED_DATABASE`.
- Changed PR-2a gates to include `npm run check`, `npm run lint`, and
  supported-environment `npm run release:check` proof.
- Changed PR-2b inventory to call out active source/script/test references such
  as `server/services/sensitivity-run-service.ts`,
  `shared/contracts/lp-reporting/*.contract.ts`, `scripts/run-migrations.ts`,
  and current `rg` hits for migration surfaces.
- Changed DB-A/DB-B composition so the shape-equivalence assertion is
  root-journal vs `shared/schema` (M3-aligned), added required-extension
  preconditions for both databases, and resolved the procedural-object
  contradiction: a one-sided `shared/migrations` include plus `pg_trigger`/
  `pg_proc` comparison is red by construction, so the spec now requires a
  like-for-like composition (Resolution A separate track or Resolution B
  symmetric apply).
- Changed the deploy/GA reconcile replacement to require a
  skip-when-no-direct-URL guard so it does not re-introduce a false-red, and
  noted the skip-versus-remove open choice.

Second review pass (verified against `3524a1bf`):

- Changed §7 to reuse the existing green-in-CI journaled-clone harness
  (`tests/integration/prod-schema-clone.test.ts` +
  `runMigrationsWithConnectionString`) and extend it to a two-sided diff, rather
  than building a parallel comparator (Principle 5). Noted local Windows is not
  proof, and without a container runtime the testcontainers global setup
  HARD-FAILS before `skipIfNoDocker` can produce a clean skip.
- Corrected the extension precondition: the "both builds fail to construct
  without `pgcrypto`/`vector`" claim is empirically false on pg16. The journaled
  clone builds with no explicit extensions (`gen_random_uuid()` is pg16 core;
  the only `CREATE EXTENSION vector` is the loose, out-of-scope `agent_memories`
  file; no in-scope shape source declares a vector column). Extensions are kept
  as defensive insurance, not a precondition.
- Added a `drizzle_migrations` exclusion to the comparator: the
  `migrate()`-built DB-A creates `public.drizzle_migrations` that stateless DB-B
  lacks, a red-by-construction asymmetry on the table diff.
- Expanded the `shared/migrations` handling from three procedural files to all
  five, requiring the proof to introspect the non-procedural `0004`/`0005`
  additions and to apply `shared/migrations` after the base tables it
  references.
- Added §2 expected-outcome and failure-rule language: all 16 C1 tables are
  journaled today (`0012`/`0014`/`0016`/`0017`/`0020`) so the flip stays green;
  a red is a journaling gap to fix with a marker, never by re-including loose
  files.
- Updated the open-risks table and PR-2a checklist accordingly.

Eng-review pass (2026-06-28, decisions locked by user):

- PR-2a stays ONE PR (validation teeth bundled), not split — user decision over
  the reviewer's split recommendation; matches the debate-synthesis scoping.
- `shared/migrations` composition: Resolution A (separate track) SELECTED.
- Shape-equivalence comparator: EXTEND `prod-schema-clone.test.ts` (no
  include-list edit) SELECTED over a new file.
- Deploy/GA preflight: skip-when-no-direct-URL guard SELECTED over removal.
- Added a §6 unit-test requirement for the skip-guard (SKIP vs audit-run, never
  `--apply --yes`) — closes a regression-class test gap.
- Flagged the `db:push` wrapper postcheck-sentinel false-fail risk for the DB-B
  build; spec now prefers `drizzle-kit/api` `pushSchema`.

Hermes debate pass (2026-06-28, round 2 — Claude inline + Codex + Kimi
comparators). Evidence-strength caveat: the D1-D6 prompts were framed by a
Claude-authored brief that embedded Claude's own positions, so Codex/Kimi
agreement on D1-D6 is partly an ECHO, not independent triangulation. The
genuinely independent/additive findings came from the OPEN-ENDED prompt parts:
Codex's per-object matrix (STRONGEST OBJECTION → D2) and Kimi's completeness
sweep (§3 matview/RLS classes, the out-of-scope residual items). Treat D2/D6 as
triangulated and D1/D5 as Claude judgment calls (see flags below), not as
six-way validated consensus. No user-sovereign decision (one-PR, Resolution A,
extend-clone, skip-guard) was reversed; D1 and D5 DO reverse prior spec-author
positions and are flagged as such:

- D1 (JUDGMENT CALL — reverses the ADR's "comprehensive diff is the bar"): §7
  comparator split into a deterministic GATING sentinel set (tables, cols,
  normalized type, nullability, named constraints + FK actions, named indexes +
  predicate) and a non-gating full-text DIAGNOSTIC. Column TYPE stays in the
  gate so demotion does not re-introduce a type-drift false-green, but column
  DEFAULTS and CHECK-expression TEXT are now diagnostic-only — that is the cost
  of the demotion. Justified by THEORIZED normalization flakiness
  (`int4`/`integer`, def-text), NOT observed failures; the existing
  `prod-schema-clone.test.ts` sentinel approach is the green-in-CI precedent.
  User confirmed (2026-06-28): keep the sentinel gate + non-gating diagnostic.
- D2 + Codex STRONGEST OBJECTION: §7 Resolution A is now an explicit
  NAMED-PRESENCE assertion plus a required per-object matrix
  (`in shared/schema?` / `in root journal?` / `procedural-only?`); only the 3
  functions + 3 triggers are genuinely "no shape counterpart," the rest belong
  to the sentinel gate.
- D3: §PR-2a gates split into a unit/deterministic lane and a Docker lane; local
  Windows skip = non-evidence; merge needs both lanes green. Fixed the stale
  `migration-shape-equivalence.test.ts` gate reference to
  `prod-schema-clone.test.ts` per the extend-clone decision.
- D4: §8 detector CI semantics — divergence rows non-gating, but detector
  crash/parse errors fail CI; report attached to the PR.
- D5: §4/§5 marker remediation REVERSED from editing applied files to a
  validator-side `LEGACY_JOURNALED_UNMARKED_ALLOWLIST` keyed by tag + content
  hash, because a comment-only edit perturbs the Drizzle content-hash surface
  (`hashMigration()` + drizzle `pg-core/dialect.js`). User confirmed
  (2026-06-28): keep the allowlist; do not edit the applied files.
- D6: §2 added a `makeApp`-route-vs-`C1_MOUNTED_TABLES` cross-check — the
  hardcoded list was itself a latent false-green of the original latent-500
  class.
- §3 added `loose-materialized-view` and `loose-rls` classifier classes (Kimi
  completeness sweep) so matview/RLS loose files do not silently fall to
  `unknown-loose`.

Residual risks:

- `shared/migrations` may remain a valid raw-SQL test ledger; PR-2a must not
  retire it by assumption.
- Procedural-object comparison may require normalization beyond tables and
  constraints; reviewers should inspect any trigger/function diff carefully.
- Supported-environment `release:check` may be unavailable on a local Windows
  shell; merge readiness still requires proof from the supported repo
  environment.
- PR-2b can still uncover hidden active consumers after PR-2a lands; deletion
  remains blocked until the refreshed inventory is clean.
- The `shared/migrations` resolution is DECIDED: Resolution A (separate track),
  per the 2026-06-28 eng review. B remains documented as the considered
  alternative only.
- The reconcile audit in deploy/GA preflight depends on a direct endpoint; the
  skip-guard is DECIDED (2026-06-28 eng review) over removing the check, so it
  SKIPS with an explicit message in pooled-only or URL-less environments and
  runs the audit only where a direct `DATABASE_URL` is available. The skip-guard
  behavior must be unit-tested (see §6).
- One active script outside the named PR-2b inventory,
  `scripts/apply-scenario-drift-migrations.mjs`, contains only a "do NOT run
  `db:migrate` against prod" warning comment (not a callsite); the PR-2b `rg`
  refresh step already surfaces it, so it needs no special handling beyond the
  standard pass.
- The comparator's exclusion set (`drizzle_migrations` and any future Drizzle
  bookkeeping) is build-mechanism-dependent. If the DB-A build path changes away
  from Drizzle `migrate()`, re-check what bookkeeping relations exist on each
  side before trusting a full `public` diff.
- All 16 C1 tables are journaled at this baseline, so the §2 flip is green
  today, but a loose file masks regressions; the implementer must re-verify the
  table-to-tag mapping rather than assume it from this spec.
- `.claude/settings.local.json` still allowlists a `npm run db:migrate:status`
  command that no longer exists. This is a stale local permission entry, not
  operator/dev behavior, so it is out of PR-2 scope; noted here only for
  completeness alongside the other stale `db:migrate` references.
- Kimi completeness sweep flagged three items that are OPERATOR/PROD-PROOF
  concerns, explicitly OUT of PR-2a scope (PR-2a does not mutate prod and proves
  shape in `pg_catalog`, not the live symptom): (1) prod 5xx-log baseline/
  post-check for the affected routes (debate-synthesis M6); (2)
  `CREATE EXTENSION` privilege precheck on the Neon target before an operator
  apply; (3) post-apply smoke against a rounds-POPULATED fund (empty clones take
  the degraded branch regardless). These belong to the PR-1/operator-apply
  runbook, not PR-2a; listed so they are not lost.
- §5's generated-SQL guard says `-- @generated` files need "matching"
  `migrations/meta/*snapshot*` metadata but does not define what "matching"
  verifies (hash? presence?). Low-severity vagueness for the implementer to pin.
- The shape comparator is additive/presence-oriented and has no policy for
  intentional renames (a column moving between shape files appears as drop+add).
  Out of PR-2a scope (additive focus), flagged for future authoring policy.
