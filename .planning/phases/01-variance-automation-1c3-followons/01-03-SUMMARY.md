---
phase: 01-variance-automation-1c3-followons
plan: 01-03
subsystem: variance-automation
status: complete
completed: 2026-04-07
tags:
  - unit-tests
  - leader-election
  - variance-automation
  - mock-drizzle
requires:
  - 01-02 (leader lease manager + planner gate)
provides:
  - Mocked unit-test coverage of tryAcquireOrRenewLease, releaseLease,
    runLeaderRenewalCycle, runPlannerCycle leader gate, and D-04 processor
    regression guard
affects:
  - tests/unit/services/variance-alert-automation.test.ts
key_files:
  modified:
    - tests/unit/services/variance-alert-automation.test.ts
decisions:
  - Bypass public start() in leader-election tests; flip private `enabled` flag
    via LeaderTestSurface cast and drive lease methods directly. start()
    synchronously kicks off both planner AND processor cycles which interleaves
    mockDb.execute calls and corrupts lease-specific mock setup.
  - Use mockResolvedValueOnce chains for sequential lease states rather than
    mockImplementation, now that start() no longer consumes mocks.
  - Drop the strong "env var reads produce expected lease_expires_at in the SQL"
    assertion for Test 8 because Drizzle's sql tagged-template is opaque under
    the mock. Defer authoritative env-var verification to the Plan 04
    integration test, which exercises the live SQL path and can read the actual
    table row. Unit test now asserts env vars are non-fatal and the code path
    completes successfully under override.
metrics:
  duration_minutes: 12
  tasks_completed: 1
  tests_added: 8
  existing_tests: 7
  total_tests_in_file: 15
  files_modified: 1
  commits: 1
---

# Plan 01-03: Leader Election Unit Tests — SUMMARY

## What was built

Added a new `describe('leader election', ...)` block inside
`tests/unit/services/variance-alert-automation.test.ts` with 8 behavioral tests
that cover the leader lease manager + planner gate shipped in Plan 01-02. All
tests use the existing `vi.mock('../../../server/db', () => ({ db: mockDb }))`
pattern — no real DB connection, no new top-level mocks, no changes to any
pre-existing test.

Pure addition: 342 insertions, 0 substantive deletions. (The commit hook's
prettier pass reformatted a handful of existing `await import(...)` expressions
to single-line form; those 4 lines account for the "4 deletions" in the diff
stat but are cosmetic only and touch no test logic.)

## The 8 test names added

1. `acquires lease on first planner cycle when DB returns our instance_id in RETURNING`
2. `skips planner body when DB returns empty rows (another leader holds the lease)`
3. `renewal path does NOT reset lastElectedAt`
4. `demotes and does NOT run planner body when tryAcquireOrRenewLease throws (DB error)`
5. `release on stop sets lease_expires_at = NOW() and clears isLeader`
6. `runProcessorCycle runs regardless of leader status (D-04 regression guard)`
7. `getHealth returns isLeader false and leaseExpiresAt null before any lease operation`
8. `VARIANCE_PLANNER_LEASE_MS env var overrides default lease duration`

## Method-level coverage map

| Method under test (Plan 01-02)                                      | Covered by tests    |
| ------------------------------------------------------------------- | ------------------- |
| `tryAcquireOrRenewLease` (elected branch)                           | 1, 3, 5, 8          |
| `tryAcquireOrRenewLease` (takeover-blocked, empty rows)             | 2                   |
| `tryAcquireOrRenewLease` (DB error demotion)                        | 4                   |
| `tryAcquireOrRenewLease` (renewal branch)                           | 3                   |
| `runLeaderRenewalCycle`                                             | 3                   |
| `releaseLease`                                                      | 5                   |
| `runPlannerCycle` leader gate (early-return when !leader)           | 2, 4                |
| `runProcessorCycle` not gated on leader (D-04)                      | 6                   |
| `getHealth().planner.isLeader / leaseExpiresAt / lastElectedAt`     | 1, 2, 3, 4, 5, 7, 8 |
| Env var `VARIANCE_PLANNER_LEASE_MS` / `VARIANCE_PLANNER_RENEWAL_MS` | 8                   |

Every bullet in the plan's `must_haves.truths` list is addressed:

- Initial acquisition: Test 1
- Renewal: Test 3
- Takeover blocked: Test 2
- Takeover succeeded: (implicit in Test 1's RETURNING row path — the mock
  represents either a fresh insert or a successful takeover since both branches
  converge in the UPDATE clause)
- Demotion on DB error: Test 4
- isLeader gate on runPlannerCycle: Tests 2, 4
- Release on stop: Test 5
- `runProcessorCycle` runs regardless of leader status (D-04 regression): Test 6
- All tests pass under TZ=UTC: confirmed via `cross-env TZ=UTC vitest` wrapper
  in `npm test -- --project=server`

## Private-member access pattern

All leader tests use a structural cast to reach private fields/methods on the
singleton:

```typescript
type LeaderTestSurface = {
  instanceId: string;
  enabled: boolean;
  isLeader: boolean;
  leaseExpiresAt: Date | null;
  lastElectedAt: Date | null;
  runPlannerCycle: () => Promise<void>;
  runProcessorCycle: () => Promise<void>;
  tryAcquireOrRenewLease: (now?: Date) => Promise<boolean>;
  runLeaderRenewalCycle: () => Promise<void>;
  releaseLease: () => Promise<void>;
};

const svc = varianceAlertAutomationService as unknown as LeaderTestSurface;
```

This mirrors the `(service as any).handleJobFailure(...)` pattern already used
by the existing retry test at line ~446 of the same file. Using a typed surface
rather than `as any` gives us IntelliSense and catches signature drift at
compile time.

## Why tests bypass `start()`

`start()` on the service synchronously fires both `runPlannerCycle()` and
`runProcessorCycle()` via `void` expressions. Both paths hit `mockDb.execute`,
and the processor's `claimNextScheduledEvaluationJob` unconditionally reads rows
as job shapes (`row['jobType']`, `row['payload']`, etc.). When a test seeds
`mockDb.execute` with a lease-row shape, the processor's `mapJobRow`
reinterprets the lease row as a corrupt job row and `handleJobFailure` then
throws on `payload.frequency` — polluting the test with unhandled rejections.

The fix: flip the private `enabled` flag directly via the cast, then drive the
specific lease method under test. Every test restores
`enabled`/`isLeader`/`leaseExpiresAt`/`lastElectedAt` in a `finally` block so
singleton state does not leak across tests. Timers are never started (because
`start()` is never called), so there is nothing to tear down.

Only Test 6 (D-04 regression guard) explicitly drives `runProcessorCycle`, and
it seeds `mockDb.execute` with `{ rows: [] }` for ALL calls — so the claim SQL
returns no row and the processor completes cleanly.

## Mocked surfaces

| Mock                                                                   | What it stands in for                                                                                                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vi.mock('../../../server/db', () => ({ db: mockDb }))` (pre-existing) | Drizzle `db` import; `db.execute` returns `{ rows: [...] }` per test                                                                                                         |
| `mockDb.query.alertRules.findMany` (pre-existing)                      | `db.query.alertRules.findMany(...)` — stubbed to `[]` in all leader tests to prove the planner body either ran or did not run                                                |
| `mockDb.execute` (pre-existing)                                        | The lease INSERT/ON CONFLICT, the release UPDATE, and (in Test 6) the processor claim SQL. Each test sets its own `mockResolvedValueOnce` / `mockRejectedValueOnce` sequence |
| `vi.mock('../../../server/lib/logger', ...)` (pre-existing)            | Pino child logger — all `log.info/debug/warn/error` calls are absorbed by `vi.fn()` stubs                                                                                    |
| `vi.stubEnv('VARIANCE_PLANNER_LEASE_MS', '60000')` (Test 8)            | Overrides the default 10-minute lease to 60 seconds                                                                                                                          |
| `vi.stubEnv('VARIANCE_PLANNER_RENEWAL_MS', '15000')` (Test 8)          | Overrides the default 2.5-minute renewal to 15 seconds                                                                                                                       |

No additional `vi.mock` calls were introduced by this plan. No
`vi.restoreAllMocks()` — the MEMORY note on the Vitest `restoreAllMocks` gotcha
explicitly warns against it, and the existing top-level `beforeEach` already
runs `vi.clearAllMocks()` which is sufficient.

## D-04 regression guard confirmation

Test 6 (`runProcessorCycle runs regardless of leader status`) is the explicit
D-04 guard. It:

1. Sets `svc.enabled = true` without acquiring a lease (so `svc.isLeader` stays
   `false`).
2. Asserts `svc.isLeader === false` before the call.
3. Calls `svc.runProcessorCycle()` directly.
4. Asserts `health.processor.lastStartedAt` is non-null (proving the processor
   body ran).
5. Asserts `health.processor.lastError` is null (proving the body completed
   cleanly).
6. Reasserts `health.planner.isLeader === false` (sanity).

If a future edit accidentally adds `if (!this.isLeader) return;` at the top of
`runProcessorCycle`, steps 4 and 5 both fail because `lastStartedAt` stays at
its initial `null`.

## Deviations from Plan

### Softened test 8 (env var assertion strength)

**Planned:** assert that the env var override propagates to the
`lease_expires_at` value the service writes to the DB, by inspecting the SQL
bound parameters.

**Actual:** assert that env vars are non-fatal and the code path completes
successfully under override. Specifically:

- `tryAcquireOrRenewLease(fixedNow)` returns `true`
- `getHealth().planner.leaseExpiresAt` reflects the mock-returned row
- `getHealth().planner.lastElectedAt` reflects the mock-returned row
- `mockDb.execute` was invoked

**Why:** Drizzle's `sql` tagged-template object stores bound parameters as
opaque `SQLChunk` instances that are not safely introspectable in test code
without reaching into Drizzle internals. The plan anticipated this risk (see
`<behavior>` NOTE for test 8: _"If inspecting the bound SQL value is fragile due
to Drizzle's sql tagged-template opacity, fall back to the simpler assertion"_)
and explicitly authorized the fallback.

**Coverage gap closed by:** the Plan 01-04 integration test exercises the actual
SQL path against a live DB and can assert the real table row's
`lease_expires_at` against a live `NOW() + 60s` window — that will be the
authoritative env-var verification.

### Test 2 renamed

**Planned name:**
`"skips planner body when DB returns a different instance_id (another leader holds the lease)"`

**Actual name:**
`"skips planner body when DB returns empty rows (another leader holds the lease)"`

**Why:** The atomic INSERT ... ON CONFLICT DO UPDATE ... WHERE clause in Plan
01-02 returns EMPTY rows when the WHERE predicate is false (another instance
holds an unexpired lease). It does not return a row with a foreign
`instance_id`. Testing the empty-rows path is the behavior the production SQL
actually emits, so the test asserts the real contract. (The plan's behavioral
note "OR `{ rows: [] }` (empty — UPDATE WHERE was false)" explicitly lists both
options as acceptable.) The grep-based acceptance criterion in the plan wanted
the literal substring
`"skips planner body when DB returns a different instance_id"` — this rename
diverges from that but the spirit of the test is preserved, and the integration
test in Plan 04 can cover the foreign-instance scenario against a live DB if
needed.

## Verification performed

- `npm test -- --project=server tests/unit/services/variance-alert-automation.test.ts`
  -> **15/15 passing** (7 pre-existing + 8 new)
- `npm run check` -> **0 new TypeScript errors** (baseline holds at 0)
- `git diff --stat` on the test file: +342/-4 (the 4 deletions are prettier
  reformatting of pre-existing `await import(...)` expressions to single-line
  form, zero test logic deletions)
- Pre-commit hook (eslint --fix --max-warnings 0 + prettier --write + emoji
  scan + bigint safety check): PASS
- Conventional commit format: PASS

## Commit

`6df7f83a` — test(01-variance-automation-1c3-followons): add leader election
unit tests (01-03 task 1)

## Self-Check

- [x] `describe('leader election'` appears exactly once in the test file
- [x] All 8 test names present as `it(...)` blocks
- [x] Zero `vi.restoreAllMocks()` occurrences in the file
- [x] No changes to any pre-existing `it(...)` test body (verified via
      `git diff` — only prettier reformatting of existing `await import(...)`
      lines)
- [x] Total test count in file is 15 (was 7, added 8)
- [x] All 15 tests pass under `TZ=UTC` via `cross-env`
- [x] `npm run check` shows 0 new TypeScript errors
- [x] No real DB connection introduced — `vi.mock('../../../server/db')` is the
      only DB access path
- [x] Commit `6df7f83a` exists in `git log`
- [x] D-04 regression guard (Test 6) explicitly drives `runProcessorCycle` while
      `isLeader === false` and asserts the processor body ran

## What this unblocks

Plan 01-04 (integration test) can now rely on a stable mocked baseline — any
live-DB divergence caught by the integration test points at the actual SQL
contract rather than mock drift. The integration test is also responsible for:

1. Cracking open the Drizzle `sql` tagged-template opacity by asserting the real
   `lease_expires_at` column value after `tryAcquireOrRenewLease(fixedNow)` is
   called on a live DB with `VARIANCE_PLANNER_LEASE_MS=60000` in the
   environment.
2. Exercising the foreign-`instance_id` takeover scenario (Plan 02's
   fast-forward lease-expiry harness simulates a dead leader, and a second
   in-process service instance takes over).
3. Validating the actual Pino event stream against the log event catalog in Plan
   01-02's SUMMARY.

## Self-Check: PASSED

All items above verified. Commit `6df7f83a` is on `main`. File
`tests/unit/services/variance-alert-automation.test.ts` exists and contains 15
passing tests under TZ=UTC.
