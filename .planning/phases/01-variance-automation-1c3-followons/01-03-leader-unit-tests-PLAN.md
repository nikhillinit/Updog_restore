---
phase: 01-variance-automation-1c3-followons
plan: 03
type: execute
wave: 3
depends_on:
  - '02'
files_modified:
  - tests/unit/services/variance-alert-automation.test.ts
autonomous: true
requirements:
  - REQ-VAR-01
must_haves:
  truths:
    - 'Unit tests cover initial acquisition, renewal, takeover blocked, takeover
      succeeded, demotion on DB error, isLeader gate on runPlannerCycle, release
      on stop'
    - 'runProcessorCycle is proved to run regardless of leader status (D-04
      regression guard)'
    - 'All tests pass under TZ=UTC'
  artifacts:
    - path: 'tests/unit/services/variance-alert-automation.test.ts'
      provides:
        'Mocked unit-test coverage of the lease manager and planner gate'
      contains: 'variancePlannerLeader'
  key_links:
    - from: 'unit test'
      to: 'lease manager'
      via: 'mockDb.execute returning fake row shapes'
      pattern: 'mockDb.execute.mockResolvedValue'
---

<objective>
Add unit test coverage for the leader lease manager and planner gate added in Plan 02. Use the existing mock-Drizzle pattern in this file (vi.mock of `../../../server/db`) — do NOT introduce a real DB connection. Tests run under `npm test -- --project=server` in the Node.js environment.

**Why this plan does NOT depend on Plan 01:** these tests are fully mocked via
`vi.mock('../../../server/db', () => ({ db: mockDb }))`. The Drizzle types come
from `shared/schema.ts` (which is modified by Plan 01 in the same wave-2 edit
window, but type-checking picks up the new `variancePlannerLeader` export as
soon as Plan 02 imports it — no live DB table is required). Because there is no
runtime DB dependency, this plan can run in parallel with Plan 04 in Wave 3,
which DOES depend on Plan 01 (its integration test needs the live table).
Depending on Plan 01 here would serialize Wave 3 for no benefit.

Purpose: guarantee behavior before the integration test (Plan 04) validates the
end-to-end flow against a live DB.

Output: extended `tests/unit/services/variance-alert-automation.test.ts` with a
new `describe('leader election', ...)` block. All existing tests continue to
pass. </objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
@.planning/phases/01-variance-automation-1c3-followons/01-02-leader-lease-manager-PLAN.md
@CLAUDE.md

<interfaces>
<!-- The existing mock pattern that all new tests must extend, verbatim. -->

From tests/unit/services/variance-alert-automation.test.ts (existing top-of-file
pattern):

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@shared/lib/decimal-utils';

async function flushAsyncTurns() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const {
  mockDb,
  mockEnsureAttributedFundMetricsForCalcRun,
  mockCreateBaselineFromCalcRun,
  mockGetBaselines,
  mockResolveBaselineForFund,
  mockComputeVarianceSnapshot,
  mockUpsertTriggeredAlertIncident,
} = vi.hoisted(() => ({
  mockDb: {
    query: { alertRules: { findMany: vi.fn() } },
    insert: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
  // ... other mocks
}));

vi.mock('../../../server/db', () => ({ db: mockDb }));
vi.mock('../../../server/lib/logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

describe('VarianceAlertAutomationService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mockDb.insert.mockImplementation(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 'job-1' }]),
        })),
      })),
    }));
    mockDb.update.mockImplementation(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }));
    mockDb.execute.mockResolvedValue({ rows: [] });
  });

  // ... existing tests
});
```

Contract the lease manager calls (from Plan 02):

- `tryAcquireOrRenewLease()` calls `db.execute(sql\`INSERT INTO
  variance_planner_leader ...\`)`with`RETURNING instance_id, acquired_at,
  lease_expires_at`. It reads `result.rows[0]`and compares`row.instance_id`to`this.instanceId`.
- `releaseLease()` calls `db.execute(sql\`UPDATE variance_planner_leader SET
  lease_expires_at = NOW() ...\`)`.
- `runLeaderRenewalCycle()` just delegates to `tryAcquireOrRenewLease`.
- `runPlannerCycle()` calls `tryAcquireOrRenewLease` first; if it returns false,
  it returns early without calling `planScheduledEvaluations`.

Instance id format: `${hostname}:${pid}:${random6}` — tests do NOT need to know
the exact value; they can capture it by triggering acquisition and reading
whatever `mockDb.execute` was called with, or just assert behavioral outcomes.
</interfaces> </context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add leader-election unit tests to variance-alert-automation.test.ts</name>
  <files>tests/unit/services/variance-alert-automation.test.ts</files>
  <read_first>
    - tests/unit/services/variance-alert-automation.test.ts (FULL file — critical to read the existing mock setup, beforeEach, and test patterns; new tests must extend the same mocks without duplicating them)
    - server/services/variance-alert-automation.ts (the version modified by Plan 02 — confirm the exact method names, log event strings, and the `RETURNING instance_id, acquired_at, lease_expires_at` columns so mock shapes match)
    - .planning/phases/01-variance-automation-1c3-followons/01-02-leader-lease-manager-PLAN.md § behavior (the 8 test expectations authored there)
    - CLAUDE.md § Mandatory Pre-Action Checks → "BEFORE changing shared test mocks or fixtures, grep for ALL assertion patterns that depend on current behavior"
    - MEMORY.md note "Vitest restoreAllMocks Gotcha" (do not add vi.restoreAllMocks in afterEach — will wipe implementations)
  </read_first>
  <behavior>
    Authoring 8 behavioral tests (one describe block, 8 it blocks). Each test is standalone — reset modules in the shared beforeEach, stub `mockDb.execute` per-test for the specific lease scenario.

    1. **"acquires lease on first planner cycle when DB returns our instance_id in RETURNING"**
       - Arrange: `mockDb.execute.mockResolvedValue({ rows: [{ instance_id: /* captured */, acquired_at: '2026-04-07T00:00:00Z', lease_expires_at: '2026-04-07T00:10:00Z' }] })`. Since the service generates its own instance id, the test needs to extract it. Strategy: spy on `mockDb.execute` and on first call, capture the SQL values, inject the same instance_id in the mock response. Simpler: make `mockDb.execute` return the instance id that appears in the SQL parameter (look at the second param of the sql tagged template — Drizzle's `db.execute(sql\`...\`)` stringifies parameters; inspect mock.calls to recover the bound values).
       - Even simpler approach: make `mockDb.execute` a function that inspects its argument (the tagged-template Query object) and returns whatever instance_id was passed. Drizzle's `sql` template object exposes `.queryChunks` or similar — instead of fighting Drizzle's internals, use a simpler pattern: have `mockDb.execute` call a captured callback that returns a row with `instance_id` taken from the module constant `varianceAlertAutomationService.instanceId` (exposed via a test-only cast).
       - PRACTICAL SOLUTION: cast `varianceAlertAutomationService as unknown as { instanceId: string }` to read the instance id in the test, then set `mockDb.execute.mockResolvedValue({ rows: [{ instance_id: service.instanceId, acquired_at: ..., lease_expires_at: ... }] })`. The `instanceId` field is private but accessible via cast at test time. Acceptable in Vitest — this is a common pattern in the existing file.
       - Act: call `(service as any).runPlannerCycle()`.
       - Assert:
         - `mockDb.execute` was called at least once
         - `service.getHealth().planner.isLeader === true`
         - `service.getHealth().planner.leaseExpiresAt === '2026-04-07T00:10:00.000Z'`
         - `service.getHealth().planner.lastElectedAt === '2026-04-07T00:00:00.000Z'`
         - `mockDb.query.alertRules.findMany` WAS called (planner body ran)

    2. **"skips planner body when DB returns a different instance_id (another leader holds the lease)"**
       - Arrange: `mockDb.execute.mockResolvedValue({ rows: [{ instance_id: 'some-other-instance:999:abcdef', acquired_at: '...', lease_expires_at: '2026-04-07T00:10:00Z' }] })` OR `{ rows: [] }` (empty — UPDATE WHERE was false).
       - Act: call `runPlannerCycle()`.
       - Assert:
         - `service.getHealth().planner.isLeader === false`
         - `mockDb.query.alertRules.findMany` was NOT called (planner body skipped)

    3. **"renewal path does NOT reset lastElectedAt"**
       - Arrange: first call returns a row making this instance the leader (`elected` event). Second call returns a row with the same instance_id but an advanced lease_expires_at (renewal).
       - Act: two sequential `runLeaderRenewalCycle()` or `tryAcquireOrRenewLease()` calls.
       - Assert:
         - `lastElectedAt` after the second call equals `lastElectedAt` after the first call (did not change)
         - `leaseExpiresAt` after the second call is strictly greater than the first
         - `isLeader === true` both times

    4. **"demotes and does NOT run planner body when tryAcquireOrRenewLease throws (DB error)"**
       - Arrange: start by making this instance the leader (one successful call), then on the next call `mockDb.execute.mockRejectedValueOnce(new Error('connection refused'))`.
       - Act: call `runPlannerCycle()` a second time.
       - Assert:
         - `service.getHealth().planner.isLeader === false`
         - `service.getHealth().planner.leaseExpiresAt === null`
         - `mockDb.query.alertRules.findMany` was called once total (only from the first successful cycle, not the second)

    5. **"release on stop sets lease_expires_at = NOW() and clears isLeader"**
       - Arrange: become leader via a successful call, then reset the execute spy, then call `service.stop()`.
       - Assert:
         - `mockDb.execute` was called at least once after becoming leader (the release UPDATE)
         - `service.getHealth().planner.isLeader === false`
         - `service.getHealth().planner.leaseExpiresAt === null`
         - The last `mockDb.execute` call's SQL string contains `UPDATE variance_planner_leader` and `lease_expires_at = NOW()` (inspect via mock.calls[N][0].queryChunks or similar — if that is too brittle, simply assert `mockDb.execute.mock.calls.length` increased and rely on Task 5's integration test for SQL correctness)

    6. **"runProcessorCycle runs regardless of leader status (D-04 regression guard)"**
       - Arrange: force this instance to NOT be leader by making `mockDb.execute` for lease acquisition return `{ rows: [] }`. Then set up `mockDb.execute` for the processor path separately (claim SQL returns no row → processor returns early cleanly).
       - Act: call `(service as any).runProcessorCycle()` directly.
       - Assert:
         - `service.getHealth().planner.isLeader === false`
         - `service.getHealth().processor.lastStartedAt !== null` (processor actually ran)
         - `service.getHealth().processor.lastError === null`
       - This is the D-04 regression guard — if someone later accidentally gates the processor on isLeader, this test fails.

    7. **"getHealth returns isLeader false and leaseExpiresAt null before any lease operation"**
       - Arrange: import fresh module (no `start()`, no `runPlannerCycle()`).
       - Assert:
         - `service.getHealth().planner.isLeader === false`
         - `service.getHealth().planner.leaseExpiresAt === null`
         - `service.getHealth().planner.lastElectedAt === null`

    8. **"env vars VARIANCE_PLANNER_LEASE_MS and VARIANCE_PLANNER_RENEWAL_MS override defaults"**
       - Arrange: `vi.stubEnv('VARIANCE_PLANNER_LEASE_MS', '60000')` and `vi.stubEnv('VARIANCE_PLANNER_RENEWAL_MS', '15000')`. Import the service fresh, start it, then call `runLeaderRenewalCycle()` directly with a fixed `now = new Date('2026-04-07T00:00:00Z')`.
       - Arrange: `mockDb.execute.mockImplementation(...)` so the mock captures the `lease_expires_at` that was sent to the DB (inspect the SQL bound values).
       - Assert: the lease expires at `2026-04-07T00:01:00Z` (60_000 ms = 1 minute after now), proving the env var was read.
       - Cleanup: `vi.unstubAllEnvs()` in the test's finally block (NOT in afterEach, per the restoreAllMocks memory gotcha).
       - NOTE: If inspecting the bound SQL value is fragile due to Drizzle's `sql` tagged template opacity, fall back to the simpler assertion: stub the env, let the renewal run, and verify `mockDb.execute` was called — then compare `service.getHealth().planner.leaseExpiresAt` against the expected 1-minute-future timestamp. The server sets `this.leaseExpiresAt = new Date(row.lease_expires_at)` from the RETURNING row — but since the mock provides the row, the test must instead assert by capturing the SQL bound parameter. If that proves impossible, drop this test to env-var-present-no-crash coverage and defer full verification to the integration test.

    Implementation notes:
    - ALL new tests go in a new `describe('leader election', () => { ... })` block inside the existing `describe('VarianceAlertAutomationService', ...)` block. Append after the last existing `it(...)` block.
    - Use the existing `mockDb` / `vi.mock` setup — do NOT re-declare mocks.
    - In `beforeEach` inside the new describe block (if needed), RESET only what you need — do not clobber the existing top-level beforeEach.
    - Use `(service as unknown as { instanceId: string; runPlannerCycle: () => Promise<void>; runProcessorCycle: () => Promise<void>; tryAcquireOrRenewLease: () => Promise<boolean>; runLeaderRenewalCycle: () => Promise<void>; releaseLease: () => Promise<void> })` to access private members in tests — this is a common Vitest pattern.
    - After each test that called `start()`, call `await service.stop()` in a try/finally to avoid leaked timers.
    - Do NOT add `vi.restoreAllMocks()` anywhere — it wipes implementations per the MEMORY gotcha.

  </behavior>
  <action>
Read the full current `tests/unit/services/variance-alert-automation.test.ts` file first (both to understand the existing mock setup and to grep for any existing test name collisions — the new describe block must not duplicate names).

Then append a new `describe('leader election', ...)` block AFTER the last
existing `it(...)` block of the top-level describe, BEFORE the closing `});` of
that block. Implement the 8 tests specified in `<behavior>` exactly. Key rules:

1. Reuse the existing `mockDb` — do NOT redeclare it.
2. For each test that needs lease-specific mock behavior, reset `mockDb.execute`
   at the start of the test with a specific `.mockImplementation` or
   `.mockResolvedValueOnce` chain. Do NOT set a global
   `mockDb.execute.mockResolvedValue` that persists across tests.
3. Access private members via the cast pattern:
   `const svc = service as unknown as { instanceId: string; runPlannerCycle(): Promise<void>; runProcessorCycle(): Promise<void>; tryAcquireOrRenewLease(now?: Date): Promise<boolean>; runLeaderRenewalCycle(): Promise<void>; releaseLease(): Promise<void> };`
4. For the "becomes leader" path, read `svc.instanceId` BEFORE setting up the
   mock response, then use that value in the mock row so the RETURNING-parser
   accepts it.
5. For each test, import the module fresh via
   `await import('../../../server/services/variance-alert-automation')` inside
   the test body (the top-level `beforeEach` calls `vi.resetModules()` — so
   every test sees a fresh singleton).
6. Wrap every test in
   `try { ... } finally { await varianceAlertAutomationService.stop(); }` so
   timers and mock state don't leak.
7. For Test 8 (env vars), use `vi.stubEnv(...)` and `vi.unstubAllEnvs()` in the
   finally block — DO NOT add it to afterEach.

Keep the existing tests UNTOUCHED. Verify with `git diff` that additions are
only within the new describe block and no existing test was modified.

After writing, run:

```
npm test -- --project=server tests/unit/services/variance-alert-automation.test.ts
```

All tests must pass. If any fail, debug by running a single test with
`-t "leader election > <test name>"` rather than blanket changes. </action>
<verify> <automated>npm test -- --project=server
tests/unit/services/variance-alert-automation.test.ts</automated> </verify>
<acceptance_criteria> -
`grep -c "describe('leader election'" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "acquires lease on first planner cycle" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "skips planner body when DB returns a different instance_id" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "renewal path does NOT reset lastElectedAt" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "demotes and does NOT run planner body when tryAcquireOrRenewLease throws" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "release on stop" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "runProcessorCycle runs regardless of leader status" tests/unit/services/variance-alert-automation.test.ts`
returns `1` -
`grep -c "VARIANCE_PLANNER_LEASE_MS" tests/unit/services/variance-alert-automation.test.ts`
returns at least `1` -
`grep -c "restoreAllMocks" tests/unit/services/variance-alert-automation.test.ts`
returns `0` -
`npm test -- --project=server tests/unit/services/variance-alert-automation.test.ts`
exits 0 - All pre-existing tests in this file still pass (count check: the total
passing test count increases by exactly 8 vs pre-plan state) - No changes to any
existing `it(...)` block (verify with `git diff` limited to this file)
</acceptance_criteria> <done>Eight new leader-election unit tests exist, pass,
and coexist with the existing tests. No `restoreAllMocks`, no new top-level
mocks, no modified existing tests.</done> </task>

</tasks>

<threat_model>

## Trust Boundaries

Unit tests run in isolation with mocked DB. No real trust boundary crossings.

## STRIDE Threat Register

| Threat ID | Category                          | Component                       | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------- | ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-03-01   | Test correctness — false green    | mocked lease manager            | mitigate    | Tests assert behavioral outcomes (isLeader, leaseExpiresAt, planner body called/skipped) rather than implementation details. The D-04 regression test (Test 6) explicitly guards against accidentally gating the processor. Integration test in Plan 04 validates against a real DB to catch any mock drift. |
| T-03-02   | Test flakiness — timer leakage    | setInterval in lease manager    | mitigate    | Every test wraps in try/finally with `await service.stop()`. `vi.resetModules()` in the shared beforeEach ensures fresh singletons.                                                                                                                                                                          |
| T-03-03   | Test isolation — stale mock state | mockDb.execute persistent value | mitigate    | Each test sets its mock implementation locally and relies on `vi.clearAllMocks()` in the shared beforeEach. Avoids `vi.restoreAllMocks` per the MEMORY gotcha.                                                                                                                                               |

</threat_model>

<verification>
- `npm test -- --project=server tests/unit/services/variance-alert-automation.test.ts` passes
- Total test count in the file increased by 8
- No existing tests modified
- No `vi.restoreAllMocks()` added anywhere
</verification>

<success_criteria>

- 8 new behavioral tests covering acquisition, takeover blocked, renewal,
  demotion on DB error, release on stop, D-04 processor-runs-regardless guard,
  initial state, env var override
- All tests green under `TZ=UTC` (set by the existing test harness)
- No pre-existing tests regressed
- Private members accessed only via documented cast pattern </success_criteria>

<output>
After completion, create `.planning/phases/01-variance-automation-1c3-followons/01-03-SUMMARY.md` documenting:
- The 8 test names added
- The private-member-access cast pattern used
- Confirmation that `runProcessorCycle` regression guard is in place (Test 6)
- Any test that had to be softened due to Drizzle `sql` tagged-template opacity
</output>
</content>
</invoke>
