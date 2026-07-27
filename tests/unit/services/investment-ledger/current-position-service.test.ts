import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { listCurrentPositions } from '../../../../server/services/investment-ledger/current-position-service';

const dialect = new PgDialect();

interface Statement {
  text: string;
  params: unknown[];
}

interface FakeDbModel {
  events: Array<Record<string, unknown>>;
  participationTerms: Array<Record<string, unknown>>;
  reliefs: Array<Record<string, unknown>>;
  statements: Statement[];
}

function makeDb(model: FakeDbModel) {
  return {
    execute: async (query: unknown): Promise<{ rows: Array<Record<string, unknown>> }> => {
      const rendered = dialect.sqlToQuery(query as never);
      model.statements.push({ text: rendered.sql, params: rendered.params });
      const flat = rendered.sql.replace(/\s+/g, ' ');
      if (flat.includes('FROM position_events')) {
        const [fundId, asOfDate, knowledgeCutoff] = rendered.params as [number, string, Date];
        let scopeIndex = 3;
        const vehicleId = flat.includes('AND vehicle_id =')
          ? (rendered.params[scopeIndex++] as number)
          : undefined;
        const companyIdentityId = flat.includes('AND company_identity_id =')
          ? (rendered.params[scopeIndex] as number)
          : undefined;
        return {
          rows: model.events.filter(
            (row) =>
              row['fund_id'] === fundId &&
              String(row['effective_date']) <= asOfDate &&
              row['recorded_at'] instanceof Date &&
              row['recorded_at'] <= knowledgeCutoff &&
              (vehicleId === undefined || row['vehicle_id'] === vehicleId) &&
              (companyIdentityId === undefined ||
                row['company_identity_id'] === companyIdentityId)
          ),
        };
      }
      if (flat.includes('FROM vehicle_financing_participations')) {
        return { rows: model.participationTerms };
      }
      if (flat.includes('FROM position_event_source_basis_reliefs')) {
        return { rows: model.reliefs };
      }
      return { rows: [] };
    },
  } as never;
}

function model(): FakeDbModel {
  return {
    events: [
      {
        id: 1,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 20,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-01-02T00:00:00.000Z'),
        shares_delta: '0.000000',
        cost_basis_delta: '100.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 100,
        resulting_participation_id: null,
      },
      {
        id: 2,
        fund_id: 7,
        vehicle_id: 11,
        company_identity_id: 20,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-01-02T00:00:00.000Z'),
        shares_delta: '25.000000',
        cost_basis_delta: '250.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 101,
        resulting_participation_id: null,
      },
      {
        id: 3,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 20,
        event_type: 'conversion',
        effective_date: '2026-02-01',
        recorded_at: new Date('2026-02-02T00:00:00.000Z'),
        shares_delta: '10.000000',
        cost_basis_delta: '0.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 100,
        resulting_participation_id: 102,
      },
      {
        id: 4,
        fund_id: 7,
        vehicle_id: 11,
        company_identity_id: 20,
        event_type: 'reversal',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-03-01T00:00:00.000Z'),
        shares_delta: '-25.000000',
        cost_basis_delta: '-250.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 101,
        resulting_participation_id: null,
      },
    ],
    participationTerms: [
      { id: 100, security_type: 'safe' },
      { id: 101, security_type: 'equity' },
      { id: 102, security_type: 'equity' },
    ],
    reliefs: [
      {
        conversion_position_event_id: 3,
        source_participation_id: 100,
        resulting_participation_id: 102,
        relieved_cost_basis: '100.000000',
      },
    ],
    statements: [],
  };
}

describe('listCurrentPositions', () => {
  it('keeps main-fund and SPV rows separate for the same company identity', async () => {
    const fake = model();

    const result = await listCurrentPositions({
      fundId: 7,
      query: { asOfDate: '2026-02-15' },
      knowledgeCutoff: new Date('2026-02-15T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result.positions).toHaveLength(2);
    expect(result.positions.map((position) => position.vehicleId)).toEqual([10, 11]);
  });

  it('moves no-lot conversion basis to the priced component without changing aggregate basis', async () => {
    const fake = model();

    const result = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 10, companyIdentityId: 20, asOfDate: '2026-02-15' },
      knowledgeCutoff: new Date('2026-02-15T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result.positions[0]).toMatchObject({
      shares: '10.000000',
      costBasis: '100.000000',
      components: [
        { kind: 'priced', shares: '10.000000', costBasis: '100.000000', participationIds: [102] },
      ],
    });
  });

  it('applies reversal only after recorded knowledge cutoff', async () => {
    const fake = model();

    const before = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 11, companyIdentityId: 20, asOfDate: '2026-03-15' },
      knowledgeCutoff: new Date('2026-02-15T00:00:00.000Z'),
      database: makeDb(fake),
    });
    const after = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 11, companyIdentityId: 20, asOfDate: '2026-03-15' },
      knowledgeCutoff: new Date('2026-03-15T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(before.positions[0]?.costBasis).toBe('250.000000');
    expect(after.positions[0]?.costBasis).toBe('0.000000');
  });

  it('folds acquisitions and realizations while excluding future-effective and future-recorded rows', async () => {
    const fake = model();
    fake.events.push(
      {
        id: 5,
        fund_id: 7,
        vehicle_id: 12,
        company_identity_id: 21,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-01-02T00:00:00.000Z'),
        shares_delta: '10.000000',
        cost_basis_delta: '100.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 103,
        resulting_participation_id: null,
      },
      {
        id: 6,
        fund_id: 7,
        vehicle_id: 12,
        company_identity_id: 21,
        event_type: 'realization',
        effective_date: '2026-02-01',
        recorded_at: new Date('2026-02-02T00:00:00.000Z'),
        shares_delta: '-4.000000',
        cost_basis_delta: '-40.000000',
        proceeds: '60.000000',
        vehicle_participation_id: 103,
        resulting_participation_id: null,
      },
      {
        id: 7,
        fund_id: 7,
        vehicle_id: 12,
        company_identity_id: 21,
        event_type: 'adjustment',
        effective_date: '2026-04-01',
        recorded_at: new Date('2026-02-03T00:00:00.000Z'),
        shares_delta: '0.000000',
        cost_basis_delta: '20.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 103,
        resulting_participation_id: null,
      },
      {
        id: 8,
        fund_id: 7,
        vehicle_id: 12,
        company_identity_id: 21,
        event_type: 'adjustment',
        effective_date: '2026-02-01',
        recorded_at: new Date('2026-04-01T00:00:00.000Z'),
        shares_delta: '0.000000',
        cost_basis_delta: '30.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 103,
        resulting_participation_id: null,
      }
    );
    fake.participationTerms.push({ id: 103, security_type: 'equity' });

    const result = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 12, companyIdentityId: 21, asOfDate: '2026-03-01' },
      knowledgeCutoff: new Date('2026-03-01T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]).toMatchObject({
      vehicleId: 12,
      companyIdentityId: 21,
      shares: '6.000000',
      costBasis: '60.000000',
      proceeds: '60.000000',
    });
  });

  it('folds reversal plus replacement only after the shared recorded cutoff', async () => {
    const fake = model();
    fake.events.push(
      {
        id: 9,
        fund_id: 7,
        vehicle_id: 13,
        company_identity_id: 22,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-01-02T00:00:00.000Z'),
        shares_delta: '10.000000',
        cost_basis_delta: '100.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 104,
        resulting_participation_id: null,
      },
      {
        id: 10,
        fund_id: 7,
        vehicle_id: 13,
        company_identity_id: 22,
        event_type: 'reversal',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-03-01T00:00:00.000Z'),
        shares_delta: '-10.000000',
        cost_basis_delta: '-100.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 104,
        resulting_participation_id: null,
      },
      {
        id: 11,
        fund_id: 7,
        vehicle_id: 13,
        company_identity_id: 22,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-03-01T00:00:00.000Z'),
        shares_delta: '12.000000',
        cost_basis_delta: '120.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 104,
        resulting_participation_id: null,
      }
    );
    fake.participationTerms.push({ id: 104, security_type: 'equity' });

    const before = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 13, companyIdentityId: 22, asOfDate: '2026-03-15' },
      knowledgeCutoff: new Date('2026-02-15T00:00:00.000Z'),
      database: makeDb(fake),
    });
    const after = await listCurrentPositions({
      fundId: 7,
      query: { vehicleId: 13, companyIdentityId: 22, asOfDate: '2026-03-15' },
      knowledgeCutoff: new Date('2026-03-15T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(before.positions[0]).toMatchObject({
      shares: '10.000000',
      costBasis: '100.000000',
    });
    expect(after.positions[0]).toMatchObject({
      shares: '12.000000',
      costBasis: '120.000000',
    });
  });
});
