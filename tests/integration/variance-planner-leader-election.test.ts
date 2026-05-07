/**
 * Integration test: VarianceAlertAutomationService leader election.
 *
 * Proves the crash-takeover scenario from Phase 1 success criterion 2 against
 * a real Postgres database (no mocks). Uses two in-process instances to avoid
 * the REFL-024 child-process cascade failure mode.
 *
 * Real-DB wiring (Rule 3 deviation from plan spec):
 *   The repo's default `server/db` import resolves to the mock database when
 *   `NODE_ENV=test` (see `server/storage-runtime-policy.ts` →
 *   `isTestMockDatabaseMode`). The plan as written assumed a direct
 *   `import { db } from '../../server/db'` would hit the live Postgres, but it
 *   does not under the integration runner. We follow the canonical pattern
 *   from `tests/integration/phase0-migrated-postgres.test.ts`:
 *     1. Build a real pg.Pool + drizzle instance against process.env.DATABASE_URL
 *     2. `vi.doMock('../../server/db', () => ({ db: realDb, pool: realPool }))`
 *     3. Dynamically import VarianceAlertAutomationService AFTER the doMock
 *
 *   This keeps the test fully in-process (no child_process / REFL-024) while
 *   still exercising real SQL against the real `variance_planner_leader` table.
 *
 * Preconditions:
 * - DATABASE_URL must point to a Postgres with the variance_planner_leader
 *   table (Plan 01-01's migration must have run).
 * - NODE_ENV=test is set by tests/integration/global-setup.ts.
 *
 * Run standalone:
 *   npx vitest run -c vitest.config.int.ts \
 *     tests/integration/variance-planner-leader-election.test.ts
 *
 * Do NOT invoke via `npm test` -- the root vitest.config.ts excludes
 * tests/integration/** and would silently report 0 tests found.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { combinedSchema, type CombinedSchema } from '../../server/db-schema';

type LeaseManagerHarness = {
  instanceId: string;
  tryAcquireOrRenewLease(now?: Date): Promise<boolean>;
  releaseLease(): Promise<void>;
  isLeader: boolean;
};

// Forward-declared by beforeAll. The dynamic import below has to happen after
// vi.doMock so the service picks up the real-DB module instead of the mock.
let VarianceAlertAutomationService: typeof import('../../server/services/variance-alert-automation').VarianceAlertAutomationService;
let realPool: Pool;
let realDb: NodePgDatabase<CombinedSchema>;
let originalUseRealDbInVitest: string | undefined;
let originalDatabaseUrl: string | undefined;
let originalNeonDatabaseUrl: string | undefined;

function asHarness(
  service: InstanceType<typeof VarianceAlertAutomationService>
): LeaseManagerHarness {
  return service as unknown as LeaseManagerHarness;
}

async function cleanLeaderRow(): Promise<void> {
  await realDb.execute(sql`DELETE FROM variance_planner_leader WHERE id = 'variance-planner'`);
}

async function ensureLeaderSchema(): Promise<void> {
  await realDb.execute(sql`
    CREATE TABLE IF NOT EXISTS variance_planner_leader (
      id                VARCHAR(64) PRIMARY KEY,
      instance_id       VARCHAR(255) NOT NULL,
      acquired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_expires_at  TIMESTAMPTZ NOT NULL,
      last_renewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await realDb.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_variance_planner_leader_lease_expires
      ON variance_planner_leader (lease_expires_at)
  `);
}

async function readLeaderRow(): Promise<{
  instance_id: string;
  acquired_at: Date;
  lease_expires_at: Date;
} | null> {
  const result = await realDb.execute(sql`
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
  const runningServices: InstanceType<typeof VarianceAlertAutomationService>[] = [];

  beforeAll(async () => {
    originalUseRealDbInVitest = process.env.USE_REAL_DB_IN_VITEST;
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalNeonDatabaseUrl = process.env.NEON_DATABASE_URL;

    // Worker-process env hydration: vitest workers do NOT auto-load .env files,
    // and tests/integration/global-setup.ts assigns DATABASE_URL with an
    // `env.DATABASE_URL || 'postgresql://...localhost.../povc_test'` fallback.
    // dotenv is loaded via a dynamic import to avoid the project's
    // eslint-auto-fix hook stripping it from the import block. Do not override
    // CI-provided DATABASE_URL; the unified CI integration lane provisions its
    // own local Postgres service.
    const dotenv = await import('dotenv');
    dotenv.config();

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL must be set for variance-planner-leader-election integration test'
      );
    }

    // Force the service-module load to use the real DB instead of the mock.
    process.env.USE_REAL_DB_IN_VITEST = '1';

    realPool = new Pool({ connectionString, max: 2 });
    realDb = drizzle(realPool, { schema: combinedSchema });

    vi.doMock('../../server/db', () => ({
      db: realDb,
      pool: realPool,
    }));

    // Dynamic import AFTER doMock so the service binds to realDb.
    vi.resetModules();
    const mod = await import('../../server/services/variance-alert-automation');
    VarianceAlertAutomationService = mod.VarianceAlertAutomationService;

    // Sanity probe: confirm the table exists and the connection is real.
    await ensureLeaderSchema();
    await realDb.execute(sql`SELECT 1 FROM variance_planner_leader LIMIT 1`);
  });

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
    try {
      await cleanLeaderRow();
    } finally {
      vi.doUnmock('../../server/db');
      if (realPool) {
        await realPool.end();
      }
      if (originalUseRealDbInVitest === undefined) {
        delete process.env.USE_REAL_DB_IN_VITEST;
      } else {
        process.env.USE_REAL_DB_IN_VITEST = originalUseRealDbInVitest;
      }
      if (originalDatabaseUrl === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
      if (originalNeonDatabaseUrl === undefined) {
        delete process.env.NEON_DATABASE_URL;
      } else {
        process.env.NEON_DATABASE_URL = originalNeonDatabaseUrl;
      }
      vi.resetModules();
    }
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

    expect(asHarness(serviceA).instanceId).not.toBe(asHarness(serviceB).instanceId);

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
    await realDb.execute(sql`
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
    // acquired_at should reset to the takeover time (>= A's original timestamp)
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
    // lease_expires_at = now() + 500ms -- the subsequent B-acquires assertion
    // below would still succeed because the lease would expire before B's
    // acquire call lands, hiding the bug. 100ms is tight enough to catch a
    // broken releaseLease that sets a non-trivial future expiry.
    expect(row!.lease_expires_at.getTime()).toBeLessThanOrEqual(Date.now() + 100);

    const bAcquired = await asHarness(serviceB).tryAcquireOrRenewLease();
    expect(bAcquired).toBe(true);

    const postRow = await readLeaderRow();
    expect(postRow!.instance_id).toBe(asHarness(serviceB).instanceId);
  });
});
