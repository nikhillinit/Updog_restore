---
phase: 01-variance-automation-1c3-followons
plan: 01-02
status: complete
completed: 2026-04-07
---

# Plan 01-02: Leader Lease Manager — SUMMARY

## What was built

Leader election lease manager + planner-loop gate inside
`server/services/variance-alert-automation.ts`. Implements D-01 through D-04
from `01-CONTEXT.md`. Single file modified (263 insertions, 2 deletions).

## New method signatures

```typescript
private async tryAcquireOrRenewLease(now: Date = new Date()): Promise<boolean>
private async releaseLease(): Promise<void>
private async runLeaderRenewalCycle(): Promise<void>
```

All three are private methods on `VarianceAlertAutomationService`. They use the
existing `withTimeout` helper to bound DB calls and the existing
`log = logger.child({ module: 'variance-alert-automation' })` Pino child.

## Instance identity format

```typescript
`${hostname}:${pid}:${random6}`;
```

Where:

- `hostname` = `process.env['HOSTNAME']` (Linux/CI) OR
  `process.env['COMPUTERNAME']` (Windows) OR `'unknown-host'`
- `pid` = `process.pid`
- `random6` = 6 base36 characters (~2 billion possibilities) to disambiguate
  fast PID reuse within a single lease window

Computed once at field initialization
(`private readonly instanceId: string = computeInstanceIdentity();`) so all log
events reference a stable id for the lifetime of the process.

## Defaults and env vars

| Constant                              | Default                                                    | Env var                       |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `DEFAULT_VARIANCE_PLANNER_LEASE_MS`   | 600_000 (10m)                                              | `VARIANCE_PLANNER_LEASE_MS`   |
| `DEFAULT_VARIANCE_PLANNER_RENEWAL_MS` | 150_000 (2.5m)                                             | `VARIANCE_PLANNER_RENEWAL_MS` |
| `LEADER_ROW_ID`                       | `'variance-planner'` (constant; D-03 single global leader) | n/a                           |

Env values are parsed via the existing `parsePositiveIntEnv` helper, which
clamps to positive integers and falls back to the default on parse failure.

## Pino log event catalog

| Event                          | Level | Trigger                                                |
| ------------------------------ | ----- | ------------------------------------------------------ |
| `alert.planner.leader.elected` | info  | First successful acquisition (`!wasLeader && success`) |
| `alert.planner.leader.renewed` | info  | Successful renewal of an already-held lease            |
| `alert.planner.leader.demoted` | info  | Takeover lost to another instance (`takeover_lost`)    |
| `alert.planner.leader.demoted` | warn  | DB error or timeout during acquire/renew (`db_error`)  |
| `alert.planner.leader.demoted` | info  | Graceful release on `stop()` (`reason: 'stop'`)        |
| `alert.planner.leader.demoted` | warn  | Release UPDATE failed on `stop()` (`release_failed`)   |
| `alert.planner.skipped`        | debug | `runPlannerCycle` skipped because not leader           |

**M-3 fix:** the `renewed` event is emitted at `log.info` (NOT `log.debug`)
because Phase 1 success criterion 1 requires leader state observable via logs,
and most production pino streams filter to `info` and above. Verified by an
inline AST-style scan in the acceptance criteria block.

## Untouched paths (D-04 — planner-only gate)

The following methods were verified UNCHANGED via `git diff` and Codex review:

- `runProcessorCycle` — runs on every instance regardless of leader status
- `recoverStaleProcessingJobs` — same
- `runCalcRunCompletion` — realtime path, never gated
- `planScheduledEvaluations`
- `claimNextScheduledEvaluationJob`
- `processScheduledEvaluationJob`
- `markJobCompleted`
- `markJobCancelled`
- `handleJobFailure`

Exported singleton on the last line is unchanged:

```typescript
export const varianceAlertAutomationService =
  new VarianceAlertAutomationService();
```

`server/routes.ts:13` (the `varianceAlertAutomationService.start()` call site)
is also unchanged — Plan 01-02 does not modify the bootstrap path; every
instance still calls `.start()`, only the planner _cycle_ is gated.

## Verification performed

- `npm run check` → 0 new TypeScript errors (baseline holds at 0)
- 16 acceptance grep checks → all pass (console: 0, all required identifiers
  present at expected count, M-3 log.info check passes)
- Codex review (`codex exec --sandbox read-only`) against the plan spec →
  **PASS**
- Pre-commit hook (eslint --fix --max-warnings 0 + prettier --write) → green

## Commit

`c9f9ccc0` — feat(01-variance-automation-1c3-followons): leader lease manager +
planner gate (01-02 task 1)

## Self-Check

- [x] All 3 new methods exist on the class
- [x] `runPlannerCycle` calls `tryAcquireOrRenewLease` and returns early when
      not leader
- [x] `start()` schedules `leaderRenewalTimer` at `VARIANCE_PLANNER_RENEWAL_MS`
- [x] `stop()` clears `leaderRenewalTimer` AND awaits `releaseLease()` as the
      last statement
- [x] `getHealth().planner` includes `isLeader`, `leaseExpiresAt`,
      `lastElectedAt`
- [x] All 3 Pino events present; `renewed` is `log.info`
- [x] `instanceId` computed once at field initialization
- [x] `npm run check` green
- [x] Untouched method bodies verified via git diff
- [x] Exported singleton unchanged

## What this unblocks

Plan 01-03 (unit tests) can now mock `db.execute` and assert
`tryAcquireOrRenewLease` / `releaseLease` / `runLeaderRenewalCycle` behavior
against the mock-Drizzle pattern already in
`tests/unit/services/variance-alert-automation.test.ts`.

Plan 01-04 (integration test) can fast-forward `lease_expires_at` in the live DB
(via the same connection used by `tryAcquireOrRenewLease`) and call
`tryAcquireOrRenewLease` on a second in-process service instance with a distinct
`instanceId` to assert takeover semantics — without spawning a second Node
process (REFL-024).
