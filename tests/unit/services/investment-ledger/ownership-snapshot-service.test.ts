import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  createOwnershipSnapshot,
  listOwnershipSnapshots,
} from '../../../../server/services/investment-ledger/ownership-snapshot-service';

const dialect = new PgDialect();

interface Model {
  observations: Array<Record<string, unknown>>;
  snapshots: Array<Record<string, unknown>>;
  nextId: number;
}

function makeDb(model: Model) {
  const database = {
    execute: async (query: unknown): Promise<{ rows: Array<Record<string, unknown>> }> => {
      const rendered = dialect.sqlToQuery(query as never);
      const flat = rendered.sql.replace(/\s+/g, ' ').trim();
      const lower = flat.toLowerCase();
      if (lower.includes('from source_observations')) {
        const [sourceObservationId, fundId, companyIdentityId] = rendered.params as [
          number,
          number,
          number,
        ];
        return {
          rows: model.observations.filter(
            (row) =>
              row['id'] === sourceObservationId &&
              row['fund_id'] === fundId &&
              row['company_identity_id'] === companyIdentityId &&
              row['domain'] === 'ownership' &&
              row['status'] === 'accepted' &&
              String(row['effective_date']) <= String(rendered.params[3])
          ),
        };
      }
      if (lower.includes('ownership_snapshots') && lower.includes('and idempotency_key =')) {
        const [fundId, idempotencyKey] = rendered.params as [number, string];
        return {
          rows: model.snapshots.filter(
            (row) => row['fund_id'] === fundId && row['idempotency_key'] === idempotencyKey
          ),
        };
      }
      if (lower.startsWith('insert into ownership_snapshots')) {
        const row = {
          id: model.nextId++,
          fund_id: rendered.params[0],
          vehicle_id: rendered.params[1],
          company_identity_id: rendered.params[2],
          effective_date: rendered.params[3],
          ownership_pct: rendered.params[4],
          fd_numerator: rendered.params[5],
          fd_denominator: rendered.params[6],
          currency: 'USD',
          supersedes_snapshot_id: rendered.params[7],
          source_observation_id: rendered.params[8],
          created_by: rendered.params[9],
          idempotency_key: rendered.params[10],
          request_hash: rendered.params[11],
          recorded_at: new Date('2026-07-02T00:00:00.000Z'),
        };
        if (
          model.snapshots.some(
            (snapshot) =>
              snapshot['fund_id'] === row.fund_id &&
              snapshot['idempotency_key'] === row.idempotency_key
          )
        ) {
          return { rows: [] };
        }
        model.snapshots.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (
        lower.includes('from ownership_snapshots') &&
        (lower.includes('where id =') || lower.includes('and id =')) &&
        !lower.includes('idempotency_key')
      ) {
        const idFirst = lower.includes('where id =');
        const [id, fundId, vehicleId, companyIdentityId] = idFirst
          ? rendered.params
          : [
              rendered.params[1],
              rendered.params[0],
              rendered.params[2],
              rendered.params[3],
            ];
        return {
          rows: model.snapshots.filter(
            (row) =>
              row['id'] === id &&
              row['fund_id'] === fundId &&
              (vehicleId === undefined || row['vehicle_id'] === vehicleId) &&
              (companyIdentityId === undefined ||
                row['company_identity_id'] === companyIdentityId)
          ),
        };
      }
      if (lower.includes('with terminal_ownership as')) {
        const asOfDate = String(rendered.params[0]);
        const knowledgeCutoff = rendered.params[1] as Date;
        const fundId = rendered.params[2];
        let scopeIndex = 5;
        const vehicleId = lower.includes('and snapshot.vehicle_id =')
          ? rendered.params[scopeIndex++]
          : undefined;
        const companyIdentityId = lower.includes('and snapshot.company_identity_id =')
          ? rendered.params[scopeIndex]
          : undefined;
        const eligible = model.snapshots.filter(
          (row) =>
            row['fund_id'] === fundId &&
            String(row['effective_date']) <= asOfDate &&
            row['recorded_at'] instanceof Date &&
            row['recorded_at'] <= knowledgeCutoff &&
            (vehicleId === undefined || row['vehicle_id'] === vehicleId) &&
            (companyIdentityId === undefined ||
              row['company_identity_id'] === companyIdentityId)
        );
        const superseded = new Set(
          eligible
            .map((row) => row['supersedes_snapshot_id'])
            .filter((value): value is number => typeof value === 'number')
        );
        const latestByScope = new Map<string, Record<string, unknown>>();
        for (const row of eligible.filter((candidate) => !superseded.has(candidate['id'] as number))) {
          const key = `${String(row['fund_id'])}:${String(row['vehicle_id'])}:${String(
            row['company_identity_id']
          )}`;
          const current = latestByScope.get(key);
          if (
            !current ||
            String(row['effective_date']) > String(current['effective_date']) ||
            (String(row['effective_date']) === String(current['effective_date']) &&
              (row['recorded_at'] as Date) > (current['recorded_at'] as Date))
          ) {
            latestByScope.set(key, row);
          }
        }
        return {
          rows: [...latestByScope.values()],
        };
      }
      return { rows: [] };
    },
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
      callback(database),
  };
  return database as never;
}

function model(): Model {
  return {
    observations: [
      {
        id: 501,
        fund_id: 7,
        company_identity_id: 11,
        domain: 'ownership',
        status: 'accepted',
        effective_date: '2026-06-30',
      },
    ],
    snapshots: [],
    nextId: 800,
  };
}

const request = {
  vehicleId: 9,
  companyIdentityId: 11,
  effectiveDate: '2026-07-01',
  ownershipPct: '12.50000000',
  fdNumerator: '125.000000',
  fdDenominator: '1000.000000',
  sourceObservationId: 501,
};

describe('ownership snapshot service', () => {
  it('creates an append-only snapshot and replays the same payload', async () => {
    const fake = model();
    const database = makeDb(fake);

    const first = await createOwnershipSnapshot({
      fundId: 7,
      actorId: 3,
      idempotencyKey: 'ownership-1',
      request,
      database,
    });
    const replay = await createOwnershipSnapshot({
      fundId: 7,
      actorId: 3,
      idempotencyKey: 'ownership-1',
      request,
      database,
    });

    expect(first.replayed).toBe(false);
    expect(replay).toEqual({ ...first, replayed: true });
    expect(fake.snapshots).toHaveLength(1);
  });

  it('rejects changed payload replay with zero additional rows', async () => {
    const fake = model();
    const database = makeDb(fake);
    await createOwnershipSnapshot({
      fundId: 7,
      actorId: 3,
      idempotencyKey: 'ownership-1',
      request,
      database,
    });

    await expect(
      createOwnershipSnapshot({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'ownership-1',
        request: { ...request, ownershipPct: '13.00000000', fdNumerator: '130.000000' },
        database,
      })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
    expect(fake.snapshots).toHaveLength(1);
  });

  it('rejects unaccepted observations and cross-scope supersession before write', async () => {
    const fake = model();
    const database = makeDb(fake);
    fake.observations[0] = { ...fake.observations[0]!, status: 'staged' };

    await expect(
      createOwnershipSnapshot({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'ownership-staged',
        request,
        database,
      })
    ).rejects.toMatchObject({ status: 422, code: 'OWNERSHIP_OBSERVATION_NOT_ACCEPTED' });
    expect(fake.snapshots).toHaveLength(0);

    fake.observations[0] = { ...fake.observations[0]!, status: 'accepted' };
    fake.snapshots.push({
      id: 800,
      fund_id: 7,
      vehicle_id: 10,
      company_identity_id: 11,
      effective_date: '2026-06-01',
      recorded_at: new Date('2026-06-02T00:00:00.000Z'),
      ownership_pct: '10.00000000',
      fd_numerator: null,
      fd_denominator: null,
      currency: 'USD',
      supersedes_snapshot_id: null,
      source_observation_id: 501,
      created_by: 3,
      idempotency_key: 'other-vehicle',
      request_hash: 'a'.repeat(64),
    });

    await expect(
      createOwnershipSnapshot({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'ownership-cross-scope',
        request: { ...request, supersedesSnapshotId: 800 },
        database,
      })
    ).rejects.toMatchObject({ status: 409, code: 'OWNERSHIP_SUPERSEDE_SCOPE_MISMATCH' });
    expect(fake.snapshots).toHaveLength(1);
  });

  it('reads terminal ownership heads at both effective and recorded cutoffs', async () => {
    const fake = model();
    fake.snapshots.push(
      {
        id: 800,
        fund_id: 7,
        vehicle_id: 9,
        company_identity_id: 11,
        effective_date: '2026-06-01',
        recorded_at: new Date('2026-06-02T00:00:00.000Z'),
        ownership_pct: '10.00000000',
        fd_numerator: null,
        fd_denominator: null,
        currency: 'USD',
        supersedes_snapshot_id: null,
        source_observation_id: 501,
        created_by: 3,
        idempotency_key: 'old',
        request_hash: 'a'.repeat(64),
      },
      {
        id: 801,
        fund_id: 7,
        vehicle_id: 9,
        company_identity_id: 11,
        effective_date: '2026-07-01',
        recorded_at: new Date('2026-07-02T00:00:00.000Z'),
        ownership_pct: '12.50000000',
        fd_numerator: null,
        fd_denominator: null,
        currency: 'USD',
        supersedes_snapshot_id: 800,
        source_observation_id: 501,
        created_by: 3,
        idempotency_key: 'new',
        request_hash: 'b'.repeat(64),
      }
    );

    const beforeEffective = await listOwnershipSnapshots({
      fundId: 7,
      asOfDate: '2026-06-30',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });
    const beforeRecorded = await listOwnershipSnapshots({
      fundId: 7,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-01T00:00:00.000Z'),
      database: makeDb(fake),
    });
    const current = await listOwnershipSnapshots({
      fundId: 7,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(beforeEffective.snapshots.map((snapshot) => snapshot.id)).toEqual([800]);
    expect(beforeRecorded.snapshots.map((snapshot) => snapshot.id)).toEqual([800]);
    expect(current.snapshots.map((snapshot) => snapshot.id)).toEqual([801]);
  });
});
