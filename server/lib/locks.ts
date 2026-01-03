/**
 * PostgreSQL Advisory Locks for Concurrency Control
 * Prevents race conditions at fund/org level
 */

import crypto from 'crypto';
import type { RLSRequest } from '../middleware/with-rls-transaction.js';
import type { Response, NextFunction } from 'express';

// Type declaration for global metrics (used for monitoring)
declare const global: typeof globalThis & {
  metrics?: {
    fundLockConflicts?: { inc: () => void };
  };
};

// PostgreSQL client interface
type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

/**
 * Generate a deterministic 64-bit integer from org and fund IDs
 */
export function generateLockKey(orgId: string, fundId: string): bigint {
  const combined = `${orgId}:${fundId}`;
  const hash = crypto.createHash('sha256').update(combined).digest('hex');
  // Take first 16 hex chars (64 bits) and convert to bigint
  return BigInt(`0x${  hash.substring(0, 16)}`);
}

/**
 * Acquire an advisory lock for a fund within a transaction
 * Lock is automatically released when transaction ends
 */
export async function withFundLock<T>(
  pgClient: PgClient,
  orgId: string,
  fundId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = generateLockKey(orgId, fundId);

  // Try to acquire lock with timeout
  const lockResult = await pgClient.query(
    'SELECT pg_try_advisory_xact_lock($1) as acquired',
    [lockKey.toString()]
  );

  if (!lockResult.rows[0]?.acquired) {
    // Lock not immediately available, wait with timeout
    try {
      await pgClient.query(
        'SELECT pg_advisory_xact_lock($1)',
        [lockKey.toString()]
      );
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '55P03') { // lock_timeout
        throw new Error(`Failed to acquire lock for fund ${fundId}: timeout`);
      }
      throw error;
    }
  }

  // Execute the function with lock held
  return fn();
}

/**
 * Try to acquire a lock without waiting
 * Returns true if lock acquired, false otherwise
 */
export async function tryFundLock(
  pgClient: PgClient,
  orgId: string,
  fundId: string
): Promise<boolean> {
  const lockKey = generateLockKey(orgId, fundId);

  const result = await pgClient.query(
    'SELECT pg_try_advisory_xact_lock($1) as acquired',
    [lockKey.toString()]
  );

  return result.rows[0]?.acquired as boolean;
}

/**
 * Middleware to automatically acquire fund lock for mutating operations
 */
export function requireFundLock() {
  return async (req: RLSRequest, res: Response, next: NextFunction) => {
    if (!req.context?.orgId || !req.context?.fundId) {
      return next();
    }

    if (!req.pgClient) {
      return res["status"](500)["json"]({
        error: 'internal_error',
        message: 'Database connection required for locking'
      });
    }

    try {
      const acquired = await tryFundLock(
        req.pgClient as PgClient,
        req.context.orgId,
        req.context.fundId
      );

      if (!acquired) {
        // Increment contention metric
        if (global.metrics?.fundLockConflicts) {
          global.metrics.fundLockConflicts.inc();
        }

        // Wait for lock with timeout
        const lockKey = generateLockKey(req.context.orgId, req.context.fundId);
        await (req.pgClient as PgClient).query(
          'SELECT pg_advisory_xact_lock($1)',
          [lockKey.toString()]
        );
      }

      next();
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '55P03') { // lock_timeout
        return res["status"](503)["json"]({
          error: 'lock_timeout',
          message: 'Could not acquire fund lock due to concurrent operation',
          retryAfter: 2
        });
      }
      next(error);
    }
  };
}

/**
 * Get current advisory locks for monitoring
 */
export async function getActiveLocks(pgClient: PgClient): Promise<Array<{
  lockKey: string;
  pid: number;
  granted: boolean;
  mode: string;
}>> {
  const result = await pgClient.query(`
    SELECT
      objid::text as lock_key,
      pid,
      granted,
      mode
    FROM pg_locks
    WHERE locktype = 'advisory'
    ORDER BY granted DESC, pid
  `);

  return result.rows.map((row) => ({
    lockKey: row.lock_key as string,
    pid: row.pid as number,
    granted: row.granted as boolean,
    mode: row.mode as string
  }));
}

/**
 * Check if a specific fund lock is held
 */
export async function isFundLocked(
  pgClient: PgClient,
  orgId: string,
  fundId: string
): Promise<boolean> {
  const lockKey = generateLockKey(orgId, fundId);

  const result = await pgClient.query(
    `SELECT EXISTS(
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory'
      AND objid = $1
      AND granted = true
    ) as is_locked`,
    [lockKey.toString()]
  );

  return result.rows[0]?.is_locked as boolean;
}

/**
 * Lock multiple funds atomically
 * Acquires locks in deterministic order to prevent deadlocks
 */
export async function withMultiFundLocks<T>(
  pgClient: PgClient,
  orgId: string,
  fundIds: string[],
  fn: () => Promise<T>
): Promise<T> {
  // Sort fund IDs to ensure consistent lock order
  const sortedFundIds = [...fundIds].sort();

  // Generate all lock keys
  const lockKeys = sortedFundIds.map(fundId =>
    generateLockKey(orgId, fundId)
  );

  // Try to acquire all locks
  for (const lockKey of lockKeys) {
    await pgClient.query(
      'SELECT pg_advisory_xact_lock($1)',
      [lockKey.toString()]
    );
  }

  // Execute function with all locks held
  return fn();
}

/**
 * Organization-level lock for org-wide operations
 */
export async function withOrgLock<T>(
  pgClient: PgClient,
  orgId: string,
  fn: () => Promise<T>
): Promise<T> {
  // Use a special fund ID for org-level locks
  return withFundLock(pgClient, orgId, '00000000-0000-0000-0000-000000000000', fn);
}

/**
 * Distributed lock with lease renewal for long-running operations
 */
export class DistributedLock {
  private lockKey: bigint;
  private leaseIntervalMs: number;
  private leaseTimer?: NodeJS.Timeout;

  constructor(
    private pgClient: PgClient,
    private orgId: string,
    private resourceId: string,
    private leaseDurationMs: number = 30000
  ) {
    this.lockKey = generateLockKey(orgId, resourceId);
    this.leaseIntervalMs = Math.floor(leaseDurationMs / 2);
  }

  async acquire(timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.pgClient.query(
        'SELECT pg_try_advisory_lock($1) as acquired',
        [this.lockKey.toString()]
      );

      if (result.rows[0]?.acquired) {
        // Start lease renewal
        this.startLeaseRenewal();
        return true;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  async release(): Promise<void> {
    this.stopLeaseRenewal();

    await this.pgClient.query(
      'SELECT pg_advisory_unlock($1)',
      [this.lockKey.toString()]
    );
  }

  private startLeaseRenewal(): void {
    this.leaseTimer = setInterval(async () => {
      try {
        // Verify we still hold the lock
        const result = await this.pgClient.query(
          'SELECT pg_try_advisory_lock($1) as acquired',
          [this.lockKey.toString()]
        );

        if (!result.rows[0]?.acquired) {
          // Lost the lock somehow
          this.stopLeaseRenewal();
          console.warn(`Lost distributed lock for ${this.resourceId}`);
        }
      } catch (error) {
        console.error('Failed to renew lock lease:', error);
        this.stopLeaseRenewal();
      }
    }, this.leaseIntervalMs);
  }

  private stopLeaseRenewal(): void {
    if (this.leaseTimer) {
      clearInterval(this.leaseTimer);
      delete this.leaseTimer;
    }
  }
}