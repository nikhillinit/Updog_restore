import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  backfillLegacyPositionEvents,
  LegacyPositionBackfillServiceError,
} from '../../../../server/services/investment-ledger/legacy-position-backfill-service';

const dialect = new PgDialect();

interface Statement {
  text: string;
  params: unknown[];
}

interface FakeModel {
  vehicles: Array<Record<string, unknown>>;
  investments: Array<Record<string, unknown>>;
  positionEvents: Array<Record<string, unknown>>;
  sourceObservations: Array<Record<string, unknown>>;
  nextObservationId: number;
  nextVehicleId: number;
  statements: Statement[];
  transactions: number;
  investmentReads: number;
  beforeInvestmentRead?: (model: FakeModel, readCount: number) => void;
}

function makeDb(model: FakeModel) {
  const database = {
    execute: async (query: unknown): Promise<{ rows: Array<Record<string, unknown>> }> =>
      executeFake(model, query),
    transaction: async <T>(callback: (transaction: typeof database) => Promise<T>): Promise<T> => {
      model.transactions += 1;
      const snapshot = {
        vehicles: model.vehicles.map((row) => ({ ...row })),
        investments: model.investments.map((row) => ({ ...row })),
        positionEvents: model.positionEvents.map((row) => ({ ...row })),
        sourceObservations: model.sourceObservations.map((row) => ({ ...row })),
        nextObservationId: model.nextObservationId,
        nextVehicleId: model.nextVehicleId,
        investmentReads: model.investmentReads,
      };
      try {
        return await callback(database);
      } catch (error) {
        model.vehicles = snapshot.vehicles;
        model.investments = snapshot.investments;
        model.positionEvents = snapshot.positionEvents;
        model.sourceObservations = snapshot.sourceObservations;
        model.nextObservationId = snapshot.nextObservationId;
        model.nextVehicleId = snapshot.nextVehicleId;
        model.investmentReads = snapshot.investmentReads;
        throw error;
      }
    },
  };
  return database as never;
}

async function executeFake(
  model: FakeModel,
  query: unknown
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const rendered = dialect.sqlToQuery(query as never);
  model.statements.push({ text: rendered.sql, params: rendered.params });
  const flat = rendered.sql.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase().trim();

  if (lower.startsWith('with scoped as') || lower.startsWith('with "scoped" as')) {
    return {
      rows: model.vehicles.map((vehicle) => ({
        id: vehicle['id'],
        fund_id: vehicle['fund_id'],
        vehicle_slug: vehicle['vehicle_slug'],
        vehicle_type: vehicle['vehicle_type'],
        main_count: model.vehicles.filter(
          (row) => row['fund_id'] === vehicle['fund_id'] && row['vehicle_type'] === 'main_fund'
        ).length,
      })),
    };
  }

  if (lower.includes('from investments i') || lower.includes('from "investments" i')) {
    model.investmentReads += 1;
    model.beforeInvestmentRead?.(model, model.investmentReads);
    return {
      rows: model.investments.map((investment) => {
        const existing = model.positionEvents.find(
          (event) => event['backfilled_from_investment_id'] === investment['investment_id']
        );
        const sourceObservation = model.sourceObservations.find(
          (observation) =>
            existing?.['source_observation_id'] !== null &&
            observation['id'] === existing?.['source_observation_id']
        );
        let corrected = existing;
        let correctedEventCount = 0;
        const seenCorrectionIds = new Set<number>();
        while (corrected && !seenCorrectionIds.has(Number(corrected['id']))) {
          seenCorrectionIds.add(Number(corrected['id']));
          const reversal = model.positionEvents.find(
            (event) =>
              event['fund_id'] === investment['fund_id'] &&
              event['reverses_position_event_id'] === corrected?.['id']
          );
          const successors = model.positionEvents.filter(
            (event) =>
              event['fund_id'] === investment['fund_id'] &&
              event['replaces_event_id'] === corrected?.['id'] &&
              event['event_type'] === corrected?.['event_type'] &&
              event['request_hash'] === reversal?.['request_hash'] &&
              event['source_observation_id'] === reversal?.['source_observation_id']
          );
          if (successors.length === 0) break;
          if (successors.length > 1) {
            correctedEventCount = successors.length;
            corrected = successors[0];
            break;
          }
          correctedEventCount = 1;
          corrected = successors[0];
        }
        if (correctedEventCount === 0) corrected = undefined;
        const overlapping = model.positionEvents.find(
          (event) =>
            event['backfilled_from_investment_id'] === null &&
            event['event_type'] === 'acquisition' &&
            event['fund_id'] === investment['fund_id'] &&
            ((investment['vehicle_participation_id'] !== null &&
              event['vehicle_participation_id'] === investment['vehicle_participation_id']) ||
              (investment['vehicle_participation_id'] === null &&
                event['vehicle_participation_id'] === null &&
                event['company_identity_id'] === investment['company_identity_id']))
        );
        return {
          ...investment,
          existing_event_id: existing?.['id'] ?? investment['existing_event_id'],
          existing_request_hash: existing?.['request_hash'] ?? investment['existing_request_hash'],
          existing_vehicle_id: existing?.['vehicle_id'] ?? investment['existing_vehicle_id'],
          existing_company_identity_id:
            existing?.['company_identity_id'] ?? investment['existing_company_identity_id'],
          existing_effective_date:
            existing?.['effective_date'] ?? investment['existing_effective_date'],
          existing_shares_delta: existing?.['shares_delta'] ?? investment['existing_shares_delta'],
          existing_cost_basis_delta:
            existing?.['cost_basis_delta'] ?? investment['existing_cost_basis_delta'],
          existing_vehicle_participation_id:
            existing?.['vehicle_participation_id'] ??
            investment['existing_vehicle_participation_id'],
          existing_source_observation_id:
            existing?.['source_observation_id'] ?? investment['existing_source_observation_id'],
          existing_source_observation_hash:
            sourceObservation?.['observation_hash'] ??
            investment['existing_source_observation_hash'],
          existing_source_observation_locator:
            sourceObservation?.['source_locator'] ??
            investment['existing_source_observation_locator'],
          corrected_event_count: correctedEventCount,
          corrected_event_id: corrected?.['id'] ?? null,
          corrected_vehicle_id: corrected?.['vehicle_id'] ?? null,
          corrected_company_identity_id: corrected?.['company_identity_id'] ?? null,
          corrected_effective_date: corrected?.['effective_date'] ?? null,
          corrected_shares_delta: corrected?.['shares_delta'] ?? null,
          corrected_cost_basis_delta: corrected?.['cost_basis_delta'] ?? null,
          corrected_vehicle_participation_id:
            corrected?.['vehicle_participation_id'] ?? null,
          overlapping_acquisition_id: overlapping?.['id'] ?? investment['overlapping_acquisition_id'],
        };
      }),
    };
  }

  if (
    (lower.includes('from vehicles') || lower.includes('from "vehicles"')) &&
    lower.includes('vehicle_slug')
  ) {
    const [fundId, slug] = rendered.params as [number, string];
    return {
      rows: model.vehicles.filter(
        (vehicle) => vehicle['fund_id'] === fundId && vehicle['vehicle_slug'] === slug
      ),
    };
  }

  if (lower.startsWith('insert into vehicles') || lower.startsWith('insert into "vehicles"')) {
    const [fundId, vehicleSlug, description] = rendered.params as [number, string, string];
    const row = {
      id: model.nextVehicleId++,
      fund_id: fundId,
      vehicle_slug: vehicleSlug,
      vehicle_type: 'main_fund',
      name: 'Legacy Main Fund',
      description,
      currency: 'USD',
      status: 'active',
    };
    model.vehicles.push(row);
    return { rows: [row] };
  }

  if (
    (lower.includes('from position_events') || lower.includes('from "position_events"')) &&
    lower.includes('backfilled_from_investment_id')
  ) {
    const [fundId, investmentId] = rendered.params as [number, number];
    return {
      rows: model.positionEvents
        .filter(
          (event) =>
            event['fund_id'] === fundId && event['backfilled_from_investment_id'] === investmentId
        )
        .map((event) => {
          const sourceObservation = model.sourceObservations.find(
            (observation) => observation['id'] === event['source_observation_id']
          );
          return {
            ...event,
            source_observation_hash: sourceObservation?.['observation_hash'],
            source_observation_locator: sourceObservation?.['source_locator'],
          };
        }),
    };
  }

  if (lower.includes('from source_observations') || lower.includes('from "source_observations"')) {
    const [fundId, observationHash] = rendered.params as [number, string];
    return {
      rows: model.sourceObservations.filter(
        (observation) =>
          observation['fund_id'] === fundId &&
          observation['observation_hash'] === observationHash &&
          observation['status'] === 'accepted'
      ),
    };
  }

  if (lower.startsWith('select nextval')) {
    return { rows: [{ id: model.nextObservationId++ }] };
  }

  if (
    lower.startsWith('insert into source_observations') ||
    lower.startsWith('insert into "source_observations"')
  ) {
    const [
      id,
      fundId,
      companyIdentityId,
      effectiveDate,
      normalizedPayload,
      observationHash,
      candidateFingerprint,
      sourceLocator,
      dependencyGroupKey,
    ] = rendered.params as [number, number, number, string, string, string, string, string, string];
    model.sourceObservations.push({
      id,
      fund_id: fundId,
      company_identity_id: companyIdentityId,
      effective_date: effectiveDate,
      normalized_payload: normalizedPayload,
      observation_hash: observationHash,
      candidate_fingerprint: candidateFingerprint,
      source_locator: sourceLocator,
      dependency_group_key: dependencyGroupKey,
      status: 'accepted',
    });
    return { rows: [] };
  }

  if (
    lower.startsWith('insert into position_events') ||
    lower.startsWith('insert into "position_events"')
  ) {
    const [
      fundId,
      vehicleId,
      companyIdentityId,
      effectiveDate,
      sharesDelta,
      costBasisDelta,
      vehicleParticipationId,
      observationId,
      investmentId,
      actorId,
      idempotencyKey,
      requestHash,
    ] = rendered.params as [
      number,
      number,
      number,
      string,
      string,
      string,
      number | null,
      number,
      number,
      number | null,
      string,
      string,
    ];
    const existing = model.positionEvents.find(
      (event) => event['backfilled_from_investment_id'] === investmentId
    );
    if (existing) return { rows: [] };
    const row = {
      id: model.positionEvents.length + 1,
      fund_id: fundId,
      vehicle_id: vehicleId,
      company_identity_id: companyIdentityId,
      event_type: 'acquisition',
      effective_date: effectiveDate,
      shares_delta: sharesDelta,
      cost_basis_delta: costBasisDelta,
      proceeds: '0.000000',
      vehicle_participation_id: vehicleParticipationId,
      source_observation_id: observationId,
      backfilled_from_investment_id: investmentId,
      created_by: actorId,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
    };
    model.positionEvents.push(row);
    return { rows: [{ id: row.id }] };
  }

  return { rows: [] };
}

function baseModel(overrides: Partial<FakeModel> = {}): FakeModel {
  return {
    vehicles: [
      { id: 10, fund_id: 7, vehicle_slug: 'main', vehicle_type: 'main_fund' },
    ],
    investments: [investmentRow()],
    positionEvents: [],
    sourceObservations: [],
    nextObservationId: 100,
    nextVehicleId: 50,
    statements: [],
    transactions: 0,
    investmentReads: 0,
    ...overrides,
  };
}

function investmentRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    investment_id: 800,
    fund_id: 7,
    company_id: 70,
    company_fund_id: 7,
    investment_date: new Date('2025-01-15T00:00:00.000Z'),
    amount: '1000.00',
    share_price_cents: null,
    shares_acquired: null,
    cost_basis_cents: 100000n,
    vehicle_participation_id: null,
    company_identity_id: 700,
    active_identity_links: 1,
    participation_fund_id: null,
    participation_vehicle_id: null,
    participation_company_identity_id: null,
    participation_version: null,
    participation_source_observation_id: null,
    superseded_by_participation_id: null,
    participation_currency: null,
    existing_event_id: null,
    existing_request_hash: null,
    existing_vehicle_id: null,
    existing_company_identity_id: null,
    existing_effective_date: null,
    existing_shares_delta: null,
    existing_cost_basis_delta: null,
    existing_vehicle_participation_id: null,
    existing_source_observation_id: null,
    existing_source_observation_hash: null,
    existing_source_observation_locator: null,
    overlapping_acquisition_id: null,
    ...overrides,
  };
}

describe('legacy position backfill service', () => {
  it('dry-run computes source hashes and writes zero rows', async () => {
    const model = baseModel();

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database: makeDb(model),
      request: { mode: 'dry_run', fundIds: [7] },
    });

    expect(result).toMatchObject({
      mode: 'dry_run',
      fundsScanned: 1,
      investmentsScanned: 1,
      planned: 1,
      written: 0,
      blocked: 0,
    });
    expect(result.candidates[0]).toMatchObject({
      investmentId: 800,
      vehicleId: 10,
      companyIdentityId: 700,
      sharesDelta: '0.000000',
      costBasisDelta: '1000.000000',
      status: 'planned',
      warnings: ['ZERO_SHARE_LEGACY_POSITION'],
    });
    expect(result.candidates[0]?.sourcePlanHash).toMatch(/^[a-f0-9]{64}$/);
    expect(model.positionEvents).toHaveLength(0);
    expect(model.sourceObservations).toHaveLength(0);
  });

  it('apply writes once and resume skips matching backfill events', async () => {
    const model = baseModel();
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash;

    const apply = await backfillLegacyPositionEvents({
      actorId: 42,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash ?? '' } },
    });

    expect(apply.written).toBe(1);
    expect(model.positionEvents).toHaveLength(1);
    expect(model.positionEvents[0]).toMatchObject({
      backfilled_from_investment_id: 800,
      created_by: 42,
      idempotency_key: 'pos:legacy-backfill:v1:inv:800',
    });
    expect(model.sourceObservations).toHaveLength(1);

    model.investments[0]!['existing_event_id'] = model.positionEvents[0]?.['id'];
    model.investments[0]!['existing_request_hash'] = model.positionEvents[0]?.['request_hash'];
    const resume = await backfillLegacyPositionEvents({
      actorId: 42,
      database,
      request: { mode: 'resume', fundIds: [7], expectedSourceHashes: { '800': hash ?? '' } },
    });

    expect(resume.mode).toBe('resume');
    expect(resume.skipped).toBe(1);
    expect(model.positionEvents).toHaveLength(1);
    expect(model.sourceObservations).toHaveLength(1);
  });

  it('replays a corrected backfill through its terminal replacement lineage', async () => {
    const model = baseModel({
      investments: [
        investmentRow({
          amount: '1000.00',
          shares_acquired: '10.00000000',
          cost_basis_cents: 100000n,
        }),
      ],
    });
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash ?? '';
    await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
    });
    const anchor = model.positionEvents[0]!;
    model.investments[0]!['amount'] = '1200.00';
    model.investments[0]!['shares_acquired'] = '12.00000000';
    model.investments[0]!['cost_basis_cents'] = 120000n;
    model.positionEvents.push(
      {
        id: 2,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 700,
        event_type: 'reversal',
        effective_date: '2025-01-15',
        shares_delta: '-10.000000',
        cost_basis_delta: '-1000.000000',
        proceeds: '0.000000',
        replaces_event_id: null,
        reverses_position_event_id: anchor['id'],
        vehicle_participation_id: null,
        source_observation_id: 200,
        backfilled_from_investment_id: null,
        request_hash: 'd'.repeat(64),
      },
      {
        id: 3,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 700,
        event_type: 'acquisition',
        effective_date: '2025-01-15',
        shares_delta: '12.000000',
        cost_basis_delta: '1200.000000',
        proceeds: '0.000000',
        replaces_event_id: anchor['id'],
        reverses_position_event_id: null,
        vehicle_participation_id: null,
        source_observation_id: 200,
        backfilled_from_investment_id: null,
        request_hash: 'd'.repeat(64),
      }
    );
    model.investments[0]!['amount'] = '1400.00';
    model.investments[0]!['shares_acquired'] = '14.00000000';
    model.investments[0]!['cost_basis_cents'] = 140000n;
    model.positionEvents.push(
      {
        id: 4,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 700,
        event_type: 'reversal',
        effective_date: '2025-01-15',
        shares_delta: '-12.000000',
        cost_basis_delta: '-1200.000000',
        proceeds: '0.000000',
        replaces_event_id: null,
        reverses_position_event_id: 3,
        vehicle_participation_id: null,
        source_observation_id: 201,
        backfilled_from_investment_id: null,
        request_hash: 'e'.repeat(64),
      },
      {
        id: 5,
        fund_id: 7,
        vehicle_id: 10,
        company_identity_id: 700,
        event_type: 'acquisition',
        effective_date: '2025-01-15',
        shares_delta: '14.000000',
        cost_basis_delta: '1400.000000',
        proceeds: '0.000000',
        replaces_event_id: 3,
        reverses_position_event_id: null,
        vehicle_participation_id: null,
        source_observation_id: 201,
        backfilled_from_investment_id: null,
        request_hash: 'e'.repeat(64),
      }
    );

    const replay = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });

    expect(replay.skipped).toBe(1);
    expect(replay.blocked).toBe(0);
    expect(replay.candidates[0]).toMatchObject({
      investmentId: 800,
      eventId: anchor['id'],
      status: 'skipped',
      sharesDelta: '14.000000',
      costBasisDelta: '1400.000000',
      warnings: expect.arrayContaining(['EXISTING_BACKFILL_REPLAYED']),
    });
    expect(model.positionEvents).toHaveLength(5);
  });

  it('rejects changed source hash before writing affected fund', async () => {
    const model = baseModel();
    const database = makeDb(model);

    await expect(
      backfillLegacyPositionEvents({
        actorId: 1,
        database,
        request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': 'a'.repeat(64) } },
      })
    ).rejects.toBeInstanceOf(LegacyPositionBackfillServiceError);

    expect(model.positionEvents).toHaveLength(0);
    expect(model.sourceObservations).toHaveLength(0);
  });

  it('blocks multi-main funds before opening write transactions', async () => {
    const model = baseModel({
      vehicles: [
        { id: 10, fund_id: 7, vehicle_slug: 'main-a', vehicle_type: 'main_fund' },
        { id: 11, fund_id: 7, vehicle_slug: 'main-b', vehicle_type: 'main_fund' },
      ],
    });

    await expect(
      backfillLegacyPositionEvents({
        actorId: 1,
        database: makeDb(model),
        request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': 'a'.repeat(64) } },
      })
    ).rejects.toMatchObject({ code: 'MULTI_MAIN_FUND_VEHICLE' });
    expect(model.transactions).toBe(0);
    expect(model.positionEvents).toHaveLength(0);
  });

  it('creates deterministic main vehicle when no main exists', async () => {
    const model = baseModel({ vehicles: [] });
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash;

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash ?? '' } },
    });

    expect(result.createdMainVehicles).toBe(1);
    expect(result.candidates[0]).toMatchObject({
      vehicleId: 50,
      warnings: ['ZERO_SHARE_LEGACY_POSITION', 'MAIN_VEHICLE_CREATED'],
    });
    expect(model.vehicles[0]).toMatchObject({
      fund_id: 7,
      vehicle_slug: 'legacy-main-fund',
      vehicle_type: 'main_fund',
    });
  });

  it('rejects lossy share precision before writes', async () => {
    const model = baseModel({
      investments: [investmentRow({ shares_acquired: '1.12345678' })],
    });

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database: makeDb(model),
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': 'a'.repeat(64) } },
    });

    expect(result.blocked).toBe(1);
    expect(result.candidates[0]?.blockers).toContain('SHARE_PRECISION_LOSS');
    expect(model.positionEvents).toHaveLength(0);
  });

  it('reuses participation source observation without duplicating observations', async () => {
    const model = baseModel({
      investments: [
        investmentRow({
          vehicle_participation_id: 900,
          participation_fund_id: 7,
          participation_vehicle_id: 10,
          participation_company_identity_id: 700,
          participation_version: 1,
          participation_source_observation_id: 300,
          participation_currency: 'USD',
          shares_acquired: '2.00000000',
        }),
      ],
    });
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash;

    const apply = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash ?? '' } },
    });

    expect(apply.written).toBe(1);
    expect(apply.candidates[0]?.warnings).toContain('PARTICIPATION_OBSERVATION_REUSED');
    expect(model.sourceObservations).toHaveLength(0);
    expect(model.positionEvents[0]).toMatchObject({
      vehicle_participation_id: 900,
      source_observation_id: 300,
    });
  });

  it('blocks participation-backed investments without source observation lineage', async () => {
    const model = baseModel({
      investments: [
        investmentRow({
          vehicle_participation_id: 900,
          participation_fund_id: 7,
          participation_vehicle_id: 10,
          participation_company_identity_id: 700,
          participation_version: 1,
          participation_source_observation_id: null,
          participation_currency: 'USD',
        }),
      ],
    });

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database: makeDb(model),
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': 'a'.repeat(64) } },
    });

    expect(result.blocked).toBe(1);
    expect(result.candidates[0]?.blockers).toContain('PARTICIPATION_OBSERVATION_MISSING');
    expect(model.positionEvents).toHaveLength(0);
    expect(model.sourceObservations).toHaveLength(0);
  });

  it('blocks manual acquisition overlap before insert', async () => {
    const model = baseModel();
    model.positionEvents.push({
      id: 99,
      fund_id: 7,
      vehicle_id: 10,
      company_identity_id: 700,
      event_type: 'acquisition',
      effective_date: '2025-01-01',
      shares_delta: '1.000000',
      cost_basis_delta: '1.000000',
      vehicle_participation_id: null,
      source_observation_id: null,
      backfilled_from_investment_id: null,
      request_hash: null,
    });

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database: makeDb(model),
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': 'a'.repeat(64) } },
    });

    expect(result.blocked).toBe(1);
    expect(result.candidates[0]?.blockers).toContain('POSITION_ACQUISITION_OVERLAP');
  });

  it('rejects replay when immutable event fields no longer match', async () => {
    const model = baseModel();
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash ?? '';
    await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
    });
    model.positionEvents[0]!['cost_basis_delta'] = '999.000000';

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
    });

    expect(result.blocked).toBe(1);
    expect(result.candidates[0]?.blockers).toContain('EXISTING_BACKFILL_MISMATCH');
  });

  it('rejects replay when source observation hash no longer matches', async () => {
    const model = baseModel();
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash ?? '';
    await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
    });
    model.sourceObservations[0]!['observation_hash'] = 'b'.repeat(64);

    const result = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
    });

    expect(result.blocked).toBe(1);
    expect(result.candidates[0]?.blockers).toContain('EXISTING_BACKFILL_MISMATCH');
  });

  it('rejects candidate set drift before writes', async () => {
    const model = baseModel();
    const database = makeDb(model);
    const dryRun = await backfillLegacyPositionEvents({
      actorId: 1,
      database,
      request: { mode: 'dry_run', fundIds: [7] },
    });
    const hash = dryRun.candidates[0]?.sourcePlanHash ?? '';
    model.beforeInvestmentRead = (fakeModel, readCount) => {
      if (readCount !== 3) return;
      fakeModel.investments.push(
        investmentRow({
          investment_id: 801,
          amount: '250.00',
          cost_basis_cents: 25000n,
        })
      );
    };

    await expect(
      backfillLegacyPositionEvents({
        actorId: 1,
        database,
        request: { mode: 'apply', fundIds: [7], expectedSourceHashes: { '800': hash } },
      })
    ).rejects.toMatchObject({ code: 'SOURCE_PLAN_HASH_CHANGED' });

    expect(model.positionEvents).toHaveLength(0);
    expect(model.sourceObservations).toHaveLength(0);
  });
});
