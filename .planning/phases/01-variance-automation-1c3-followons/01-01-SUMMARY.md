---
phase: 01-variance-automation-1c3-followons
plan: 01-01
status: complete
completed: 2026-04-07
---

# Plan 01-01: Leader Table Schema — SUMMARY

## What was built

The Drizzle table definition, hand-written audit-trail migration, rollback, and
cross-shell verification helper for `variance_planner_leader` — the single-row
heartbeat lease that Plan 01-02's lease manager will atomically acquire, renew,
and release.

## Artifacts delivered

- `shared/schema.ts` — `variancePlannerLeader` pgTable + insert schema + type
  exports (`VariancePlannerLeader`, `InsertVariancePlannerLeader`)
- `server/db/migrations/0011_variance_planner_leader.sql` — hand-written CREATE
  TABLE IF NOT EXISTS + CREATE INDEX wrapped in BEGIN/COMMIT
- `server/db/migrations/rollback/0011_variance_planner_leader_down.sql` — DROP
  INDEX + DROP TABLE
- `scripts/check-leader-table.mjs` — plain-ASCII pg.Pool helper, distinct exit
  codes 0/2/3/4

## Exact column shape (verified against live DB)

```
id                VARCHAR(64)   NOT NULL  PRIMARY KEY
instance_id       VARCHAR(255)  NOT NULL
acquired_at       TIMESTAMPTZ   NOT NULL  DEFAULT NOW()
lease_expires_at  TIMESTAMPTZ   NOT NULL
last_renewed_at   TIMESTAMPTZ   NOT NULL  DEFAULT NOW()
created_at        TIMESTAMPTZ   NOT NULL  DEFAULT NOW()
updated_at        TIMESTAMPTZ   NOT NULL  DEFAULT NOW()
```

Indexes:

- `variance_planner_leader_pkey` — implicit PK on `id`
- `idx_variance_planner_leader_lease_expires` — on `lease_expires_at`, supports
  the takeover predicate

Next migration sequence number: **0012**.

## Deviation from plan spec — Task 3

**Plan Task 3 said:** Run
`npm run db:push && node scripts/check-leader-table.mjs`.

**What actually ran:** Direct `pg.Client` application of
`server/db/migrations/0011_variance_planner_leader.sql` in a transaction,
followed by the helper script for verification.

**Why the deviation:** `npm run db:push` was actively unsafe against the Neon
test endpoint the user provided. drizzle-kit detected significant drift between
the combined Drizzle schema files (`shared/schema.ts` +
`schema-lp-reporting.ts` + `schema-lp-sprint3.ts`) and the live DB (48 tables in
`public`), and surfaced an interactive prompt asking whether to **rename
`drizzle_migrations` into `cohort_definitions`**. Answering wrong would destroy
the Drizzle migration-history tracker. The prompt also implied multiple other
create-vs-rename decisions for `scenario_matrices`, `optimization_sessions`, and
other tables present in the schema files but absent from the live DB.

**Why direct-apply is correct:** All 9 existing migrations
(`0002_concurrency_safety.sql` through `0010_snapshot_attribution.sql`) are
hand-written SQL applied manually, NOT via drizzle-kit push. The project's real
migration discipline is hand-written. Task 2 produced a column-for-column match
of the Drizzle definition, making direct application equivalent to drizzle-kit
push for this specific delta (creates one new table

- one index, touches nothing else). `IF NOT EXISTS` + `BEGIN/COMMIT` keep it
  idempotent and transactional.

**Flag for follow-up (NOT in Phase 1 scope):** `shared/schema.ts` imports and
references tables (`scenario_matrices`, `optimization_sessions`,
`cohort_definitions`, possibly more) that do not exist in the live Neon
endpoint. Any code paths that query those tables will fail at runtime against
this endpoint. Candidates for a REFL entry and a separate schema-sync plan in a
future milestone.

## Verification performed

- `npm run check` → 0 new TypeScript errors (baseline holds)
- `git diff --stat shared/schema.ts` → additions only (28 insertions
  pre-prettier, 26 after)
- All 10 grep-based acceptance criteria for Task 1 → pass
- All 10 grep-based acceptance criteria for Task 2 → pass
- `scripts/check-leader-table.mjs` plain-ASCII verification → 0 non-ASCII bytes
- Codex review (`codex exec --sandbox read-only`) against plan spec → **PASS**
- Direct SQL application → 7 columns created with correct types, 2 indexes
  created
- `scripts/check-leader-table.mjs` against live DB → exit 0,
  `OK: variance_planner_leader table exists in the live DB`

## Helper exit code matrix — branches exercised

| Exit | Meaning                    | Exercised | How                                                     |
| ---- | -------------------------- | --------- | ------------------------------------------------------- |
| 0    | Table exists               | yes       | Final verification after direct SQL apply               |
| 2    | `DATABASE_URL` unset       | yes       | Initial run before user provided connection string      |
| 3    | DB connection failed       | no        | Would require a bad credential; not triggered           |
| 4    | Table missing from live DB | yes       | After drizzle-kit push was aborted, before direct apply |

Exit codes 0, 2, and 4 were exercised in this plan; exit 3 was not triggered but
is still reachable per the helper's try/catch on `pool.query`.

## Commits

- `31c6c4fa` — feat(01-variance-automation-1c3-followons): add
  variance_planner_leader pgTable + types (01-01 task 1)
- `ac7a2120` — feat(01-variance-automation-1c3-followons): add 0011 migration +
  check-leader-table helper (01-01 task 2)
- (this SUMMARY commit) — feat(01-variance-automation-1c3-followons): apply 0011
  migration + close plan 01-01

## Self-Check

- [x] Drizzle table, insert schema, and types exported from `shared/schema.ts`
- [x] Hand-written migration `0011_variance_planner_leader.sql` present
- [x] Rollback `0011_variance_planner_leader_down.sql` present
- [x] Cross-shell helper `scripts/check-leader-table.mjs` present, plain ASCII,
      4-code matrix
- [x] Table physically present in the live DB (verified via helper)
- [x] `npm run check` green
- [x] No other tables or migrations modified
- [x] Deviation from plan Task 3 documented with rationale and follow-up flag

## What this unblocks

Plan 01-02 (Wave 2) can now import `variancePlannerLeader` from `@shared/schema`
and run atomic takeover / renewal UPDATEs against the live table. Plan 01-04
(integration test) can fast-forward `lease_expires_at` in the same live DB to
simulate lease expiry without spawning a second Node process (REFL-024).
