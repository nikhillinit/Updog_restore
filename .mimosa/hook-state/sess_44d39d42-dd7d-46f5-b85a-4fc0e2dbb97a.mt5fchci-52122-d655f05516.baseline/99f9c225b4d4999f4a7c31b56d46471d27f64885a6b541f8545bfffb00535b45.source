import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  cleanupTestContainers,
  getPostgresConnectionString,
  setupTestContainers,
} from '../helpers/testcontainers';

const TEST_TIMEOUT_MS = 120_000;

let pool: Pool;
let startedTestContainers = false;
let transitionCapitalCallWithNotification: typeof import('../../server/services/capital-call-notification-outbox-service').transitionCapitalCallWithNotification;
let dispatchPendingCapitalCallNotifications: typeof import('../../server/services/capital-call-notification-outbox-service').dispatchPendingCapitalCallNotifications;

async function seedCapitalCall(): Promise<{ id: string; lpId: number }> {
  const fund = await pool.query<{ id: number }>(
    `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [`Outbox Fund ${randomUUID()}`, '1000000.00', '0.0200', '0.2000', 2026]
  );
  const fundId = fund.rows[0]!.id;
  const lp = await pool.query<{ id: number }>(
    `INSERT INTO limited_partners (name, email, entity_type)
     VALUES ($1, $2, 'individual') RETURNING id`,
    [`Outbox LP ${randomUUID()}`, `${randomUUID()}@example.test`]
  );
  const lpId = lp.rows[0]!.id;
  const commitment = await pool.query<{ id: number }>(
    `INSERT INTO lp_fund_commitments (
       lp_id, fund_id, commitment_amount_cents, commitment_date, status
     ) VALUES ($1, $2, 100000000, clock_timestamp(), 'active') RETURNING id`,
    [lpId, fundId]
  );
  const call = await pool.query<{ id: string }>(
    `INSERT INTO lp_capital_calls (
       lp_id, fund_id, commitment_id, call_number, call_amount_cents,
       due_date, call_date, status, wire_instructions, version
     ) VALUES ($1, $2, $3, 1, 2500000, CURRENT_DATE, CURRENT_DATE,
       'pending', $4::jsonb, 1) RETURNING id`,
    [
      lpId,
      fundId,
      commitment.rows[0]!.id,
      JSON.stringify({
        bankName: 'Test Bank',
        accountName: 'Test Fund',
        accountNumber: '****1234',
        routingNumber: '****5678',
        reference: 'outbox-test',
      }),
    ]
  );
  return { id: call.rows[0]!.id, lpId };
}

function notification(call: { id: string; lpId: number }, title = 'Capital call due') {
  return {
    capitalCallId: call.id,
    lpId: call.lpId,
    transitionKind: 'due' as const,
    dueDateBucket: new Date().toISOString().slice(0, 10),
    notificationType: 'capital_call',
    title,
    message: 'Durable outbox test notification',
    relatedEntityType: 'capital_call',
    relatedEntityId: call.id,
    actionUrl: `/lp/capital-calls/${call.id}`,
  };
}

describe('capital-call status transition and notification outbox', () => {
  beforeAll(async () => {
    process.env.CAPITAL_CALL_STATUS_HARD_TIMEOUT_MS = '30000';
    if (!process.env.TEST_DATABASE_URL) {
      await setupTestContainers();
      startedTestContainers = true;
    }
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? getPostgresConnectionString();
    // Under vitest server/db substitutes the database mock unless this flag
    // opts into the real driver (storage-runtime-policy).
    process.env.USE_REAL_DB_IN_VITEST = '1';
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // server/db binds its pool to DATABASE_URL at import time and the shared
    // module registry may already hold it -- reset so the service resolves a
    // fresh db against the container (repo gotcha: resetModules before
    // dynamic imports under isolate:false).
    vi.resetModules();
    ({ transitionCapitalCallWithNotification, dispatchPendingCapitalCallNotifications } =
      await import('../../server/services/capital-call-notification-outbox-service'));
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    const { closeDatabasePool } = await import('../../server/db');
    await closeDatabasePool();
    await pool?.end();
    if (startedTestContainers) await cleanupTestContainers();
  });

  it('rolls back the status transition when outbox persistence fails', async () => {
    const call = await seedCapitalCall();

    await expect(
      transitionCapitalCallWithNotification({
        callId: call.id,
        newStatus: 'due',
        currentVersion: 1n,
        notification: { ...notification(call), notificationType: 'x'.repeat(31) },
        hardTimeoutMs: 30_000,
      })
    ).rejects.toThrow();

    const state = await pool.query<{ status: string; version: string }>(
      `SELECT status, version::text FROM lp_capital_calls WHERE id = $1`,
      [call.id]
    );
    const outbox = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM capital_call_notification_outbox WHERE capital_call_id = $1`,
      [call.id]
    );
    expect(state.rows[0]).toEqual({ status: 'pending', version: '1' });
    expect(outbox.rows[0]?.count).toBe('0');
  });

  it('delivers committed outbox rows idempotently after a worker restart', async () => {
    const call = await seedCapitalCall();
    await expect(
      transitionCapitalCallWithNotification({
        callId: call.id,
        newStatus: 'due',
        currentVersion: 1n,
        notification: notification(call),
        hardTimeoutMs: 30_000,
      })
    ).resolves.toBe(true);

    await expect(
      transitionCapitalCallWithNotification({
        callId: call.id,
        newStatus: 'due',
        currentVersion: 1n,
        notification: notification(call),
        hardTimeoutMs: 30_000,
      })
    ).resolves.toBe(false);

    const firstDelivery = await dispatchPendingCapitalCallNotifications({ hardTimeoutMs: 30_000 });
    const secondDelivery = await dispatchPendingCapitalCallNotifications({ hardTimeoutMs: 30_000 });
    expect(firstDelivery.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(secondDelivery.deliveredCount).toBe(0);

    const rows = await pool.query<{ status: string; notification_count: string }>(
      `SELECT o.status, COUNT(n.id)::text AS notification_count
         FROM capital_call_notification_outbox o
         LEFT JOIN lp_notifications n ON n.id = o.id
        WHERE o.capital_call_id = $1
        GROUP BY o.status`,
      [call.id]
    );
    expect(rows.rows).toEqual([{ status: 'delivered', notification_count: '1' }]);
  });
});
