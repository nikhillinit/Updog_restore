import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'pg';
import type { CashFlowEventResponse } from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import {
  buildLpCapitalCallPatch,
  formFromEvent,
  type CashEventEditForm,
} from '@/lib/cash-event-edit-model';

let pool: Pool;
let makeApp: typeof import('../../server/app').makeApp;
let app: Express;
let authHeader: string;
let testFundId: number;

describe('cash-flow-events client serializer loop (real Postgres)', () => {
  beforeAll(async () => {
    pool = (await import('../../server/db/pg-circuit')).pool;
    makeApp = (await import('../../server/app')).makeApp;
  });

  beforeEach(async () => {
    app = makeApp();
    const { signToken } = await import('../../server/lib/auth/jwt');
    authHeader = `Bearer ${signToken({
      sub: 'cash-flow-events-client-loop-user',
      email: 'cash-flow-events-client-loop@example.com',
      role: 'admin',
      fundIds: [],
    })}`;

    const fundResult = await pool.query(
      `INSERT INTO funds (name, size, management_fee, carry_percentage, vintage_year)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Cash Flow Events Client Loop Fund', '100000000', '0.02', '0.20', 2026]
    );
    testFundId = fundResult.rows[0].id as number;
  });

  afterEach(async () => {
    if (!testFundId) return;
    await pool.query('DELETE FROM cash_flow_events WHERE fund_id = $1', [testFundId]);
    await pool.query('DELETE FROM funds WHERE id = $1', [testFundId]);
  });

  it('applies a client-serialized draft edit end-to-end and enforces concurrency', async () => {
    // 1. Seed a draft with a non-midnight time + description + payload.
    const created = await request(app)
      .post(`/api/funds/${testFundId}/cash-flow-events`)
      .set('Authorization', authHeader)
      .send({
        eventType: 'lp_capital_call',
        fundId: testFundId,
        amount: '1000000',
        eventDate: '2026-06-15T14:30:00.000Z',
        perspective: 'lp_net',
        description: 'original note',
        payload: { callNumber: 1, purpose: 'seed' },
      })
      .expect(201);
    const eventId = created.body.id as number;

    // 2. Reload via the list endpoint to obtain the row exactly as the client sees it.
    const list = await request(app)
      .get(`/api/funds/${testFundId}/cash-flow-events`)
      .set('Authorization', authHeader)
      .expect(200);
    const row = (list.body.data as CashFlowEventResponse[]).find((event) => event.id === eventId);
    expect(row).toBeDefined();
    if (!row) throw new Error('seed row not found in list');
    const staleEtag = row.etag;

    // 3. Simulate a form edit, then serialize with the CLIENT's own builder.
    const edited: CashEventEditForm = {
      ...formFromEvent(row),
      amount: '2500000',
      description: '', // clear -> null
      eventDate: '2026-08-01', // date changes; original time must be preserved
      callNumber: '2', // change
      dueDate: '2026-09-30', // set a previously-empty payload key
      purpose: '', // clear -> null
    };
    const patch = buildLpCapitalCallPatch(row, edited);

    // The serializer emits only changed fields and preserves the original ISO time.
    expect(patch.eventDate).toBe('2026-08-01T14:30:00.000Z');
    expect(patch.description).toBeNull();
    expect(patch.payload).toMatchObject({ callNumber: 2, dueDate: '2026-09-30', purpose: null });
    expect(patch).not.toHaveProperty('fundId');

    // 4. PATCH with If-Match = the row's opaque etag.
    const ok = await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${eventId}`)
      .set('Authorization', authHeader)
      .set('If-Match', staleEtag)
      .send(patch)
      .expect(200);

    // 5. The real route + Postgres applied the client patch exactly.
    expect(ok.body.amount).toBe('2500000.000000');
    expect(ok.body.description).toBeNull();
    expect(ok.body.eventDate).toBe('2026-08-01T14:30:00.000Z'); // time component preserved
    expect(ok.body.payload.callNumber).toBe(2);
    expect(ok.body.payload.dueDate).toBe('2026-09-30');
    expect(ok.body.payload.purpose).toBeNull();
    expect(ok.body.etag).not.toBe(staleEtag); // xmin advanced

    // 6. Reusing the now-stale etag -> 412 (optimistic concurrency), no mutation.
    await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${eventId}`)
      .set('Authorization', authHeader)
      .set('If-Match', staleEtag)
      .send({ amount: '9999999' })
      .expect(412);

    // 7. A non-draft row is not editable -> 409.
    await pool.query(`UPDATE cash_flow_events SET status = 'approved' WHERE id = $1`, [eventId]);
    await request(app)
      .patch(`/api/funds/${testFundId}/cash-flow-events/${eventId}`)
      .set('Authorization', authHeader)
      .set('If-Match', ok.body.etag)
      .send({ amount: '8888888' })
      .expect(409);
  });
});
