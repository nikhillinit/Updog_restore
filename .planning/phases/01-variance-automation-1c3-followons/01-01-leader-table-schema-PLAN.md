---
phase: 01-variance-automation-1c3-followons
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - shared/schema.ts
  - server/db/migrations/0011_variance_planner_leader.sql
  - server/db/migrations/rollback/0011_variance_planner_leader_down.sql
  - scripts/check-leader-table.mjs
autonomous: true
requirements:
  - REQ-VAR-01
must_haves:
  truths:
    - 'variance_planner_leader table exists in shared/schema.ts as a Drizzle
      pgTable export'
    - 'Hand-written migration file 0011_variance_planner_leader.sql exists with
      the same shape'
    - 'Drizzle types VariancePlannerLeader and InsertVariancePlannerLeader are
      exported'
    - 'Schema is pushed to the live test DB via npm run db:push'
    - 'A cross-shell helper script verifies the live DB has the table'
  artifacts:
    - path: 'shared/schema.ts'
      provides: 'variancePlannerLeader Drizzle table export, type exports'
      contains: 'variancePlannerLeader = pgTable'
    - path: 'server/db/migrations/0011_variance_planner_leader.sql'
      provides: 'Hand-written audit-trail migration for the leader lease table'
      contains: 'CREATE TABLE IF NOT EXISTS variance_planner_leader'
    - path: 'server/db/migrations/rollback/0011_variance_planner_leader_down.sql'
      provides: 'Down migration for the leader lease table'
      contains: 'DROP TABLE IF EXISTS variance_planner_leader'
    - path: 'scripts/check-leader-table.mjs'
      provides:
        'Cross-shell verification that the live DB has the
        variance_planner_leader table'
      contains: 'information_schema.tables'
  key_links:
    - from: 'shared/schema.ts'
      to: 'drizzle ORM type generation'
      via:
        "pgTable export consumed by `import { variancePlannerLeader } from
        '@shared/schema'`"
      pattern: 'export const variancePlannerLeader'
---

<objective>
Create the `variance_planner_leader` heartbeat table that holds the single planner-loop leadership lease for `VarianceAlertAutomationService`. This is D-01 from CONTEXT.md — the planner uses an atomic `UPDATE ... WHERE lease_expires_at < now() OR instance_id = $me` against this row to acquire or renew leadership; advisory locks were rejected because Neon's PgBouncer transaction-mode pooler does not preserve session-scoped locks across queries, and Redis was rejected to avoid split-brain risk and `memory://` fallback drift in dev/test.

Purpose: ship the schema artifact and Drizzle types Plan 02 will consume. No
service code yet.

Output:

- Drizzle table definition added to `shared/schema.ts`
- Hand-written audit-trail migration in `server/db/migrations/0011_*.sql`
- Companion rollback in `server/db/migrations/rollback/`
- Cross-shell verification helper at `scripts/check-leader-table.mjs`
- Live test DB schema synchronized via `npm run db:push`

## Preconditions (read before running any task)

`DATABASE_URL` MUST be set in the shell environment before Task 2 runs. Per
MEMORY note "Neon Database", the user has a Neon free-tier endpoint
(`ep-snowy-boat-ad1z3h07-pooler`) whose connection string is stored locally, not
in committed env files. If `DATABASE_URL` is unset, the verification helper in
Task 2 will exit with a clear error message telling the operator to set it
before re-running — this keeps the task fully autonomous (no interactive "should
I stop?" branch) while still failing loudly instead of silently succeeding.
</objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
@CLAUDE.md
@docs/plans/2026-04-07-phase-1c3-variance-automation-followons-backlog.md

<interfaces>
<!-- Shape and naming pattern of an existing similar table — match this style. -->

From shared/schema.ts (jobOutbox, lines 2550-2587):

```typescript
export const jobOutbox = pgTable(
  'job_outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobType: varchar('job_type', { length: 255 }).notNull(),
    dedupeKey: text('dedupe_key'),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 50 }).notNull().default('pending'),
    priority: integer('priority').notNull().default(0),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    processingAt: timestamp('processing_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    jobTypeIdx: index('idx_job_outbox_job_type').on(table.jobType),
    dedupeKeyIdx: uniqueIndex('idx_job_outbox_job_type_dedupe').on(
      table.jobType,
      table.dedupeKey
    ),
  })
);

export type JobOutbox = typeof jobOutbox.$inferSelect;
export type InsertJobOutbox = typeof jobOutbox.$inferInsert;
```

From server/db/migrations/0009_calc_runs.sql (canonical hand-written migration
shape):

```sql
-- 0009_calc_runs.sql
-- Phase 2A Item 6: calcRuns table for dispatch state tracking

BEGIN;

CREATE TABLE IF NOT EXISTS calc_runs (
  id              SERIAL PRIMARY KEY,
  ...
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS calc_runs_fund_id_idx ON calc_runs (fund_id);

COMMIT;
```

Drizzle imports already in shared/schema.ts to reuse: `pgTable`, `uuid`, `text`,
`varchar`, `timestamp`, `index`, `uniqueIndex`, `sql` — no new imports needed.
</interfaces> </context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add variancePlannerLeader pgTable to shared/schema.ts</name>
  <files>shared/schema.ts</files>
  <read_first>
    - shared/schema.ts (lines 2540-2735 — jobOutbox table, insert schemas, type exports)
    - .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md (D-01, D-02, D-03, code_context § Reusable Assets, decisions § Claude's Discretion → Migration shape)
    - server/services/variance-alert-automation.ts (lines 1-50, 136-216 — to confirm import sites that will reference this table in Plan 02)
  </read_first>
  <action>
Add a new Drizzle pgTable definition `variancePlannerLeader` to `shared/schema.ts`. Insert it immediately AFTER the `jobOutbox` block (after line 2587) and BEFORE the `// Scenario Matrices Table` comment (line 2589). This keeps related operational tables grouped.

Exact shape (no deviations — these column names are referenced verbatim by Plan
02 and Plan 04):

```typescript
// Variance Planner Leader Table - Single-row heartbeat lease for planner loop
// leader election. See .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
// D-01 (heartbeat table chosen over advisory locks and Redis).
export const variancePlannerLeader = pgTable(
  'variance_planner_leader',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    instanceId: varchar('instance_id', { length: 255 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', {
      withTimezone: true,
    }).notNull(),
    lastRenewedAt: timestamp('last_renewed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    leaseExpiresIdx: index('idx_variance_planner_leader_lease_expires').on(
      table.leaseExpiresAt
    ),
  })
);
```

Notes on the column choices (do NOT alter):

- `id` is a constant string key (Plan 02 will hardcode `'variance-planner'` as
  the singleton row id) per D-03 (single global leader). Using a fixed PK lets
  the takeover SQL be a single `UPDATE ... WHERE id = 'variance-planner'` with
  no risk of orphan rows.
- `instance_id` is a varchar so the planner can use UUID, hostname, or
  `${hostname}:${pid}` interchangeably (Claude's Discretion in CONTEXT.md — Plan
  02 picks the format).
- `acquired_at` records when the CURRENT lease holder took the lease (resets on
  takeover). `last_renewed_at` records the most recent renewal heartbeat
  (updates on every successful renewal).
- The `leaseExpiresIdx` index supports the `WHERE lease_expires_at < now()`
  predicate in the takeover SQL even though the table is single-row — keeps the
  EXPLAIN clean and matches existing patterns like `idx_job_outbox_processing`.

Then add the corresponding Zod insert schema. Insert AFTER
`insertJobOutboxSchema` (around line 2710):

```typescript
export const insertVariancePlannerLeaderSchema = createInsertSchema(
  variancePlannerLeader
).omit({
  createdAt: true,
  updatedAt: true,
});
```

Then add the type exports. Insert AFTER `export type InsertJobOutbox` (around
line 2726):

```typescript
export type VariancePlannerLeader = typeof variancePlannerLeader.$inferSelect;
export type InsertVariancePlannerLeader =
  typeof variancePlannerLeader.$inferInsert;
```

Do NOT touch any other table, type, or insert schema in `shared/schema.ts`. Do
NOT add new imports — `pgTable`, `varchar`, `timestamp`, `index`, and
`createInsertSchema` are all already imported at the top of the file.

CRITICAL: After saving, immediately run `npm run check` to verify the file still
type-checks. If there are errors, do NOT proceed — fix them in this same task
before moving on. </action> <verify> <automated>npm run check</automated>
</verify> <acceptance_criteria> -
`grep -c "export const variancePlannerLeader = pgTable" shared/schema.ts`
returns `1` - `grep -c "'variance_planner_leader'" shared/schema.ts` returns
`1` - `grep -c "instance_id" shared/schema.ts` returns at least `1` -
`grep -c "lease_expires_at" shared/schema.ts` returns at least `1` -
`grep -c "last_renewed_at" shared/schema.ts` returns at least `1` -
`grep -c "idx_variance_planner_leader_lease_expires" shared/schema.ts` returns
`1` -
`grep -c "export const insertVariancePlannerLeaderSchema" shared/schema.ts`
returns `1` -
`grep -c "export type VariancePlannerLeader = typeof variancePlannerLeader.\$inferSelect" shared/schema.ts`
returns `1` -
`grep -c "export type InsertVariancePlannerLeader = typeof variancePlannerLeader.\$inferInsert" shared/schema.ts`
returns `1` - `npm run check` exits 0 - No deletions or modifications to
`jobOutbox`, `alertRules`, `scenarioMatrices`, or any other existing table
(verify with `git diff shared/schema.ts` — additions only)
</acceptance_criteria> <done>The Drizzle table, insert schema, and type exports
for `variancePlannerLeader` are present in `shared/schema.ts`, the file
type-checks, and `git diff` shows additions only.</done> </task>

<task type="auto" tdd="false">
  <name>Task 2: Author hand-written audit-trail migration 0011_variance_planner_leader.sql and cross-shell verification helper</name>
  <files>server/db/migrations/0011_variance_planner_leader.sql, server/db/migrations/rollback/0011_variance_planner_leader_down.sql, scripts/check-leader-table.mjs</files>
  <read_first>
    - server/db/migrations/0009_calc_runs.sql (canonical short-form migration shape — BEGIN/COMMIT, IF NOT EXISTS, index naming convention)
    - server/db/migrations/0010_snapshot_attribution.sql (most recent migration — confirms `0010` is the last sequence number, so the next is `0011`)
    - server/db/migrations/rollback/ (look at any *_down.sql to confirm the rollback file naming convention)
    - shared/schema.ts (the variancePlannerLeader block added in Task 1 — column names must match exactly)
    - .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md (canonical_refs § Migration)
    - CLAUDE.md § windows_environment (PowerShell is the default shell — verification scripts must not rely on bash-only quoting/escaping)
  </read_first>
  <action>
Create the two SQL files AND a small cross-shell verification helper script. The helper script is used by Task 3's `<verify>` block so the verification runs identically under both bash and PowerShell.

### File 1 — `server/db/migrations/0011_variance_planner_leader.sql`

```sql
-- 0011_variance_planner_leader.sql
-- Phase 1 (M8 1C.3 follow-ons) Item A: planner-loop leader election heartbeat table.
-- See .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md D-01.
-- Single-row table; the row id is the constant string 'variance-planner'.
-- Atomic takeover via UPDATE ... WHERE lease_expires_at < now() OR instance_id = $me.

BEGIN;

CREATE TABLE IF NOT EXISTS variance_planner_leader (
  id                VARCHAR(64) PRIMARY KEY,
  instance_id       VARCHAR(255) NOT NULL,
  acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at  TIMESTAMPTZ NOT NULL,
  last_renewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_variance_planner_leader_lease_expires
  ON variance_planner_leader (lease_expires_at);

COMMIT;
```

### File 2 — `server/db/migrations/rollback/0011_variance_planner_leader_down.sql`

```sql
-- 0011_variance_planner_leader_down.sql
-- Rollback for 0011_variance_planner_leader.sql

BEGIN;

DROP INDEX IF EXISTS idx_variance_planner_leader_lease_expires;
DROP TABLE IF EXISTS variance_planner_leader;

COMMIT;
```

### File 3 — `scripts/check-leader-table.mjs`

This small ESM script is used by Task 3's `<verify>` block. It runs identically
under bash and PowerShell because all quoting lives inside JavaScript string
literals — no shell escaping of `"` or `'` is required. It also handles the
`DATABASE_URL`-unset case with a clear exit code and error message, which is why
Task 3 can stay `autonomous: true` without a manual halt branch (M-2 fix).

```javascript
#!/usr/bin/env node
// scripts/check-leader-table.mjs
//
// Cross-shell verification that the live DB has the `variance_planner_leader`
// table. Used by Phase 01-variance-automation-1c3-followons Plan 01 Task 3's
// <verify> block so that the check runs identically under both bash (CI) and
// PowerShell (local dev on Windows). See CLAUDE.md § windows_environment.
//
// Exit codes:
//   0 — table exists in the live DB
//   2 — DATABASE_URL is not set (precondition failure — fix and re-run)
//   3 — DB connection failed
//   4 — table is missing from the live DB (Plan 01 Task 2 db:push did not run)
//
// Usage: node scripts/check-leader-table.mjs

import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(
      'ERROR: DATABASE_URL is not set. This plan requires a live Postgres connection string ' +
        'to verify the variance_planner_leader table was pushed successfully. Set DATABASE_URL ' +
        '(e.g. the Neon test endpoint from the MEMORY note "Neon Database") and re-run.'
    );
    process.exit(2);
  }

  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'variance_planner_leader'"
    );
    if (result.rows.length !== 1) {
      console.error(
        'ERROR: variance_planner_leader table is missing from the live DB. Run `npm run db:push` ' +
          'first (or confirm the Drizzle block in shared/schema.ts landed before this check).'
      );
      process.exit(4);
    }
    console.log('OK: variance_planner_leader table exists in the live DB');
    process.exit(0);
  } catch (err) {
    console.error(
      'ERROR: DB connection or query failed:',
      err instanceof Error ? err.message : String(err)
    );
    process.exit(3);
  } finally {
    await pool.end().catch(() => {
      /* ignore cleanup errors */
    });
  }
}

void main();
```

Notes on the SQL choices (do NOT alter):

- `TIMESTAMPTZ` matches Drizzle's `timestamp('...', { withTimezone: true })`.
- `VARCHAR(64)` for `id` and `VARCHAR(255)` for `instance_id` match the
  `varchar` lengths in the Drizzle definition.
- `IF NOT EXISTS` and `IF EXISTS` are used for idempotency, matching the
  convention in `0009_calc_runs.sql`.
- Index name matches the Drizzle index name
  `idx_variance_planner_leader_lease_expires` so a future drizzle-kit diff
  against the table is a no-op.
- Wrap in `BEGIN` / `COMMIT` like all peer migrations in this directory.

Notes on the helper script (do NOT alter):

- Uses `pg` directly (already a devDependency) rather than a Drizzle client
  because Task 3 is verifying the DB schema before Drizzle code in Plan 02 is
  committed.
- All error messages are plain ASCII — no emoji (CLAUDE.md § No Emoji Policy).
- Exit codes are distinct per failure mode so Task 3's `<verify>` can
  distinguish "precondition failure — operator must set DATABASE_URL" from
  "db:push did not run yet".

Do NOT modify any existing migration file. Do NOT renumber. The next sequence
number is `0011` (verified: `0010_snapshot_attribution.sql` is the latest).
</action> <verify> <automated>test -f
server/db/migrations/0011_variance_planner_leader.sql && test -f
server/db/migrations/rollback/0011_variance_planner_leader_down.sql && test -f
scripts/check-leader-table.mjs && grep -q "CREATE TABLE IF NOT EXISTS
variance_planner_leader" server/db/migrations/0011_variance_planner_leader.sql
&& grep -q "DROP TABLE IF EXISTS variance_planner_leader"
server/db/migrations/rollback/0011_variance_planner_leader_down.sql && grep -q
"information_schema.tables" scripts/check-leader-table.mjs</automated> </verify>
<acceptance_criteria> - File
`server/db/migrations/0011_variance_planner_leader.sql` exists - File
`server/db/migrations/rollback/0011_variance_planner_leader_down.sql` exists -
File `scripts/check-leader-table.mjs` exists -
`grep -c "CREATE TABLE IF NOT EXISTS variance_planner_leader" server/db/migrations/0011_variance_planner_leader.sql`
returns `1` -
`grep -c "lease_expires_at  TIMESTAMPTZ NOT NULL" server/db/migrations/0011_variance_planner_leader.sql`
returns `1` -
`grep -c "instance_id       VARCHAR(255) NOT NULL" server/db/migrations/0011_variance_planner_leader.sql`
returns `1` -
`grep -c "idx_variance_planner_leader_lease_expires" server/db/migrations/0011_variance_planner_leader.sql`
returns `1` -
`grep -c "DROP TABLE IF EXISTS variance_planner_leader" server/db/migrations/rollback/0011_variance_planner_leader_down.sql`
returns `1` -
`grep -c "information_schema.tables" scripts/check-leader-table.mjs` returns
`1` - `grep -c "process.env.DATABASE_URL" scripts/check-leader-table.mjs`
returns `1` - `grep -c "variance_planner_leader" scripts/check-leader-table.mjs`
returns at least `1` - No other migration files modified (verify with
`git status server/db/migrations/`) - SQL files start with `BEGIN;` and end with
`COMMIT;` - Helper script is plain ASCII (no emoji, no non-ASCII characters)
</acceptance_criteria> <done>Both SQL files exist with the correct shape, the
helper script exists and handles the DATABASE_URL-unset case explicitly, the
audit-trail migration matches the Drizzle table definition column-for-column,
and no existing migrations were renumbered or touched.</done> </task>

<task type="auto" tdd="false">
  <name>Task 3: Push schema to live database via npm run db:push</name>
  <files>(none — runtime-only DB sync)</files>
  <read_first>
    - package.json (line 39 — confirm `"db:push": "drizzle-kit push"`)
    - drizzle.config.ts (confirm schema array includes `./shared/schema.ts`)
    - shared/schema.ts (the variancePlannerLeader block from Task 1)
    - scripts/check-leader-table.mjs (the helper from Task 2 — this is what the `<verify>` block invokes)
    - CLAUDE.md § Database (`npm run db:push` is the schema push command)
    - CLAUDE.md § windows_environment (PowerShell is the default shell — do NOT inline `node -e` with mixed `"` and `'` quoting)
  </read_first>
  <action>
Run `npm run db:push` to synchronize the new `variance_planner_leader` table from `shared/schema.ts` into the live test database. This is REQUIRED — Plan 02's lease manager and Plan 04's integration test both query the table at runtime, so the table MUST exist in the live DB before those plans run. Build and type checks pass without this step (Drizzle types come from `shared/schema.ts`, not the live DB), creating a false-positive verification state if you skip it.

### Precondition: DATABASE_URL must be set

`DATABASE_URL` is a documented precondition for this plan (see the plan-level
`<objective>` block). If it is not set, `scripts/check-leader-table.mjs` will
exit 2 with a loud error message, failing this task's `<verify>` block. This is
the intended autonomous behavior — the task never prompts the user
interactively, it just fails loudly so the operator can set the env and re-run.
Per MEMORY note "Neon Database", the project uses a Neon free-tier endpoint; the
connection string is stored locally, not in committed env files.

### Execution steps

1. Run `npm run db:push`.
2. drizzle-kit will print the planned schema diff. The expected diff is exactly
   one `CREATE TABLE` for `variance_planner_leader` plus one `CREATE INDEX`. If
   drizzle-kit asks to drop or rename any other table, STOP — that means schema
   drift exists and you must investigate before proceeding.
3. Confirm the push succeeded by running `node scripts/check-leader-table.mjs`
   (the `<verify>` automation). The helper exits 0 only if the table is
   physically present in the live DB.

Do NOT modify any application code in this task. Do NOT seed any rows — the
lease manager in Plan 02 inserts the singleton row on first acquisition via
`INSERT ... ON CONFLICT DO UPDATE`.

If `npm run db:push` is interactive and prompts for confirmation in a way that
blocks non-TTY execution, fall back to `npx drizzle-kit push --force` (only if
the diff is exactly the expected CREATE TABLE — never use `--force` if there are
unexpected drops).

### Why a helper script instead of inline `node -e`

The previous revision of this plan used an inline `node -e "..."` one-liner in
the `<verify>` block. That command mixed bash single-quote wrappers with
JavaScript string literals containing double quotes, which PowerShell 7 (the
user's default shell per CLAUDE.md § windows_environment) parses differently
than bash. The helper script at `scripts/check-leader-table.mjs` (created in
Task 2) moves all quoting inside a JavaScript file so the shell layer sees only
`node scripts/check-leader-table.mjs` — identical behavior under bash,
PowerShell, and sh. See M-1 in the revision checker feedback. </action> <verify>
<automated>npm run db:push && node scripts/check-leader-table.mjs</automated>
</verify> <acceptance_criteria> - `npm run db:push` exits 0 -
`node scripts/check-leader-table.mjs` exits 0 and prints
`OK: variance_planner_leader table exists in the live DB` - If `DATABASE_URL`
was not set at the start of this task, the helper exits with a non-zero code (2)
and a clear error message — the task does NOT silently succeed and does NOT
prompt the operator interactively (M-2 — autonomous stays `true`) - No other
tables were dropped or renamed (compare drizzle-kit's diff output against the
expected single CREATE TABLE + CREATE INDEX) - The task runs identically under
bash and PowerShell (M-1 — no shell-specific escaping in the `<verify>` block)
</acceptance_criteria> <done>The `variance_planner_leader` table exists in the
live test database, drizzle-kit reported the expected single-table diff, the
cross-shell helper verifies the table via `information_schema.tables`, and no
other schema objects were modified.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary               | Description                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| application → database | Single Drizzle connection from `server/db.ts` is the only trust boundary. The new table is internal infrastructure with no external HTTP/UI access. |

## STRIDE Threat Register

| Threat ID | Category                 | Component                                      | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------- | ------------------------ | ---------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-01-01   | Tampering                | `variance_planner_leader` row                  | accept      | Single-row internal infrastructure table; only the variance automation service writes it. No external API surface. RBAC at the DB role layer is unchanged.                                                                                                                                                                                                                                                                                                       |
| T-01-02   | Information Disclosure   | `instance_id` column                           | accept      | Instance identity is not sensitive (hostname or UUID). No PII, no secrets.                                                                                                                                                                                                                                                                                                                                                                                       |
| T-01-03   | Denial of Service        | Lock contention on the single row              | mitigate    | The takeover predicate is `WHERE id = 'variance-planner' AND (lease_expires_at < now() OR instance_id = $me)` — single-row UPDATE, holds the row lock for microseconds, no FOR UPDATE. The `idx_variance_planner_leader_lease_expires` index supports the predicate and prevents seq scans even when the table grows (it should never, but defense in depth). Plan 02 wraps every call in `withTimeout` so a stuck UPDATE cannot stall the planner indefinitely. |
| T-01-04   | Elevation of Privilege   | Schema migration                               | accept      | Migration is hand-written SQL reviewed in the same PR; rollback exists; CREATE TABLE IF NOT EXISTS is idempotent. Push uses the same DB role as the rest of the app.                                                                                                                                                                                                                                                                                             |
| T-01-05   | False-green verification | cross-shell shell escaping in the verify block | mitigate    | Verification logic moved to `scripts/check-leader-table.mjs` so PowerShell and bash both just call `node scripts/check-leader-table.mjs`. Eliminates the inline `node -e "..."` quoting bug (M-1). The helper distinguishes "DATABASE_URL unset" (exit 2) from "table missing" (exit 4) so false-negatives are loud.                                                                                                                                             |

</threat_model>

<verification>
- `npm run check` passes after the schema edit
- `npm run db:push` reports exactly one CREATE TABLE + one CREATE INDEX, no drops
- `node scripts/check-leader-table.mjs` exits 0 and prints the OK line
- `git diff shared/schema.ts` shows additions only (no modifications to existing tables)
- New SQL files in `server/db/migrations/` and `server/db/migrations/rollback/` are present and well-formed
- New helper script at `scripts/check-leader-table.mjs` exists, handles all four exit codes, and is plain ASCII
</verification>

<success_criteria>

- Drizzle table export `variancePlannerLeader` and types `VariancePlannerLeader`
  / `InsertVariancePlannerLeader` are exported from `shared/schema.ts`
- Hand-written audit-trail migration `0011_variance_planner_leader.sql` exists
  alongside `0010_snapshot_attribution.sql`
- Companion rollback file exists in `server/db/migrations/rollback/`
- Cross-shell verification helper exists at `scripts/check-leader-table.mjs` and
  runs identically under bash and PowerShell
- The table physically exists in the live test DB (verified via the helper)
- `npm run check` is green
- No regressions: no other tables modified, no other migrations renumbered
- Task 3 stays `autonomous: true` — no interactive halt branches; failure modes
  surface via non-zero exit codes from the helper </success_criteria>

<output>
After completion, create `.planning/phases/01-variance-automation-1c3-followons/01-01-SUMMARY.md` documenting:
- Exact column shape of `variance_planner_leader`
- The next migration sequence number (0012)
- Confirmation that `npm run db:push` ran cleanly
- Any drift detected in the drizzle-kit diff
- The `scripts/check-leader-table.mjs` exit code matrix and which branches were exercised during verification
</output>
</content>
</invoke>
