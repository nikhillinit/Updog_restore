import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';

let pool: Pool;
let makeApp: typeof import('../../server/app').makeApp;
let app: Express;
let authHeader: string;
let testFundId: number;

describe('cash-flow-events persistence integration', () => {
  beforeAll(async () => {
    pool = (await import('../../server/db/pg-circuit')).pool;
    makeApp = (await import('../../server/app')).makeApp;
  });

  beforeEach(async () => {
    app = makeApp();
    const { signToken } = await import('../../server/lib/auth/jwt');
    authHeader = `Bearer ${signToken({
      sub: 'cash-flow-events-integration-user',
      email: 'cash-flow-events-integration@example.com',
      role: 'admin',
      fundIds: [],
    })}`;

    const fundResult = await pool.query(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Cash Flow Events Fund', '100000000', '0.02', '0.20', 2026]
    );
    testFundId = fundResult.rows[0].id as number;
  });

  afterEach(async () => {
    if (!testFundId) return;
    await pool.query('DELETE FROM cash_flow_events WHERE fund_id = $1', [testFundId]);
    await pool.query('DELETE FROM funds WHERE id = $1', [testFundId]);
  });

  it('persists a created event and reloads it fund-scoped, newest-first', async () => {
    const createResponse = await request(app)
      .post(`/api/funds/${testFundId}/cash-flow-events`)
      .set('Authorization', authHeader)
      .send({
        eventType: 'lp_capital_call',
        fundId: testFundId,
        amount: '1250000',
        eventDate: '2026-06-15T00:00:00.000Z',
        perspective: 'lp_net',
        payload: { callNumber: 1, dueDate: '2026-07-15' },
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      fundId: testFundId,
      eventType: 'lp_capital_call',
      status: 'draft',
      currency: 'USD',
    });
    expect(typeof createResponse.body.amount).toBe('string');
    const createdId = createResponse.body.id as number;

    // Persisted row exists in the table, fund-scoped.
    const dbRows = await pool.query('SELECT id, status FROM cash_flow_events WHERE fund_id = $1', [
      testFundId,
    ]);
    expect(dbRows.rows).toHaveLength(1);
    expect(dbRows.rows[0]).toMatchObject({ id: createdId, status: 'draft' });

    // Reload via the route.
    const listResponse = await request(app)
      .get(`/api/funds/${testFundId}/cash-flow-events`)
      .set('Authorization', authHeader)
      .expect(200);

    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0]).toMatchObject({ id: createdId, fundId: testFundId });
  });

  it('edits a draft via PATCH with If-Match and rejects a stale token (xmin)', async () => {
    const created = await request(app)
      .post(`/api/funds/${testFundId}/cash-flow-events`)
      .set('Authorization', authHeader)
      .send({
        eventType: 'lp_capital_call',
        fundId: testFundId,
        amount: '1000000',
        eventDate: '2026-06-15T00:00:00.000Z',
        perspective: 'lp_net',
        payload: { callNumber: 1 },
      })
      .expect(201);
    const id = created.body.id as number;
    const etag1 = created.body.etag as string;
    expect(typeof etag1).toBe('string');

    const ok = await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${id}`)
      .set('Authorization', authHeader)
      .set('If-Match', etag1)
      .send({ amount: '2000000', description: 'updated', payload: { dueDate: '2026-08-01' } })
      .expect(200);
    expect(ok.body.amount).toBe('2000000.000000');
    expect(ok.body.description).toBe('updated');
    expect(ok.body.payload.dueDate).toBe('2026-08-01');
    expect(ok.body.payload.callNumber).toBe(1); // preserved
    expect(ok.body.etag).not.toBe(etag1); // xmin advanced

    // AC#12: immediate reuse of the now-stale first token -> 412, no mutation.
    await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${id}`)
      .set('Authorization', authHeader)
      .set('If-Match', etag1)
      .send({ amount: '3000000' })
      .expect(412);

    // 409: a non-draft row is not editable.
    await pool.query(`UPDATE cash_flow_events SET status = 'approved' WHERE id = $1`, [id]);
    await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${id}`)
      .set('Authorization', authHeader)
      .set('If-Match', ok.body.etag)
      .send({ amount: '4000000' })
      .expect(409);
  });
});
