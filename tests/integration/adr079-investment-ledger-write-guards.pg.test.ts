import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createValuationHttpFixture } from '../helpers/valuation-mark-http-fixture';

const FUND_SCOPED_LEDGER_TABLES = [
  'financing_events',
  'financing_tranches',
  'vehicle_financing_participations',
  'position_events',
  'position_event_source_basis_reliefs',
  'position_event_lot_reliefs',
  'ownership_snapshots',
  'valuation_marks',
  'source_observations',
  'reconciliation_cases',
  'investments',
  'investment_rounds',
  'cash_flow_events',
] as const;

type Harness = Awaited<ReturnType<typeof createValuationHttpFixture>>;

let harness: Harness;
let fundId: number;
let eventId: number;
let userId: number;
let serviceToken: string;

async function ledgerProjection() {
  const projection: Record<string, unknown[]> = {};
  for (const table of FUND_SCOPED_LEDGER_TABLES) {
    projection[table] = (
      await harness.observer.query(
        `SELECT to_jsonb(source) AS value
           FROM ${table} AS source
          WHERE fund_id = $1
          ORDER BY to_jsonb(source)::text`,
        [fundId]
      )
    ).rows.map((row) => row.value);
  }
  projection.investment_lots = (
    await harness.observer.query(
      `SELECT to_jsonb(lot) AS value
         FROM investment_lots AS lot
         JOIN investments AS investment ON investment.id = lot.investment_id
        WHERE investment.fund_id = $1
        ORDER BY to_jsonb(lot)::text`,
      [fundId]
    )
  ).rows.map((row) => row.value);
  return projection;
}

describe('ADR-079 investment-ledger write guards with real PostgreSQL', () => {
  beforeAll(async () => {
    harness = await createValuationHttpFixture();
    const seed = await harness.seed();
    fundId = seed.fundId;
    userId = seed.userId;
    const partnerToken = harness.token(seed.userId, [fundId], 'partner');
    serviceToken = harness.token(seed.userId, [fundId], 'service');

    const identityId = Number(
      (
        await harness.observer.query(
          `INSERT INTO company_identities (fund_id, canonical_name, source_portfolio_company_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [fundId, `ADR-079 identity ${fundId}`, seed.companyId]
        )
      ).rows[0].id
    );
    const created = await request(harness.app)
      .post(`/api/funds/${fundId}/investment-ledger/financing-events`)
      .set('Authorization', `Bearer ${partnerToken}`)
      .set('Idempotency-Key', `adr079-positive-event-${fundId}`)
      .send({
        companyIdentityId: identityId,
        eventKey: `adr079-positive-${fundId}`,
        roundName: 'ADR-079 positive control',
        securityType: 'equity',
        eventDate: '2025-01-01',
        currency: 'USD',
        postMoneyValuation: '10000000.000000',
      });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    eventId = Number(created.body.id);

  }, 180_000);

  afterAll(async () => {
    await harness?.cleanup();
  }, 30_000);

  it('persists an allowed partner financing event with the signed actor', async () => {
    const persisted = await ledgerProjection();
    expect(persisted.financing_events).toHaveLength(1);
    expect(persisted.valuation_marks).toHaveLength(1);
    expect(
      (
        await harness.observer.query(
          'SELECT created_by FROM financing_events WHERE id = $1 AND fund_id = $2',
          [eventId, fundId]
        )
      ).rows
    ).toEqual([{ created_by: userId }]);
  });

  it.each([
    ['create financing event', () => `/api/funds/${fundId}/investment-ledger/financing-events`],
    [
      'record financing tranche',
      () => `/api/funds/${fundId}/investment-ledger/financing-events/${eventId}/tranches`,
    ],
    [
      'correct financing tranche',
      () => `/api/funds/${fundId}/investment-ledger/tranches/1/corrections`,
    ],
    [
      'record vehicle participation',
      () => `/api/funds/${fundId}/investment-ledger/tranches/1/participations`,
    ],
    [
      'correct participation ledger',
      () => `/api/funds/${fundId}/investment-ledger/tranches/1/ledger-corrections`,
    ],
    ['record position event', () => `/api/funds/${fundId}/investment-ledger/position-events`],
    [
      'record ownership snapshot',
      () => `/api/funds/${fundId}/investment-ledger/ownership-snapshots`,
    ],
    [
      'record direct position valuation',
      () => `/api/funds/${fundId}/investment-ledger/position-valuations`,
    ],
    [
      'convert position',
      () => `/api/funds/${fundId}/investment-ledger/position-conversions`,
    ],
    [
      'correct position',
      () => `/api/funds/${fundId}/investment-ledger/position-corrections`,
    ],
  ] as const)('denies signed service role for %s with zero mutation', async (_name, path) => {
    const before = await ledgerProjection();
    const response = await request(harness.app)
      .post(path())
      .set('Authorization', `Bearer ${serviceToken}`)
      .set('Idempotency-Key', `adr079-denied-${_name.replaceAll(' ', '-')}`)
      .send({});

    expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
    expect.soft(response.body).toMatchObject({
      error: 'Forbidden',
      code: 'WRITE_ROLE_REQUIRED',
    });
    expect.soft(await ledgerProjection()).toEqual(before);
  });

  it.each([
    [
      'LP-linked partner',
      () => harness.token(userId, [fundId], 'partner', 99),
      'TEAM_WRITE_REQUIRED',
    ],
    [
      'wrong-fund partner',
      () => harness.token(userId, [fundId + 10_000], 'partner'),
      'FUND_ACCESS_DENIED',
    ],
  ] as const)('denies %s with the canonical envelope and zero mutation', async (_name, token, code) => {
    const before = await ledgerProjection();
    const response = await request(harness.app)
      .post(`/api/funds/${fundId}/investment-ledger/financing-events`)
      .set('Authorization', `Bearer ${token()}`)
      .set('Idempotency-Key', `adr079-denied-${_name.replaceAll(' ', '-')}`)
      .send({});

    expect.soft(response.status, JSON.stringify(response.body)).toBe(403);
    expect.soft(response.body).toMatchObject({ error: 'Forbidden', code });
    expect.soft(await ledgerProjection()).toEqual(before);
  });
});
