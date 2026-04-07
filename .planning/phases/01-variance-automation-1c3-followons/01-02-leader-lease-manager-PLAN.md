---
phase: 01-variance-automation-1c3-followons
plan: 02
type: execute
wave: 2
depends_on:
  - 01
files_modified:
  - server/services/variance-alert-automation.ts
autonomous: true
requirements:
  - REQ-VAR-01
must_haves:
  truths:
    - 'runPlannerCycle() only executes the plan body when
      tryAcquireOrRenewLease() returns true'
    - 'A renewal timer runs at VARIANCE_PLANNER_RENEWAL_MS interval while
      enabled'
    - 'stop() explicitly releases the lease via UPDATE variance_planner_leader
      SET lease_expires_at = now() WHERE instance_id = $me'
    - 'Renewal failures demote the current instance — subsequent runPlannerCycle
      calls skip until re-elected'
    - 'getHealth().planner exposes isLeader, leaseExpiresAt, lastElectedAt'
    - 'Pino log events alert.planner.leader.elected / demoted / renewed are
      emitted at the correct transitions at log.info level'
    - 'runProcessorCycle and recoverStaleProcessingJobs are UNCHANGED — gate is
      planner-only (D-04)'
  artifacts:
    - path: 'server/services/variance-alert-automation.ts'
      provides:
        'Leader lease manager + planner-loop gate + env-tunable lease/renewal +
        extended getHealth'
      contains: 'VARIANCE_PLANNER_LEASE_MS'
  key_links:
    - from: 'runPlannerCycle'
      to: 'tryAcquireOrRenewLease'
      via: 'if (!await tryAcquireOrRenewLease()) return;'
      pattern: 'tryAcquireOrRenewLease'
    - from: 'start()'
      to: 'leaderRenewalTimer'
      via: 'setInterval at VARIANCE_PLANNER_RENEWAL_MS'
      pattern: 'leaderRenewalTimer'
    - from: 'stop()'
      to: 'releaseLease()'
      via: 'explicit UPDATE variance_planner_leader'
      pattern: 'releaseLease'
    - from: 'getHealth()'
      to: 'leader state'
      via: 'planner block includes isLeader, leaseExpiresAt, lastElectedAt'
      pattern: 'isLeader'
---

<objective>
Add leader election to `VarianceAlertAutomationService` so only the elected instance runs `runPlannerCycle`. This is the implementation of D-01 through D-04 from CONTEXT.md: heartbeat-table primitive, 10-minute lease with 2.5-minute renewal (both env-tunable), single global leader across all frequencies, planner loop gated (NOT processor, NOT recovery). Renewal failures demote the instance (fail-safe over split-brain). Graceful shutdown releases the lease so deploys do not stall planning for ~10 minutes.

Purpose: eliminate duplicate planner log spam from
`INSERT ... ON CONFLICT DO NOTHING` across multi-instance deployments while
preserving processor/recovery resilience on every instance.

Output: one modified file — `server/services/variance-alert-automation.ts` —
with a new private lease manager, a gated `runPlannerCycle`, a fourth timer
(`leaderRenewalTimer`), extended `getHealth()`, and three new Pino log events.
</objective>

<execution_context>
@C:/Users/nikhi/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/nikhi/.claude/get-shit-done/templates/summary.md </execution_context>

<context>
@.planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md
@.planning/phases/01-variance-automation-1c3-followons/01-01-leader-table-schema-PLAN.md
@CLAUDE.md

<interfaces>
<!-- Full current state of the file being modified. These signatures MUST be preserved. -->

From server/services/variance-alert-automation.ts (current state as of this
plan):

```typescript
// Line 1-7 — imports
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';
import { ensureAttributedFundMetricsForCalcRun } from './fund-metrics-attribution-service';
import { jobOutbox, alertRules, type JobOutbox } from '@shared/schema';
import { varianceTrackingService } from './variance-tracking';
import { VarianceAlertEvaluationService } from './variance-alert-evaluation';

// Line 19-40 — existing AlertAutomationHealth type (planner block to be extended)
type AlertAutomationHealth = {
  enabled: boolean;
  planner: {
    running: boolean;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    lastError: string | null;
  };
  processor: { ... };
  counters: { ... };
};

// Line 42 — existing Pino child logger (reuse; do NOT create a new logger)
const log = logger.child({ module: 'variance-alert-automation' });

// Line 43-48 — constants
const JOB_TYPE = 'variance_alert_evaluation';
const PROCESSING_STALE_MS = 10 * 60 * 1000;
const RECOVERY_SWEEP_MS = 5 * 60 * 1000;
const DEFAULT_PLANNER_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSOR_INTERVAL_MS = 30 * 1000;
const DEFAULT_STEP_TIMEOUT_MS = 30 * 1000;

// Line 54-62 — existing env parse helper (reuse)
function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Line 64-85 — existing withTimeout helper (reuse for all leader DB calls)
function withTimeout<T>(label: string, work: () => Promise<T> | T, timeoutMs = DEFAULT_STEP_TIMEOUT_MS): Promise<T>;

// Line 136-172 — class + existing private state (extend; do not reshape)
export class VarianceAlertAutomationService {
  private plannerTimer: NodeJS.Timeout | null = null;
  private processorTimer: NodeJS.Timeout | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private plannerInFlight = false;
  private processorInFlight = false;
  private enabled = false;
  private readonly healthState: { ... };

  // Line 174-216 — start()
  start(options?: { enabled?: boolean; plannerIntervalMs?: number; processorIntervalMs?: number });

  // Line 218-233 — stop()
  async stop(): Promise<void>;

  // Line 235-253 — getHealth()
  getHealth(): AlertAutomationHealth;

  // Line 581-600 — runPlannerCycle (MUST be gated)
  private async runPlannerCycle(): Promise<void> {
    if (!this.enabled || this.plannerInFlight) { return; }
    this.plannerInFlight = true;
    // ... runs planScheduledEvaluations(), updates healthState.planner, catches errors ...
  }

  // Line 602-644 — runProcessorCycle (UNCHANGED — D-04 gate is planner-only)
  // Line 416-462 — recoverStaleProcessingJobs (UNCHANGED — D-04 gate is planner-only)
  // Line 255-320 — runCalcRunCompletion (UNCHANGED — realtime path, not scheduled)
}

// Line 710 — exported singleton
export const varianceAlertAutomationService = new VarianceAlertAutomationService();
```

From shared/schema.ts (added by Plan 01 — import this):

```typescript
export const variancePlannerLeader = pgTable(
  'variance_planner_leader',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    instanceId: varchar('instance_id', { length: 255 }).notNull(),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).defaultNow().notNull(),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }).notNull(),
    lastRenewedAt: timestamp('last_renewed_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  ...
);
export type VariancePlannerLeader = typeof variancePlannerLeader.$inferSelect;
```

</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add leader lease manager, planner gate, renewal timer, getHealth extension, and release-on-stop to variance-alert-automation.ts</name>
  <files>server/services/variance-alert-automation.ts</files>
  <read_first>
    - server/services/variance-alert-automation.ts (FULL file — all 710 lines. Critical sections: imports 1-7, type AlertAutomationHealth 19-40, constants 43-48, parsePositiveIntEnv 54-62, withTimeout 64-85, class opening 136-172, start 174-216, stop 218-233, getHealth 235-253, runPlannerCycle 581-600, runProcessorCycle 602-644 — leave the processor/recovery paths untouched)
    - shared/schema.ts (lines ~2587-2630 — the variancePlannerLeader block added in Plan 01 that this task imports)
    - .planning/phases/01-variance-automation-1c3-followons/01-CONTEXT.md (D-01 through D-04, specifics § Graceful shutdown matters / Fail-safe on renewal error, decisions § Claude's Discretion → Instance identity / Renewal timer lifecycle / Behavior on DB unavailability during renewal)
    - CLAUDE.md § Memory → "Linter Edit Hook Import Ordering" (add imports in the SAME edit as the consuming code or the hook will strip them)
  </read_first>
  <behavior>
    Specification (NOT test-driven ordering — the test authority for Dimension 8 sampling is Plan 03, which authors Vitest unit tests against this implementation after it is committed). The block below documents the expected behaviors so the implementation in the action is grounded in observable outcomes and the Plan 03 tests can cite this list directly.

    - `tryAcquireOrRenewLease()` returns true on a fresh DB (first acquisition) and the singleton row is inserted with `id = 'variance-planner'`, `instance_id = $me`, and `lease_expires_at > now()`.
    - `tryAcquireOrRenewLease()` returns true when called a second time by the same instance (renewal path) — `last_renewed_at` and `lease_expires_at` advance, `acquired_at` does NOT change.
    - `tryAcquireOrRenewLease()` returns false when a different instance holds an unexpired lease.
    - `tryAcquireOrRenewLease()` returns true when a different instance held the lease but `lease_expires_at < now()` (takeover path) — `instance_id` updates AND `acquired_at` resets.
    - If the renewal DB call throws or times out, the next `runPlannerCycle()` invocation is a no-op (leader demoted, `isLeader` is false, `alert.planner.leader.demoted` log emitted once).
    - `runPlannerCycle()` does NOT call `planScheduledEvaluations` when `isLeader` is false.
    - `runProcessorCycle` and `recoverStaleProcessingJobs` still execute regardless of leader status (D-04).
    - `stop()` issues an UPDATE that sets `lease_expires_at = now()` for the current instance AND clears the renewal timer AND clears `isLeader`.
    - `getHealth().planner.isLeader` is true after a successful acquisition and false after `stop()`.

  </behavior>
  <action>
This is a SINGLE edit to `server/services/variance-alert-automation.ts`. Because of the linter import hook that strips unused imports, you MUST make all changes (import additions, type additions, class member additions, method additions) in one pass — do NOT split into multiple sub-edits.

### Step 1 — Imports (line 5)

Change line 5 from:

```typescript
import { jobOutbox, alertRules, type JobOutbox } from '@shared/schema';
```

to:

```typescript
import {
  jobOutbox,
  alertRules,
  variancePlannerLeader,
  type JobOutbox,
} from '@shared/schema';
```

`sql` is already imported from `drizzle-orm` on line 1
(`import { and, eq, inArray, sql } from 'drizzle-orm';`) — no change needed
there.

### Step 2 — New constants (after line 48, before line 50 `function toIsoOrNull`)

Add:

```typescript
const DEFAULT_VARIANCE_PLANNER_LEASE_MS = 10 * 60 * 1000;
const DEFAULT_VARIANCE_PLANNER_RENEWAL_MS = 2.5 * 60 * 1000;
const LEADER_ROW_ID = 'variance-planner';
```

Rationale: `LEADER_ROW_ID` is a module constant because D-03 mandates a single
global leader, so the singleton row id is fixed.

### Step 3 — Extend the AlertAutomationHealth type (line 19-40)

Replace the `planner` block inside `type AlertAutomationHealth`:

```typescript
planner: {
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
}
```

with:

```typescript
planner: {
  running: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
  isLeader: boolean;
  leaseExpiresAt: string | null;
  lastElectedAt: string | null;
}
```

Do NOT modify the `processor` or `counters` blocks.

### Step 4 — Instance identity helper (after line 85, after `withTimeout`)

Add a module-scope helper:

```typescript
function computeInstanceIdentity(): string {
  // D-01 Claude's Discretion → instance identity format.
  // Use `${hostname}:${pid}` so logs are immediately debuggable in multi-instance
  // deployments, and append a short random suffix to disambiguate fast restarts
  // where the OS reuses the PID within the same lease window.
  const hostname =
    process.env['HOSTNAME'] || process.env['COMPUTERNAME'] || 'unknown-host';
  const pid = process.pid;
  const random = Math.random().toString(36).slice(2, 8);
  return `${hostname}:${pid}:${random}`;
}
```

### Step 5 — Add private state to the class (after line 148 `private enabled = false;`, before line 149 `private readonly healthState`)

Add these private fields:

```typescript
  private leaderRenewalTimer: NodeJS.Timeout | null = null;
  private readonly instanceId: string = computeInstanceIdentity();
  private isLeader = false;
  private leaseExpiresAt: Date | null = null;
  private lastElectedAt: Date | null = null;
  private leaderRenewalInFlight = false;
```

### Step 6 — Add the lease manager methods (as private methods on the class — insert AFTER the existing `private async runProcessorCycle` method, around line 645, BEFORE `private async markJobCompleted`)

```typescript
  /**
   * Attempts to acquire a new leader lease OR renew the current one.
   * Returns true if this instance now holds the lease, false otherwise.
   *
   * Uses a single atomic INSERT ... ON CONFLICT DO UPDATE with a WHERE predicate
   * on the UPDATE clause: the takeover is conditional on the existing lease
   * being expired OR already held by this instance. If a different instance
   * holds an unexpired lease, the UPDATE is a no-op and this instance is NOT
   * leader.
   *
   * Fail-safe: any DB error or timeout demotes this instance. See D-01 (atomic
   * takeover discipline) and specifics § "Fail-safe on renewal error".
   */
  private async tryAcquireOrRenewLease(now: Date = new Date()): Promise<boolean> {
    const leaseMs = parsePositiveIntEnv(
      'VARIANCE_PLANNER_LEASE_MS',
      DEFAULT_VARIANCE_PLANNER_LEASE_MS
    );
    const newExpiresAt = new Date(now.getTime() + leaseMs);
    const wasLeader = this.isLeader;

    try {
      const result = await withTimeout('variancePlannerLeader.acquire', () =>
        db.execute(sql`
          INSERT INTO variance_planner_leader (
            id, instance_id, acquired_at, lease_expires_at, last_renewed_at, created_at, updated_at
          )
          VALUES (
            ${LEADER_ROW_ID},
            ${this.instanceId},
            ${now.toISOString()},
            ${newExpiresAt.toISOString()},
            ${now.toISOString()},
            ${now.toISOString()},
            ${now.toISOString()}
          )
          ON CONFLICT (id) DO UPDATE
          SET
            instance_id = CASE
              WHEN variance_planner_leader.instance_id = ${this.instanceId} THEN variance_planner_leader.instance_id
              ELSE EXCLUDED.instance_id
            END,
            acquired_at = CASE
              WHEN variance_planner_leader.instance_id = ${this.instanceId} THEN variance_planner_leader.acquired_at
              ELSE EXCLUDED.acquired_at
            END,
            lease_expires_at = EXCLUDED.lease_expires_at,
            last_renewed_at = EXCLUDED.last_renewed_at,
            updated_at = EXCLUDED.updated_at
          WHERE
            variance_planner_leader.lease_expires_at < ${now.toISOString()}::timestamptz
            OR variance_planner_leader.instance_id = ${this.instanceId}
          RETURNING instance_id, acquired_at, lease_expires_at
        `)
      );

      const row = result.rows[0] as
        | { instance_id: string; acquired_at: string | Date; lease_expires_at: string | Date }
        | undefined;

      if (!row || row.instance_id !== this.instanceId) {
        // Either the UPDATE was skipped (another instance holds an unexpired
        // lease) or the row was claimed by someone else between INSERT and
        // RETURNING. We are not leader.
        if (wasLeader) {
          this.isLeader = false;
          this.leaseExpiresAt = null;
          log.info(
            {
              event: 'alert.planner.leader.demoted',
              instanceId: this.instanceId,
              reason: 'takeover_lost',
            },
            'Variance planner leader demoted (takeover lost to another instance)'
          );
        }
        return false;
      }

      this.isLeader = true;
      this.leaseExpiresAt = new Date(row.lease_expires_at);

      if (!wasLeader) {
        this.lastElectedAt = new Date(row.acquired_at);
        log.info(
          {
            event: 'alert.planner.leader.elected',
            instanceId: this.instanceId,
            leaseExpiresAt: this.leaseExpiresAt.toISOString(),
            acquiredAt: this.lastElectedAt.toISOString(),
          },
          'Variance planner leader elected'
        );
      } else {
        // Log at info level (NOT debug) so the most frequent transition is
        // visible in production pino streams. Phase 1 success criterion 1
        // requires leader state be observable via logs, and most pino configs
        // filter to info and above in production. See M-3 in the revision
        // checker feedback.
        log.info(
          {
            event: 'alert.planner.leader.renewed',
            instanceId: this.instanceId,
            leaseExpiresAt: this.leaseExpiresAt.toISOString(),
          },
          'Variance planner leader lease renewed'
        );
      }

      return true;
    } catch (error) {
      // Fail-safe: any DB error or timeout → demote. Favors false-negatives over
      // split-brain. See CONTEXT.md specifics § "Fail-safe on renewal error".
      if (wasLeader) {
        this.isLeader = false;
        this.leaseExpiresAt = null;
        log.warn(
          {
            event: 'alert.planner.leader.demoted',
            instanceId: this.instanceId,
            reason: 'db_error',
            err: error instanceof Error ? error.message : String(error),
          },
          'Variance planner leader demoted due to DB error during acquire/renew'
        );
      } else {
        log.debug(
          {
            instanceId: this.instanceId,
            err: error instanceof Error ? error.message : String(error),
          },
          'Variance planner leader acquisition attempt failed (will retry)'
        );
      }
      return false;
    }
  }

  /**
   * Releases the lease held by this instance on graceful shutdown. Sets
   * lease_expires_at = now() so followers can take over immediately on the next
   * planner tick. Safe to call when not leader — the WHERE clause is a no-op.
   *
   * See CONTEXT.md specifics § "Graceful shutdown matters".
   */
  private async releaseLease(): Promise<void> {
    try {
      await withTimeout('variancePlannerLeader.release', () =>
        db.execute(sql`
          UPDATE variance_planner_leader
          SET
            lease_expires_at = NOW(),
            updated_at = NOW()
          WHERE id = ${LEADER_ROW_ID}
            AND instance_id = ${this.instanceId}
        `)
      );
      if (this.isLeader) {
        log.info(
          { event: 'alert.planner.leader.demoted', instanceId: this.instanceId, reason: 'stop' },
          'Variance planner leader released on stop()'
        );
      }
    } catch (error) {
      log.warn(
        {
          event: 'alert.planner.leader.demoted',
          instanceId: this.instanceId,
          reason: 'release_failed',
          err: error instanceof Error ? error.message : String(error),
        },
        'Variance planner leader release failed on stop() (lease will expire naturally)'
      );
    } finally {
      this.isLeader = false;
      this.leaseExpiresAt = null;
    }
  }

  /**
   * Periodic renewal heartbeat. Called by the leaderRenewalTimer. If the
   * instance is not currently leader, this doubles as a takeover attempt.
   * Serialized with leaderRenewalInFlight to prevent overlapping renewals
   * under event-loop stalls.
   */
  private async runLeaderRenewalCycle(): Promise<void> {
    if (!this.enabled || this.leaderRenewalInFlight) {
      return;
    }
    this.leaderRenewalInFlight = true;
    try {
      await this.tryAcquireOrRenewLease();
    } finally {
      this.leaderRenewalInFlight = false;
    }
  }
```

### Step 7 — Gate runPlannerCycle (lines 581-600)

Replace the existing `private async runPlannerCycle(): Promise<void>` method
with:

```typescript
  private async runPlannerCycle(): Promise<void> {
    if (!this.enabled || this.plannerInFlight) {
      return;
    }

    // D-04: planner loop is gated on leader status. Processor and recovery
    // continue to run on every instance regardless of leadership.
    const leader = await this.tryAcquireOrRenewLease();
    if (!leader) {
      log.debug(
        { event: 'alert.planner.skipped', reason: 'not_leader', instanceId: this.instanceId },
        'Variance planner cycle skipped — not leader'
      );
      return;
    }

    this.plannerInFlight = true;
    this.healthState.planner.lastStartedAt = new Date();

    try {
      await this.planScheduledEvaluations();
      this.healthState.planner.lastCompletedAt = new Date();
      this.healthState.planner.lastError = null;
    } catch (error) {
      this.healthState.planner.lastError =
        error instanceof Error ? error.message : 'Unknown planner error';
      log.error({ err: error }, 'Variance alert planner cycle failed');
    } finally {
      this.plannerInFlight = false;
    }
  }
```

Do NOT alter `runProcessorCycle` (lines 602-644), `recoverStaleProcessingJobs`
(416-462), or `runCalcRunCompletion` (255-320). These stay on every instance
(D-04).

### Step 8 — Extend start() to schedule the renewal timer (lines 174-216)

Inside `start()`, AFTER the `this.processorTimer = setInterval(...)` block and
AFTER `this.recoveryTimer = setInterval(...)` but BEFORE the two
`void this.runPlannerCycle(); void this.runProcessorCycle();` kick-starts
(current line ~210), add:

```typescript
const leaderRenewalMs = parsePositiveIntEnv(
  'VARIANCE_PLANNER_RENEWAL_MS',
  DEFAULT_VARIANCE_PLANNER_RENEWAL_MS
);
this.leaderRenewalTimer = setInterval(() => {
  void this.runLeaderRenewalCycle();
}, leaderRenewalMs);
```

Then extend the existing
`log.info({ plannerIntervalMs, processorIntervalMs, recoverySweepMs: RECOVERY_SWEEP_MS }, ...)`
call to include `leaderRenewalMs` and `instanceId` so the elected/demoted events
are correlatable with startup:

```typescript
log.info(
  {
    plannerIntervalMs,
    processorIntervalMs,
    recoverySweepMs: RECOVERY_SWEEP_MS,
    leaderRenewalMs,
    instanceId: this.instanceId,
  },
  'Variance alert automation started'
);
```

### Step 9 — Extend stop() to clear the renewal timer and release the lease (lines 218-233)

Inside `stop()`, AFTER `this.enabled = false;` and BEFORE the existing three
`clearInterval` blocks, add:

```typescript
if (this.leaderRenewalTimer) {
  clearInterval(this.leaderRenewalTimer);
  this.leaderRenewalTimer = null;
}
```

Then AFTER the existing `recoveryTimer` clear block, at the very end of
`stop()`, add:

```typescript
await this.releaseLease();
```

The `releaseLease()` call MUST be the last statement so the UPDATE runs with
`this.enabled = false` already set — prevents a race where the renewal timer
fires during shutdown.

### Step 10 — Extend getHealth() (lines 235-253)

Extend the existing `planner` block return value:

```typescript
      planner: {
        running: this.plannerInFlight,
        lastStartedAt: toIsoOrNull(this.healthState.planner.lastStartedAt),
        lastCompletedAt: toIsoOrNull(this.healthState.planner.lastCompletedAt),
        lastError: this.healthState.planner.lastError,
        isLeader: this.isLeader,
        leaseExpiresAt: toIsoOrNull(this.leaseExpiresAt),
        lastElectedAt: toIsoOrNull(this.lastElectedAt),
      },
```

Do NOT alter the `processor` or `counters` blocks.

### Final verification steps

1. Run `npm run check` — must pass.
2. Run `grep -c "console\." server/services/variance-alert-automation.ts` — must
   return 0 (no console.\* allowed per ADR-019).
3. Run
   `grep -c "runProcessorCycle\|recoverStaleProcessingJobs\|runCalcRunCompletion" server/services/variance-alert-automation.ts`
   — must show those identifiers still exist (not accidentally deleted).
4. Verify `git diff server/services/variance-alert-automation.ts` shows NO
   changes inside the bodies of `runProcessorCycle`,
   `recoverStaleProcessingJobs`, `runCalcRunCompletion`,
   `planScheduledEvaluations`, `claimNextScheduledEvaluationJob`,
   `processScheduledEvaluationJob`, `markJobCompleted`, `markJobCancelled`,
   `handleJobFailure` — only additions and the `runPlannerCycle` rewrite are
   allowed.
5. Run `grep -c "log.info" server/services/variance-alert-automation.ts` and
   verify the `alert.planner.leader.renewed` event is logged via `log.info(...)`
   NOT `log.debug(...)` (M-3 fix — production pino streams typically filter to
   info and above). </action> <verify> <automated>npm run check && node -e
   "const fs = require('fs'); const src =
   fs.readFileSync('server/services/variance-alert-automation.ts', 'utf8');
   const checks =
   [['console.', false], ['variancePlannerLeader', true], ['tryAcquireOrRenewLease', true], ['releaseLease', true], ['runLeaderRenewalCycle', true], ['leaderRenewalTimer', true], ['VARIANCE_PLANNER_LEASE_MS', true], ['VARIANCE_PLANNER_RENEWAL_MS', true], ['alert.planner.leader.elected', true], ['alert.planner.leader.demoted', true], ['alert.planner.leader.renewed', true], ['isLeader', true], ['leaseExpiresAt', true], ['lastElectedAt', true], ['LEADER_ROW_ID', true], ['computeInstanceIdentity', true]];
   let failed = 0; for (const [needle, expectPresent] of checks) { const present
   = src.includes(needle); if (present !== expectPresent) {
   console.error('FAIL:', needle, 'expected', expectPresent, 'got', present);
   failed++; } } // M-3: the renewed event must be logged via log.info, not
   log.debug. Find the block that contains the 'alert.planner.leader.renewed'
   event string and confirm log.info is the nearest preceding log.* call. const
   renewedIdx = src.indexOf('alert.planner.leader.renewed'); if (renewedIdx ===
   -1) { console.error('FAIL: alert.planner.leader.renewed not found');
   failed++; } else { const head = src.slice(Math.max(0, renewedIdx - 400),
   renewedIdx); const lastInfo = head.lastIndexOf('log.info'); const lastDebug =
   head.lastIndexOf('log.debug'); if (lastInfo === -1 || lastInfo < lastDebug) {
   console.error('FAIL: alert.planner.leader.renewed must be logged via
   log.info, not log.debug'); failed++; } } process.exit(failed === 0 ? 0 :
   1);"</automated> </verify> <acceptance_criteria> - `npm run check` exits 0 -
   `grep -c "console\." server/services/variance-alert-automation.ts` returns
   `0` - `grep -c "import.*variancePlannerLeader"
   server/services/variance-alert-automation.ts`returns`1`(added to the`@shared/schema`import)     -`grep
   -c "tryAcquireOrRenewLease"
   server/services/variance-alert-automation.ts`returns at least`3`(definition + called from runPlannerCycle + called from runLeaderRenewalCycle)     -`grep
   -c "releaseLease"
   server/services/variance-alert-automation.ts`returns at least`2`(definition + called from stop)     -`grep
   -c "runLeaderRenewalCycle"
   server/services/variance-alert-automation.ts`returns at least`2`(definition + setInterval call in start)     -`grep
   -c "leaderRenewalTimer"
   server/services/variance-alert-automation.ts`returns at least`3`(field + setInterval + clearInterval)     -`grep
   -c "VARIANCE_PLANNER_LEASE_MS"
   server/services/variance-alert-automation.ts`returns`1`    -`grep -c
   "VARIANCE_PLANNER_RENEWAL_MS"
   server/services/variance-alert-automation.ts`returns`1`    -`grep -c
   "alert.planner.leader.elected"
   server/services/variance-alert-automation.ts`returns`1`    -`grep -c
   "alert.planner.leader.demoted"
   server/services/variance-alert-automation.ts`returns at least`2`(takeover_lost + db_error paths; or more if stop emits it)     -`grep
   -c "alert.planner.leader.renewed"
   server/services/variance-alert-automation.ts`returns`1`    - The`alert.planner.leader.renewed`event is logged via`log.info(...)`NOT`log.debug(...)`— verified by the node-eval block in`<verify>`which locates the renewed event string and checks the nearest preceding`log.\*`call     -`grep
   -c "isLeader:"
   server/services/variance-alert-automation.ts`returns at least`2`(type + getHealth return)     -`grep
   -c "LEADER_ROW_ID"
   server/services/variance-alert-automation.ts`returns at least`3`(const + acquire SQL + release SQL)     -`grep
   -c "computeInstanceIdentity"
   server/services/variance-alert-automation.ts`returns`2`(definition + call site)     -`grep
   -cE "(runProcessorCycle|recoverStaleProcessingJobs|runCalcRunCompletion)"
   server/services/variance-alert-automation.ts`returns at least`4`(identifiers still exist)     -`git
   diff
   server/services/variance-alert-automation.ts`shows the bodies of`runProcessorCycle`, `recoverStaleProcessingJobs`, `runCalcRunCompletion`, `planScheduledEvaluations`, `claimNextScheduledEvaluationJob`, `processScheduledEvaluationJob`, `markJobCompleted`, `markJobCancelled`, `handleJobFailure`as unchanged     - The exported singleton on line ~710`export
   const varianceAlertAutomationService = new
   VarianceAlertAutomationService()`is unchanged     - No new npm dependencies added to`package.json`  </acceptance_criteria>   <done>The service file has a working lease manager, gated planner cycle, renewal timer, extended getHealth, release-on-stop, and all three Pino log events.`npm
   run check` is green and no untouched method bodies were modified.</done>
   </task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary                | Description                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| process → database      | All lease operations cross this boundary via a pooled Drizzle connection.                           |
| instance A ↔ instance B | Two or more Node processes racing for the same lease row. The DB row is the coordination primitive. |
| env vars → lease window | `VARIANCE_PLANNER_LEASE_MS` and `VARIANCE_PLANNER_RENEWAL_MS` come from `process.env`.              |

## STRIDE Threat Register

| Threat ID | Category                                                          | Component                            | Disposition | Mitigation Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------- | ------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-02-01   | Spoofing / split-brain (dual leader)                              | `tryAcquireOrRenewLease` SQL         | mitigate    | Takeover uses a single `INSERT ... ON CONFLICT DO UPDATE ... WHERE lease_expires_at < now() OR instance_id = $me` — atomic, no read-modify-write window. The `WHERE` clause on the UPDATE ensures a live lease held by a different instance cannot be overwritten. The `RETURNING` clause lets the caller verify the row ends up owned by `$me`; if not, the function returns false. The index `idx_variance_planner_leader_lease_expires` supports the predicate. |
| T-02-02   | Denial of Service (stuck leader after graceful shutdown)          | `stop()`                             | mitigate    | `stop()` explicitly calls `releaseLease()` which sets `lease_expires_at = now()` for the current instance. Without this, every deploy creates a ~10-minute window where no instance holds the lease and planning stalls.                                                                                                                                                                                                                                           |
| T-02-03   | Denial of Service (DB unavailable during renewal)                 | `tryAcquireOrRenewLease` catch block | mitigate    | Any DB error OR timeout demotes the current instance (fail-safe). `runPlannerCycle` will skip until a subsequent renewal succeeds. Favors false-negatives over split-brain. `withTimeout` wraps the DB call so a hung connection cannot stall indefinitely.                                                                                                                                                                                                        |
| T-02-04   | Tampering (instance identity collision)                           | `computeInstanceIdentity`            | mitigate    | Uses `${hostname}:${pid}:${random6}` where `random6` is 6 base36 chars (~2 billion possibilities). Survives fast PID reuse across restarts.                                                                                                                                                                                                                                                                                                                        |
| T-02-05   | Tampering (env var misconfiguration — lease set to 0 or negative) | `parsePositiveIntEnv`                | mitigate    | Existing `parsePositiveIntEnv` helper clamps to positive integers and falls back to the default if parsing fails. Confirmed by reading lines 54-62 of the existing file.                                                                                                                                                                                                                                                                                           |
| T-02-06   | Information Disclosure (lease metadata)                           | `getHealth()` planner block          | accept      | `isLeader`, `leaseExpiresAt`, `lastElectedAt` are internal operational metadata. No PII, no secrets. Surfaced via the same `/api/health` endpoint that already exposes planner/processor state.                                                                                                                                                                                                                                                                    |
| T-02-07   | Observability — invisible renewal transitions                     | log level of the `renewed` event     | mitigate    | The `alert.planner.leader.renewed` event is emitted at `log.info` (NOT `log.debug`). Phase 1 success criterion 1 requires leader state be observable via logs, and most production pino streams filter to info and above — debug-level renewal logs would be silently dropped.                                                                                                                                                                                     |

</threat_model>

<verification>
- `npm run check` passes
- No `console.*` calls added
- `runProcessorCycle`, `recoverStaleProcessingJobs`, `runCalcRunCompletion` unchanged (git diff verification)
- Exported singleton on the last line unchanged
- `server/routes.ts:13` unchanged (not in files_modified — verify with `git status`)
- `server/lib/locks.ts` unchanged (not in files_modified — verify with `git status`)
- `alert.planner.leader.renewed` is logged at `log.info` level (M-3)
</verification>

<success_criteria>

- Lease manager methods (`tryAcquireOrRenewLease`, `releaseLease`,
  `runLeaderRenewalCycle`) exist on the class
- `runPlannerCycle` calls `tryAcquireOrRenewLease` before
  `planScheduledEvaluations` and returns early when not leader
- `start()` schedules `leaderRenewalTimer` at `VARIANCE_PLANNER_RENEWAL_MS`
  (default 150_000)
- `stop()` clears `leaderRenewalTimer` and calls `releaseLease()` as the last
  statement
- `getHealth().planner` includes `isLeader`, `leaseExpiresAt`, `lastElectedAt`
- All three Pino events (`elected`, `demoted`, `renewed`) are present and use
  the existing `log` child logger
- The `renewed` event is emitted at `log.info` level so it is visible in
  production pino streams
- Instance identity computed once at construction (not per-call)
- `npm run check` green
- Unchanged method bodies verified via git diff </success_criteria>

<output>
After completion, create `.planning/phases/01-variance-automation-1c3-followons/01-02-SUMMARY.md` documenting:
- The exact shape of `tryAcquireOrRenewLease` / `releaseLease` / `runLeaderRenewalCycle` signatures
- Instance identity format chosen and why
- Default lease/renewal values and env var names
- Log event catalog (including levels — elected: info, demoted: info/warn, renewed: info)
- Explicit confirmation that processor/recovery/calc-run paths are untouched
</output>
</content>
</invoke>
