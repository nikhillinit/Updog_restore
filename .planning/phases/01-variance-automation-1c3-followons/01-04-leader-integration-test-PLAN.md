---
phase: 01-variance-automation-1c3-followons
plan: 04
type: execute
wave: 3
depends_on:
  - 01
  - 02
files_modified:
  - tests/integration/variance-planner-leader-election.test.ts
autonomous: true
requirements:
  - REQ-VAR-01
must_haves:
  truths:
    - 'Two in-process VarianceAlertAutomationService instances race for the
      leader lease against the real test DB'
    - "Instance A acquires first; instance B's concurrent attempt returns false"
    - 'Fast-forwarding lease_expires_at in the DB lets instance B take over'
    - "Instance A's next tryAcquireOrRenewLease returns false after takeover
      (demoted)"
    - 'No child process spawned (REFL-024 crash-takeover lesson)'
    - "Test runs against a real Postgres DB that has the variance_planner_leader
      table (proves Plan 01's db:push succeeded)"
  artifacts:
    - path: 'tests/integration/variance-planner-leader-election.test.ts'
      provides:
        'Crash-takeover integration test that exercises the real lease manager
        against a real DB'
      contains: 'variance_planner_leader'
  key_links:
    - from: 'integration test'
      to: 'variance_planner_leader table'
      via: 'direct db.execute UPDATE to fast-forward lease_expires_at'
      pattern: 'UPDATE variance_planner_leader'
    - from: 'integration test'
      to: 'lease manager'
      via:
        'two in-process VarianceAlertAutomationService instances with distinct
        instanceIds'
      pattern: 'new VarianceAlertAutomationService'
---

<objective>
Prove leader takeover works against a real Postgres database without spawning a second Node process. Per REFL-024 and CONTEXT.md specifics § "Crash test philosophy", the test:
1. Creates two `VarianceAlertAutomationService` instances in the same Node process
2. Gives them distinct instance identities via a test-only setter (or via construction options)
3. Instance A acquires the lease successfully
4. Instance B's acquire attempt returns false (A's lease is live)
5. The test fast-forwards `lease_expires_at` directly via a raw `db.execute` UPDATE
6. Instance B's next acquire attempt returns true (takeover succeeded)
7. Instance A's next acquire attempt returns false (demoted)

This is the integration-level proof that the takeover SQL in
`tryAcquireOrRenewLease` works against real Drizzle + real Postgres — not just
against a mock.

Purpose: satisfy Phase 1 success criterion 2 ("Correctness is preserved across
leader crash mid-window, verified by an integration test that crashes the leader
and asserts the next election picks up cleanly") AND prove Plan 01's `db:push`
ran cleanly (the table must exist for the test to pass).

Output: one new file under `tests/integration/`. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
@.planning/phases/01-variance-automation-1c3-followons/01-02-leader-lease-manager-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Existing integration test conventions in the repo. -->

From tests/integration/portfolio-schema.spec.ts (line 12 — confirms direct db
import works in integration tests):

```typescript
import { db } from '../../server/db';
```

From tests/integration/global-setup.ts (the test harness already provides
DATABASE_URL, NODE_ENV=test, TZ=UTC):

```
env.TZ = 'UTC';
env.NODE_ENV = 'test';
env.DATABASE_URL = env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
```

From shared/schema.ts (Plan 01 output — the table this test queries):

```typescript
export const variancePlannerLeader = pgTable(
  'variance_planner_leader',
  {
    id: varchar('id', { length: 64 }).primaryKey(),  // fixed value 'variance-planner'
    instanceId: varchar('instance_id', { length: 255 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
    lastRenewedAt: timestamp('last_renewed_at', { withTimezone: true }).defaultNow().notNull(),
    ...
  },
  ...
);
```

From server/services/variance-alert-automation.ts (Plan 02 output):

- `export class VarianceAlertAutomationService { ... }` — exported class
  (already exported in the current file, confirm from full read of Plan 02's
  modified file)
- `private instanceId: string` — computed at construction via
  `computeInstanceIdentity()`
- `private async tryAcquireOrRenewLease(now?: Date): Promise<boolean>`
- `private async releaseLease(): Promise<void>`
- `LEADER_ROW_ID = 'variance-planner'` — module constant

Because `instanceId` is computed at construction and is deterministic-ish
(`${hostname}:${pid}:${random}`), two `new VarianceAlertAutomationService()`
calls in the same process WILL get different instance ids (the random suffix
guarantees it). No test-only setter is required — just `new`.

Private methods (`tryAcquireOrRenewLease`, `releaseLease`) are accessible via
the same cast pattern as the unit tests:
`(instance as unknown as { tryAcquireOrRenewLease(now?: Date): Promise<boolean>; releaseLease(): Promise<void>; instanceId: string })`.
</interfaces> </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create crash-takeover integration test in tests/integration/variance-planner-leader-election.test.ts</name>
  <files>tests/integration/variance-planner-leader-election.test.ts</files>
  <read_first>
    - tests/integration/portfolio-schema.spec.ts (an existing integration test that imports `db` directly — use as template for top-of-file imports and DB interaction pattern)
    - tests/integration/global-setup.ts (lines 1-50 — confirms the test env variables)
    - server/services/variance-alert-automation.ts (Plan 02 modified file — confirm `VarianceAlertAutomationService` is exported as a class, confirm method names `tryAcquireOrRenewLease` and `releaseLease`, confirm `LEADER_ROW_ID = 'variance-planner'`)
    - shared/schema.ts (the variancePlannerLeader block — column names `leaseExpiresAt`, `instanceId`, etc.)
    - .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md (specifics § Crash test philosophy; decisions § Claude's Discretion → Crash integration test harness)
    - MEMORY.md note "Integration Test Server Lifecycle (CI Ceiling)" — globalSetup is already migrated; this test should NOT spawn additional servers
    - vitest.config.int.ts (confirm the include list matches `tests/integration/**/*.test.ts` and uses the `tests/integration/global-setup.ts` globalSetup)
    - vitest.config.ts (lines ~151-162 — confirm the root config EXCLUDES `tests/integration/**`, which is why this test MUST run via vitest.config.int.ts)
  </read_first>
  <behavior>
    Integration test file with 4 tests:

    **Test 1: "first VarianceAlertAutomationService instance acquires the lease"**
    - Clean `variance_planner_leader` row (DELETE WHERE id = 'variance-planner') in beforeEach
    - `const serviceA = new VarianceAlertAutomationService()`
    - `const acquired = await (serviceA as any).tryAcquireOrRenewLease()`
    - expect `acquired === true`
    - Query the DB directly: `SELECT instance_id, lease_expires_at FROM variance_planner_leader WHERE id = 'variance-planner'`
    - expect `row.instance_id === serviceA.instanceId`
    - expect `row.lease_expires_at` is in the future relative to `now()`

    **Test 2: "second instance cannot acquire while first holds a live lease"**
    - Clean row
    - `const serviceA = new VarianceAlertAutomationService()`
    - `const serviceB = new VarianceAlertAutomationService()`
    - expect `serviceA.instanceId !== serviceB.instanceId`
    - `await (serviceA as any).tryAcquireOrRenewLease()` → true
    - `const bAcquired = await (serviceB as any).tryAcquireOrRenewLease()`
    - expect `bAcquired === false`
    - Query DB: row still has `instance_id === serviceA.instanceId`
    - expect `(serviceA as any).isLeader === true`
    - expect `(serviceB as any).isLeader === false`

    **Test 3: "crash-takeover: after lease_expires_at is fast-forwarded, instance B takes over and A demotes on next renewal"**
    - Clean row
    - `const serviceA = new VarianceAlertAutomationService()`
    - `const serviceB = new VarianceAlertAutomationService()`
    - `await (serviceA as any).tryAcquireOrRenewLease()` → true
    - Fast-forward the lease expiry directly: `await db.execute(sql\`UPDATE variance_planner_leader SET lease_expires_at = NOW() - INTERVAL '1 minute' WHERE id = 'variance-planner'\`)`
    - `const bTakeover = await (serviceB as any).tryAcquireOrRenewLease()` → expect true
    - Query DB: row now has `instance_id === serviceB.instanceId` AND `acquired_at` equals a fresh timestamp (greater than serviceA's original `acquired_at`)
    - `const aRenew = await (serviceA as any).tryAcquireOrRenewLease()` → expect false (demoted)
    - expect `(serviceA as any).isLeader === false`
    - expect `(serviceB as any).isLeader === true`

    **Test 4: "releaseLease on stop() clears the lease and lets the other instance acquire"**
    - Clean row
    - `const serviceA = new VarianceAlertAutomationService()`
    - `const serviceB = new VarianceAlertAutomationService()`
    - `await (serviceA as any).tryAcquireOrRenewLease()` → true
    - `await serviceA.stop()` — this calls releaseLease internally
    - Query DB: row's `lease_expires_at` is now in the past (`<= NOW()`)
    - `const bAcquired = await (serviceB as any).tryAcquireOrRenewLease()` → expect true
    - Query DB: row now has `instance_id === serviceB.instanceId`

    Cleanup: afterEach deletes the row so tests are independent.
    afterAll: delete the row and call `stop()` on any still-running service instances to clean up timers.

  </behavior>
  <action>
Create a new file `tests/integration/variance-planner-leader-election.test.ts`. The file MUST live under `tests/integration/` (not `__tests__/`) per REFL-036 and the pre-push orphan-test check.

File content (authoring this verbatim — adjust imports only if your read of the
current codebase reveals a different path):

```typescript
/**
 * Integration test: VarianceAlertAutomationService leader election.
 *
 * Proves the crash-takeover scenario from Phase 1 success criterion 2 against
 * a real Postgres database (no mocks). Uses two in-process instances to avoid
 * the REFL-024 child-process cascade failure mode.
 *
 * Preconditions:
 * - DATABASE_URL must point to a Postgres with the variance_planner_leader
 *   table (Plan 01's `npm run db:push` must have run).
 * - NODE_ENV=test is set by tests/integration/global-setup.ts (prevents the
 *   exported singleton service from autostarting). This test does NOT touch
 *   the exported singleton — it instantiates fresh services.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../server/db';
import { VarianceAlertAutomationService } from '../../server/services/variance-alert-automation';

type LeaseManagerHarness = {
  instanceId: string;
  tryAcquireOrRenewLease(now?: Date): Promise<boolean>;
  releaseLease(): Promise<void>;
  isLeader: boolean;
};

function asHarness(
  service: VarianceAlertAutomationService
): LeaseManagerHarness {
  return service as unknown as LeaseManagerHarness;
}

async function cleanLeaderRow(): Promise<void> {
  await db.execute(
    sql`DELETE FROM variance_planner_leader WHERE id = 'variance-planner'`
  );
}

async function readLeaderRow(): Promise<{
  instance_id: string;
  acquired_at: Date;
  lease_expires_at: Date;
} | null> {
  const result = await db.execute(sql`
    SELECT instance_id, acquired_at, lease_expires_at
    FROM variance_planner_leader
    WHERE id = 'variance-planner'
  `);
  const row = result.rows[0] as
    | {
        instance_id: string;
        acquired_at: string | Date;
        lease_expires_at: string | Date;
      }
    | undefined;
  if (!row) return null;
  return {
    instance_id: row.instance_id,
    acquired_at: new Date(row.acquired_at),
    lease_expires_at: new Date(row.lease_expires_at),
  };
}

describe('VarianceAlertAutomationService leader election (integration)', () => {
  const runningServices: VarianceAlertAutomationService[] = [];

  beforeEach(async () => {
    await cleanLeaderRow();
  });

  afterEach(async () => {
    // stop() releases the lease; safe for instances that never became leader.
    for (const svc of runningServices.splice(0, runningServices.length)) {
      try {
        await svc.stop();
      } catch {
        // ignore cleanup errors
      }
    }
    await cleanLeaderRow();
  });

  afterAll(async () => {
    await cleanLeaderRow();
  });

  it('first instance acquires the lease and writes its instance id', async () => {
    const serviceA = new VarianceAlertAutomationService();
    runningServices.push(serviceA);
    const acquired = await asHarness(serviceA).tryAcquireOrRenewLease();
    expect(acquired).toBe(true);
    expect(asHarness(serviceA).isLeader).toBe(true);

    const row = await readLeaderRow();
    expect(row).not.toBeNull();
    expect(row!.instance_id).toBe(asHarness(serviceA).instanceId);
    expect(row!.lease_expires_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('second instance cannot acquire while the first holds a live lease', async () => {
    const serviceA = new VarianceAlertAutomationService();
    const serviceB = new VarianceAlertAutomationService();
    runningServices.push(serviceA, serviceB);

    expect(asHarness(serviceA).instanceId).not.toBe(
      asHarness(serviceB).instanceId
    );

    const aAcquired = await asHarness(serviceA).tryAcquireOrRenewLease();
    expect(aAcquired).toBe(true);

    const bAcquired = await asHarness(serviceB).tryAcquireOrRenewLease();
    expect(bAcquired).toBe(false);
    expect(asHarness(serviceB).isLeader).toBe(false);

    const row = await readLeaderRow();
    expect(row!.instance_id).toBe(asHarness(serviceA).instanceId);
  });

  it('crash-takeover: after lease_expires_at is fast-forwarded, instance B takes over and A demotes', async () => {
    const serviceA = new VarianceAlertAutomationService();
    const serviceB = new VarianceAlertAutomationService();
    runningServices.push(serviceA, serviceB);

    // Step 1: A acquires
    const aAcquired = await asHarness(serviceA).tryAcquireOrRenewLease();
    expect(aAcquired).toBe(true);
    const originalRow = await readLeaderRow();
    expect(originalRow!.instance_id).toBe(asHarness(serviceA).instanceId);

    // Step 2: simulate crash by fast-forwarding lease_expires_at into the past
    await db.execute(sql`
      UPDATE variance_planner_leader
      SET lease_expires_at = NOW() - INTERVAL '1 minute'
      WHERE id = 'variance-planner'
    `);

    // Step 3: B takes over
    const bTakeover = await asHarness(serviceB).tryAcquireOrRenewLease();
    expect(bTakeover).toBe(true);
    expect(asHarness(serviceB).isLeader).toBe(true);

    const postTakeoverRow = await readLeaderRow();
    expect(postTakeoverRow!.instance_id).toBe(asHarness(serviceB).instanceId);
    // acquired_at should reset to the takeover time (strictly greater than A's original)
    expect(postTakeoverRow!.acquired_at.getTime()).toBeGreaterThanOrEqual(
      originalRow!.acquired_at.getTime()
    );

    // Step 4: A's next attempt sees B's live lease and demotes itself
    const aRenew = await asHarness(serviceA).tryAcquireOrRenewLease();
    expect(aRenew).toBe(false);
    expect(asHarness(serviceA).isLeader).toBe(false);
  });

  it('releaseLease on stop() lets the other instance acquire immediately', async () => {
    const serviceA = new VarianceAlertAutomationService();
    const serviceB = new VarianceAlertAutomationService();
    runningServices.push(serviceB); // A will be stopped in the test body

    const aAcquired = await asHarness(serviceA).tryAcquireOrRenewLease();
    expect(aAcquired).toBe(true);

    await serviceA.stop();
    expect(asHarness(serviceA).isLeader).toBe(false);

    const row = await readLeaderRow();
    expect(row).not.toBeNull();
    // Tight tolerance (100ms) for clock skew between DB and runner. Wider
    // tolerances (e.g. 1000ms) would mask a partial-release bug where
    // lease_expires_at = now() + 500ms — the subsequent B-acquires assertion
    // below would still succeed because the lease would expire before B's
    // acquire call lands, hiding the bug. 100ms is tight enough to catch a
    // broken releaseLease that sets a non-trivial future expiry.
    expect(row!.lease_expires_at.getTime()).toBeLessThanOrEqual(
      Date.now() + 100
    );

    const bAcquired = await asHarness(serviceB).tryAcquireOrRenewLease();
    expect(bAcquired).toBe(true);

    const postRow = await readLeaderRow();
    expect(postRow!.instance_id).toBe(asHarness(serviceB).instanceId);
  });
});
```

Notes:

- The test is fully in-process. No child processes, no second HTTP server.
- The `afterEach` runs `stop()` on every tracked instance to release timers,
  even though this test never calls `start()` — the lease manager methods are
  called directly on fresh instances so no timers are scheduled. `stop()` is
  still called defensively in case a future edit adds `start()`.
- `expect(row!.lease_expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 100)`
  uses a 100-millisecond tolerance. A wider window (e.g. 1000ms) would allow a
  broken releaseLease that sets `lease_expires_at = now() + 500ms` to pass AND
  let the subsequent B-acquires call still succeed — silently masking the bug.
- Drizzle `db.execute(sql\`...\`)`returns`{ rows: [...]
  }` — the raw row keys are snake_case (`instance_id`, `lease_expires_at`) because that is the column name in the DB; the camelCase Drizzle property names apply to `db.select().from(variancePlannerLeader)`, NOT to `db.execute(sql\`...\`)`.

Run with:
`npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`.

CRITICAL: do NOT invoke this test via `npm test` / `npm run test:unit` /
`--project=server`. The root `vitest.config.ts` (line ~153) explicitly excludes
`tests/integration/**`, so any `npm test` invocation targeting this file reports
"0 tests found" as a silent false positive. The integration runner
(`vitest.config.int.ts`) is the only config whose `include` list matches
`tests/integration/**/*.test.ts` AND configures the
`tests/integration/global-setup.ts` globalSetup hook that provides
`DATABASE_URL`, `NODE_ENV=test`, and `TZ=UTC`.

The project also exposes `npm run test:integration` which runs
`cross-env TZ=UTC vitest run -c vitest.config.int.ts` (per `package.json`
line 52) — that script runs the FULL integration suite. To run ONLY this file,
pass the path explicitly to the `-c vitest.config.int.ts` invocation as shown
above.

Verification:

1. `DATABASE_URL` must be set and point to a Postgres with the
   `variance_planner_leader` table (Plan 01 prerequisite).
2. Run the test via the integration runner
   (`npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`).
3. All 4 tests must pass.
4. The `variance_planner_leader` row must NOT leak between tests (verify by
   running the test twice — both runs must pass cleanly). </action> <verify>
   <automated>npx vitest run -c vitest.config.int.ts
   tests/integration/variance-planner-leader-election.test.ts</automated>
   </verify> <acceptance_criteria> - File
   `tests/integration/variance-planner-leader-election.test.ts` exists (NOT
   under `__tests__/`) -
   `grep -c "describe('VarianceAlertAutomationService leader election" tests/integration/variance-planner-leader-election.test.ts`
   returns `1` -
   `grep -c "new VarianceAlertAutomationService()" tests/integration/variance-planner-leader-election.test.ts`
   returns at least `7` (Test 1 = 1, Test 2 = 2, Test 3 = 2, Test 4 = 2 → 7
   total) -
   `grep -c "DELETE FROM variance_planner_leader" tests/integration/variance-planner-leader-election.test.ts`
   returns at least `1` -
   `grep -c "UPDATE variance_planner_leader" tests/integration/variance-planner-leader-election.test.ts`
   returns `1` (the fast-forward in Test 3) -
   `grep -c "crash-takeover" tests/integration/variance-planner-leader-election.test.ts`
   returns `1` -
   `grep -c "child_process\|spawn\|exec(" tests/integration/variance-planner-leader-election.test.ts`
   returns `0` (no child process spawning per REFL-024) -
   `grep -c "releaseLease on stop" tests/integration/variance-planner-leader-election.test.ts`
   returns `1` - The Test 4 release-lease assertion uses a tight 100ms
   tolerance:
   `grep -c "Date.now() + 100" tests/integration/variance-planner-leader-election.test.ts`
   returns at least `1` - File is placed in `tests/integration/` — NOT in any
   `__tests__/` subdirectory (`node scripts/check-orphan-tests.mjs` exits 0,
   assuming that script exists) -
   `npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`
   exits 0 and reports 4 passing tests (do NOT use `npm test` — it excludes
   `tests/integration/**`) - Running the test twice back-to-back both times
   succeeds (proves cleanup is idempotent) </acceptance_criteria>
   <done>Integration test file exists, all 4 tests pass against a real DB via
   the `vitest.config.int.ts` runner, no child processes are spawned, and the
   test cleans up its row between runs so it is repeatable.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                          | Description                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------- |
| test process → test Postgres      | Real SQL against a real DB. The test writes, reads, and deletes one row.         |
| test instance A ↔ test instance B | Two in-process `VarianceAlertAutomationService` instances race for the same row. |

## STRIDE Threat Register

| Threat ID | Category                                          | Component                               | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------- | --------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-04-01   | Test isolation — row leaks between tests          | `variance_planner_leader` singleton row | mitigate    | `beforeEach` and `afterEach` both call `cleanLeaderRow()` via `DELETE WHERE id = 'variance-planner'`. `afterAll` also cleans. Because the row has a fixed id and the table is single-row for our purposes, cleanup is O(1).                                                                                                                                   |
| T-04-02   | Test flakiness — clock skew between DB and runner | `expect(lease_expires_at > Date.now())` | mitigate    | Uses a 100-millisecond grace window (`toBeLessThanOrEqual(Date.now() + 100)`) for the post-release check. Narrow enough to catch a partial-release bug that sets `lease_expires_at = now() + 500ms`, wide enough to absorb typical CI clock skew. Other assertions use DB-relative comparisons (`NOW() - INTERVAL '1 minute'`) so DB time is self-consistent. |
| T-04-03   | Cascade failure — child process spawning          | integration test harness                | mitigate    | This test explicitly uses two in-process instances — never `spawn`, `exec`, or `fork`. REFL-024 is the hard lesson. Acceptance criteria grep for any `child_process` or `spawn` usage and fail the test if found.                                                                                                                                             |
| T-04-04   | False green — table does not exist                | Plan 01 `db:push` prerequisite          | mitigate    | The test calls `db.execute(sql\`SELECT ... FROM variance_planner_leader\`)`in`readLeaderRow()` — if the table is missing, Postgres returns a relation-does-not-exist error and the test fails loudly. Plan 04 depends on Plan 01 in the wave DAG, so the schema push runs before this test does.                                                              |
| T-04-05   | Split-brain between the two instances             | `tryAcquireOrRenewLease` SQL            | mitigate    | Test 2 explicitly verifies that B cannot acquire while A holds a live lease, which proves the atomic UPDATE WHERE clause does what D-01 claims. Test 3 then proves the takeover path works when the lease has expired. Together they cover both sides of the atomicity invariant.                                                                             |
| T-04-06   | False green — test excluded by root vitest config | runner selection                        | mitigate    | The action, verify, and acceptance criteria ALL specify `npx vitest run -c vitest.config.int.ts ...` and explicitly forbid `npm test`. Root `vitest.config.ts` excludes `tests/integration/**`, so `npm test` targeting this file would report "0 tests found" as a silent PASS. Switching to the integration-runner config eliminates the false-green path.  |

</threat_model>

<verification>
- The `variance_planner_leader` table physically exists in the test DB (guaranteed by Plan 01 dependency)
- 4 integration tests pass under the `vitest.config.int.ts` runner (NOT `npm test`)
- No child processes spawned (grep verification)
- Test is placed under `tests/integration/` (pre-push orphan check passes)
- Row cleanup works (test is repeatable back-to-back)
</verification>

<success_criteria>

- All 4 tests in `variance-planner-leader-election.test.ts` pass
- No child process spawning
- Clean file placement (not `__tests__/`)
- Test runs under `TZ=UTC` and `NODE_ENV=test` (set by
  `tests/integration/global-setup.ts`)
- Test is idempotent across repeated runs
- Test is exercised via the integration-runner config, NOT the unit-runner
  config </success_criteria>

<output>
After completion, create `.planning/phases/01-variance-automation-1c3-followons/01-04-SUMMARY.md` documenting:
- How many tests were added (4)
- The exact mechanism used to simulate crash (SQL fast-forward of `lease_expires_at`)
- Confirmation that no child processes were spawned
- Any flakiness observed in repeated runs
- The command used to run the test standalone (`npx vitest run -c vitest.config.int.ts tests/integration/variance-planner-leader-election.test.ts`)
</output>
</content>
</invoke>
