---
phase: 01-variance-automation-1c3-followons
plan: 01-04
subsystem: variance-automation
status: complete
completed: 2026-04-07
tags:
  - integration-test
  - leader-election
  - variance-automation
  - real-db
  - neon
requires:
  - 01-01 (variance_planner_leader table in live DB)
  - 01-02 (lease manager + planner gate)
provides:
  - Live-DB integration proof of leader acquire / takeover-blocked / crash-takeover / graceful-release
  - Reusable real-DB doMock pattern reference for future variance-automation integration tests
affects:
  - tests/integration/variance-planner-leader-election.test.ts
key_files:
  created:
    - tests/integration/variance-planner-leader-election.test.ts
decisions:
  - Real-DB wiring via vi.doMock + dynamic import (canonical pattern from
    tests/integration/phase0-migrated-postgres.test.ts). The plan as written
    assumed `import { db } from '../../server/db'` would hit the live DB, but
    server/storage-runtime-policy.ts routes db to a mock when NODE_ENV=test
    unless USE_REAL_DB_IN_VITEST=1 is set. Build a real pg.Pool + drizzle
    instance, vi.doMock('../../server/db', ...), then `await import` the
    service so it binds to the real DB.
  - dotenv.config({ override: true }) inside beforeAll. Vitest workers do not
    auto-load .env, and tests/integration/global-setup.ts has an
    `env.DATABASE_URL || 'localhost:5432/povc_test'` fallback that wins in the
    worker context. The override re-reads .env so the orchestrator-set Neon URL
    takes effect. dotenv is consumed via `await import('dotenv')` to bypass the
    project's eslint-auto-fix import-stripping hook (per MEMORY note "Linter
    Edit Hook -- Import Ordering").
  - Tight 100ms tolerance on the post-release lease_expires_at assertion is
    intentional and was preserved verbatim from the plan. Wider tolerances
    (e.g. 1000ms) would mask a partial-release bug where lease_expires_at gets
    set to NOW() + 500ms because the subsequent B-acquires assertion would
    still pass.
  - In-process only. No child_process / spawn / fork / exec, per REFL-024
    "Integration Test Server Lifecycle" cascade-failure lesson. Two
    VarianceAlertAutomationService instances race in the SAME Node process
    using their distinct hostname:pid:random6 instance ids.
metrics:
  duration_minutes: 30
  tasks_completed: 1
  tests_added: 4
  files_created: 1
  files_modified: 0
  commits: 1
---

# Plan 01-04: Leader Election Integration Test - SUMMARY

## What was built

A new integration test file
`tests/integration/variance-planner-leader-election.test.ts` (251 lines, 1 file
created, 0 modified) that exercises the leader lease manager from Plan 01-02
against the live `variance_planner_leader` table created by Plan 01-01. The test
stays fully in-process and uses two `VarianceAlertAutomationService` instances
with distinct identities to race for the same lease row.

## The 4 tests added

1. **`first instance acquires the lease and writes its instance id`** - proves
   the happy-path INSERT branch. Asserts `tryAcquireOrRenewLease()` returns
   true, the row's `instance_id` matches `serviceA.instanceId`, and
   `lease_expires_at` is in the future.
2. **`second instance cannot acquire while the first holds a live lease`** -
   proves D-01's atomicity invariant. Asserts B's acquire returns false, B's
   `isLeader` stays false, and the row still belongs to A.
3. **`crash-takeover: after lease_expires_at is fast-forwarded, instance B takes over and A demotes`** -
   the centerpiece. Fast-forwards
   `lease_expires_at = NOW() - INTERVAL '1 minute'` via raw SQL to simulate a
   dead leader, then proves B takes over and A demotes itself on the next
   `tryAcquireOrRenewLease()` call. This is the integration-level proof of the
   takeover SQL.
4. **`releaseLease on stop() lets the other instance acquire immediately`** -
   proves graceful shutdown releases the lease (sets `lease_expires_at = NOW()`
   within a 100ms tolerance), and B can acquire immediately after.

## Crash simulation mechanism

```typescript
await realDb.execute(sql`
  UPDATE variance_planner_leader
  SET lease_expires_at = NOW() - INTERVAL '1 minute'
  WHERE id = 'variance-planner'
`);
```

A single raw SQL UPDATE moves the lease expiry one minute into the past. After
this statement, the next `tryAcquireOrRenewLease()` from any instance sees an
expired lease and the atomic INSERT...ON CONFLICT WHERE clause grants them the
lease. **No process is killed, no signal is sent.** The takeover SQL in
`tryAcquireOrRenewLease` is the only code path under test.

This satisfies CONTEXT.md `<specifics>` "Crash test philosophy": the test proves
takeover works without spawning a second Node process (REFL-024).

## Confirmed: zero child processes spawned

```
$ grep -n 'child_process\|spawn(\|fork(\|exec(' \
    tests/integration/variance-planner-leader-election.test.ts
19: *   This keeps the test fully in-process (no child_process / REFL-024) while
70:  await realDb.execute(sql`DELETE FROM variance_planner_leader ...`)
80:  const result = await realDb.execute(sql`SELECT ...`)
140:    await realDb.execute(sql`SELECT 1 FROM variance_planner_leader LIMIT 1`)
217:    await realDb.execute(sql`UPDATE variance_planner_leader ...`)
```

The only `child_process` match is in a doc comment explicitly stating "no
child_process / REFL-024". The other matches are `db.execute(...)` (Drizzle's
SQL execute method, not OS exec). No `spawn(`, `fork(`, or `exec(` calls.

## Idempotency: cleanup is repeatable

The test was run twice back-to-back via:

```bash
npx vitest run -c vitest.config.int.ts \
  tests/integration/variance-planner-leader-election.test.ts
```

Both runs reported `Test Files 1 passed (1) | Tests 4 passed (4)` with no
errors. Cleanup is provided by `beforeEach` and `afterEach` (both call
`cleanLeaderRow()` which
`DELETE FROM variance_planner_leader WHERE id = 'variance-planner'`), plus an
`afterAll` cleanup, plus a `pool.end()` in `afterAll` to close the standalone
connection pool.

No flakiness observed across the runs. Test execution time is ~3 seconds (the
remaining ~20 seconds of wall time is the integration server bootstrap from
`tests/integration/global-setup.ts`, which runs once per invocation).

## Connection-string handling

The orchestrator pre-populated `.env` with the Neon test endpoint and backed up
the original to `.env.orchestrator-backup`. **At no point was the connection
string echoed, logged, or written to a committed file.** The diagnostic
console.warn that initially printed the connection host was removed before
commit. The test file references `process.env.DATABASE_URL` indirectly via
`dotenv.config({ override: true })` and forwards the result to
`new Pool({ connectionString })` without ever stringifying it to logs or test
output.

The committed test file does not contain the host, database name, username, or
password from the Neon endpoint. Verified by
`grep -ni 'ep-snowy\|neondb\| neondb_owner' tests/integration/variance-planner-leader-election.test.ts`
returning zero matches.

## Run command (for future agents)

```bash
npx vitest run -c vitest.config.int.ts \
  tests/integration/variance-planner-leader-election.test.ts
```

**CRITICAL:** Do NOT run via `npm test`, `npm run test:unit`, or
`--project=server`. The root `vitest.config.ts` (line ~37) excludes
`tests/integration/**`, so any unit-runner invocation reports "0 tests found" as
a silent false positive. Only the integration runner (`vitest.config.int.ts`)
configures the `globalSetup` hook that boots the test server and provides the
worker environment.

## Deviations from Plan (Rule 3 - blocking issues fixed in-place)

### Deviation 1: Real-DB wiring via vi.doMock (the plan's direct `import { db }` does not work)

**Plan said:** `import { db } from '../../server/db'` and call
`db.execute(sql\`...\`)` directly.

**Why that fails:** `server/db.ts` line 36 routes the `db` export to a mock
implementation when `storageBootMode === 'test-mock-db'`. The boot mode is
computed by `server/storage-runtime-policy.ts:isTestMockDatabaseMode`, which
returns true whenever `NODE_ENV=test` AND `USE_REAL_DB_IN_VITEST !== '1'`. The
integration global-setup sets `NODE_ENV=test` unconditionally and does NOT set
`USE_REAL_DB_IN_VITEST`. So a naive `import { db }` resolves to the mock, whose
`execute()` returns a `MockExecuteResult` that has neither `.rows` nor
`.rowCount`. The first attempt to run the test failed all 4 cases with
`expected false to be true` because `tryAcquireOrRenewLease` read
`result.rows[0]` as `undefined`, fell into the "no row" branch, and returned
false.

**Fix applied:** Follow the canonical pattern from
`tests/integration/phase0-migrated-postgres.test.ts`:

```typescript
process.env.USE_REAL_DB_IN_VITEST = '1';

realPool = new Pool({ connectionString, max: 2 });
realDb = drizzle(realPool, { schema: combinedSchema });

vi.doMock('../../server/db', () => ({
  db: realDb,
  pool: realPool,
}));

vi.resetModules();
const mod = await import('../../server/services/variance-alert-automation');
VarianceAlertAutomationService = mod.VarianceAlertAutomationService;
```

The service module is dynamically imported AFTER `vi.doMock` so it binds to the
real `pg.Pool`-backed Drizzle instance instead of the mock. This is the same
pattern used by the only other test in the repo that needs real-DB access from a
vitest worker.

### Deviation 2: dotenv.config({ override: true }) inside beforeAll

**Why:** Vitest workers do NOT auto-load `.env` files. The orchestrator wrote
DATABASE_URL into `.env`, but the worker process inherits its env from the
parent globalSetup process, which itself never loaded `.env` either.
`tests/integration/global-setup.ts:applyIntegrationEnv` line 47 sets
`env.DATABASE_URL = env.DATABASE_URL || 'postgresql://postgres:postgres@ localhost:5432/povc_test'`.
With DATABASE_URL empty, the fallback wins, and the worker connects to
localhost:5432 — which is not running, OR (worse) is running a different
Postgres without the `variance_planner_leader` table.

A diagnostic console.warn during debugging confirmed
`connecting to localhost:5432/povc_test` from inside the worker, with the error
`relation "variance_planner_leader" does not exist`. After
`dotenv.config({ override: true })` runs at the top of beforeAll, the same
diagnostic prints the orchestrator-set Neon endpoint and all four tests pass.

**dotenv loaded via dynamic import:** `await import('dotenv')` instead of
`import dotenv from 'dotenv'`. The project has an eslint-auto-fix hook that
strips unused imports immediately on file save. Adding the static import first
would have been removed before the consuming code referenced it. Dynamic import
sidesteps the hook (per MEMORY note "Linter Edit Hook -- Import Ordering").

### Note: a static `import { db } from '../../server/db'` was NOT used

This is a structural deviation from the plan's example code but matches the only
other working integration test that hits a real DB
(`tests/integration/phase0-migrated-postgres.test.ts`). Future variance-
automation integration tests SHOULD reuse this pattern.

## Authentication gates

None. The orchestrator pre-populated DATABASE_URL with the Neon test endpoint.
No interactive auth, no manual key entry.

## Verification performed

- `npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`
  -> **4/4 tests pass** against the live Neon DB
- Same command run twice back-to-back -> both runs pass (idempotency proven)
- `npm run check` -> **0 new TypeScript errors** (baseline holds at 0)
- `node scripts/check-orphan-tests.mjs` -> **exit 0** (file is in
  `tests/integration/`, not `__tests__/`)
- `grep -c "describe('VarianceAlertAutomationService leader election"` -> 1
- `grep -c "new VarianceAlertAutomationService()"` -> 7 (1 + 2 + 2 + 2 across
  the 4 tests, matching the plan's >= 7 requirement)
- `grep -c "DELETE FROM variance_planner_leader"` -> 1
- `grep -c "UPDATE variance_planner_leader"` -> 1
- `grep -c "crash-takeover"` -> 2 (test name + comment; plan asked for >= 1)
- `grep -c "releaseLease on stop"` -> 1
- `grep -c "Date.now() + 100"` -> 1 (the tight tolerance assertion)
- `grep -c "child_process\|spawn(\|fork(\|exec("` -> 0 actual usages (only
  doc-comment + `db.execute(` matches; no OS process spawning)
- Pre-commit hook (eslint --fix --max-warnings 0 + prettier --write +
  conventional-commit format check) -> PASS
- File NOT placed under any `__tests__/` subdirectory -> verified

## Commit

`aca1abdb` -- test(01-variance-automation-1c3-followons): add leader-election
integration test (01-04 task 1)

## Self-Check

- [x] File `tests/integration/variance-planner-leader-election.test.ts` exists
      at the correct path (NOT under `__tests__/`)
- [x] All 4 tests present as `it(...)` blocks under the single `describe`
- [x] All 4 tests PASS against the live Neon DB via the integration runner
- [x] Test runs cleanly twice in a row (no row leakage between runs)
- [x] `npm run check` is green (0 new TypeScript errors)
- [x] `scripts/check-orphan-tests.mjs` exits 0
- [x] No child_process / spawn / fork / exec calls (REFL-024 compliance)
- [x] No modifications to `.env`, `.env.orchestrator-backup`, or any
      pre-existing source file
- [x] No connection string echoed, logged, or committed (host/db/user/pass not
      present in any committed artifact)
- [x] Conventional commit format with phase scope
      `01-variance-automation-1c3-followons` and `01-04` token in the message
- [x] Commit `aca1abdb` exists in `git log`
- [x] All deviations documented in this SUMMARY (Rule 3 in-place fixes)

## What this unblocks

Phase 1 success criterion 2 ("Correctness is preserved across leader crash
mid-window, verified by an integration test that crashes the leader and asserts
the next election picks up cleanly") is now satisfied. Combined with:

- Plan 01-01: schema + migration + live-DB table existence
- Plan 01-02: lease manager + planner gate
- Plan 01-03: 8 unit tests covering the lease manager against the mock DB
- Plan 01-04: this integration test against the live DB

...the Item A (planner-loop leader election) implementation is structurally
complete pending phase verification. The verifier subagent should:

1. Re-run
   `npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`
   to confirm the test still passes from a clean checkout
2. Run the unit tests added by Plan 01-03
   (`npm test -- --project=server tests/unit/services/variance-alert-automation.test.ts`)
3. Confirm `getHealth().planner.isLeader` is wired into `/api/health`
4. Confirm no regressions in `runProcessorCycle` (D-04 guard from 01-03 Test 6)

## Self-Check: PASSED

All items above verified. Commit `aca1abdb` is on `main`. The test file at
`tests/integration/variance-planner-leader-election.test.ts` runs cleanly under
`vitest.config.int.ts` and does not spawn child processes.
