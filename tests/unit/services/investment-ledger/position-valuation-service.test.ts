import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  recordDirectPositionValuation,
  selectPositionValuation,
} from '../../../../server/services/investment-ledger/position-valuation-service';

const dialect = new PgDialect();

interface Model {
  links: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  positionEvents: Array<Record<string, unknown>>;
  participationTerms: Array<Record<string, unknown>>;
  ownership: Array<Record<string, unknown>>;
  directMarks: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  tranches: Array<Record<string, unknown>>;
  participations: Array<Record<string, unknown>>;
  nextObservationId: number;
  nextMarkId: number;
}

function makeDb(model: Model) {
  const database = {
    execute: async (query: unknown): Promise<{ rows: Array<Record<string, unknown>> }> => {
      const rendered = dialect.sqlToQuery(query as never);
      const flat = rendered.sql.replace(/\s+/g, ' ').trim();
      if (flat.includes('FROM portfolio_company_identity_links')) {
        const [fundId, companyId, companyIdentityId] = rendered.params as [number, number, number];
        return {
          rows: model.links.filter(
            (row) =>
              row['fund_id'] === fundId &&
              row['portfolio_company_id'] === companyId &&
              row['company_identity_id'] === companyIdentityId &&
              row['active'] === true
          ),
        };
      }
      if (flat.includes('FROM vehicles')) {
        const [vehicleId, fundId] = rendered.params as [number, number];
        return {
          rows: model.vehicles.filter(
            (row) => row['id'] === vehicleId && row['fund_id'] === fundId
          ),
        };
      }
      if (flat.includes('FROM position_events')) {
        return { rows: model.positionEvents };
      }
      if (
        flat.includes('FROM vehicle_financing_participations') &&
        !flat.includes('FROM financing_tranches')
      ) {
        return { rows: model.participationTerms };
      }
      if (flat.includes('FROM position_event_source_basis_reliefs')) {
        return { rows: [] };
      }
      if (flat.includes('FROM valuation_marks mark')) {
        const [
          companyIdentityId,
          asOfDate,
          observationCutoff,
          fundId,
          vehicleId,
          companyId,
          markDate,
          markAsOfDate,
          markCutoff,
          acceptanceCutoff,
        ] = rendered.params as [
          number,
          string,
          Date,
          number,
          number,
          number,
          string,
          string,
          Date,
          Date,
        ];
        return {
          rows: model.directMarks
            .filter(
              (mark) =>
                mark['fund_id'] === fundId &&
                mark['vehicle_id'] === vehicleId &&
                mark['company_id'] === companyId &&
                mark['mark_purpose'] === 'direct_position_fmv' &&
                (mark['status'] === 'approved' || mark['status'] === 'locked') &&
                String(mark['mark_date']) <= markDate &&
                String(mark['as_of_date']) <= markAsOfDate &&
                mark['created_at'] instanceof Date &&
                mark['created_at'] <= markCutoff &&
                (mark['approved_at'] as Date) <= acceptanceCutoff &&
                model.observations.some(
                  (observation) =>
                    observation['id'] === mark['source_observation_id'] &&
                    observation['fund_id'] === fundId &&
                    observation['company_identity_id'] === companyIdentityId &&
                    observation['status'] === 'accepted' &&
                    observation['domain'] === 'valuation' &&
                    String(observation['effective_date']) <= asOfDate &&
                    observation['created_at'] instanceof Date &&
                    observation['created_at'] <= observationCutoff
                )
            )
            .sort(
              (left, right) =>
                String(right['mark_date']).localeCompare(String(left['mark_date'])) ||
                Number(right['id']) - Number(left['id'])
            )
            .slice(0, 1),
        };
      }
      if (flat.includes('FROM ownership_snapshots')) {
        return { rows: model.ownership };
      }
      if (flat.includes('FROM financing_tranches')) {
        const [
          eventCompanyIdentityId,
          vehicleId,
          participationCutoff,
          observationCompanyIdentityId,
          observationAsOfDate,
          observationCutoff,
          fundId,
          closingAsOfDate,
          trancheCutoff,
          eventCutoff,
          participationSuccessorCutoff,
          participationSuccessorAsOfDate,
          trancheSuccessorAsOfDate,
          trancheSuccessorCutoff,
        ] = rendered.params as [
          number,
          number,
          Date,
          number,
          string,
          Date,
          number,
          string,
          Date,
          Date,
          Date,
          string,
          string,
          Date,
        ];
        return {
          rows: model.tranches
            .flatMap((tranche) =>
              model.participations
                .filter(
                  (participation) =>
                    participation['financing_tranche_id'] === tranche['id'] &&
                    participation['fund_id'] === tranche['fund_id'] &&
                    participation['vehicle_id'] === vehicleId &&
                    participation['created_at'] instanceof Date &&
                    participation['created_at'] <= participationCutoff &&
                    !model.participations.some((successor) => {
                      const successorTranche = model.tranches.find(
                        (candidate) =>
                          candidate['id'] === successor['financing_tranche_id'] &&
                          candidate['fund_id'] === successor['fund_id']
                      );
                      return (
                        successor['id'] === participation['superseded_by_participation_id'] &&
                        successor['fund_id'] === participation['fund_id'] &&
                        successor['vehicle_id'] === participation['vehicle_id'] &&
                        successor['created_at'] instanceof Date &&
                        successor['created_at'] <= participationSuccessorCutoff &&
                        String(
                          successor['closing_date'] ?? successorTranche?.['closing_date']
                        ) <= participationSuccessorAsOfDate
                      );
                    })
                )
                .map((participation) => ({
                  ...tranche,
                  participation_id: participation['id'],
                  participation_version: participation['version'],
                  post_money_valuation:
                    participation['post_money_valuation'] ?? tranche['post_money_valuation'],
                  evidence_date: participation['closing_date'] ?? tranche['closing_date'],
                }))
            )
            .filter(
              (tranche) =>
                tranche['fund_id'] === fundId &&
                tranche['company_identity_id'] === eventCompanyIdentityId &&
                eventCompanyIdentityId === observationCompanyIdentityId &&
                tranche['security_type'] === 'equity' &&
                tranche['post_money_valuation'] !== null &&
                tranche['post_money_valuation'] !== undefined &&
                String(tranche['evidence_date']) <= closingAsOfDate &&
                tranche['created_at'] instanceof Date &&
                tranche['created_at'] <= trancheCutoff &&
                tranche['event_created_at'] instanceof Date &&
                tranche['event_created_at'] <= eventCutoff &&
                !model.tranches.some(
                  (successor) =>
                    successor['id'] === tranche['superseded_by_tranche_id'] &&
                    successor['fund_id'] === tranche['fund_id'] &&
                    String(successor['closing_date']) <= trancheSuccessorAsOfDate &&
                    successor['created_at'] instanceof Date &&
                    successor['created_at'] <= trancheSuccessorCutoff
                ) &&
                model.observations.some(
                  (observation) =>
                    observation['id'] === tranche['source_observation_id'] &&
                    observation['fund_id'] === fundId &&
                    observation['company_identity_id'] === observationCompanyIdentityId &&
                    observation['status'] === 'accepted' &&
                    observation['domain'] === 'ledger_event' &&
                    String(observation['effective_date']) <= observationAsOfDate &&
                    observation['created_at'] instanceof Date &&
                    observation['created_at'] <= observationCutoff
                )
            )
            .sort(
              (left, right) =>
                String(right['closing_date']).localeCompare(String(left['closing_date'])) ||
                Number(right['id']) - Number(left['id'])
            )
            .slice(0, 1),
        };
      }
      if (flat.includes('FROM valuation_marks')) {
        if (flat.includes('source_hash =')) {
          const [fundId, sourceHash] = rendered.params;
          return {
            rows: model.directMarks.filter(
              (mark) =>
                mark['fund_id'] === fundId &&
                mark['source_hash'] === sourceHash &&
                mark['mark_purpose'] === 'direct_position_fmv'
            ),
          };
        }
        const [fundId, markId] = rendered.params;
        return {
          rows: model.directMarks.filter(
            (mark) => mark['fund_id'] === fundId && mark['id'] === markId
          ),
        };
      }
      if (flat.includes('FROM source_observations')) {
        const [observationId, fundId, companyIdentityId, effectiveDate] = rendered.params;
        return {
          rows: model.observations.filter(
            (observation) =>
              observation['id'] === observationId &&
              observation['fund_id'] === fundId &&
              (companyIdentityId === undefined ||
                observation['company_identity_id'] === companyIdentityId) &&
              (!flat.includes("domain = 'valuation'") ||
                observation['domain'] === 'valuation') &&
              (!flat.includes("status = 'accepted'") ||
                observation['status'] === 'accepted') &&
              (effectiveDate === undefined ||
                String(observation['effective_date']) <= String(effectiveDate))
          ),
        };
      }
      if (flat.startsWith("SELECT nextval('source_observations_id_seq')")) {
        return { rows: [{ id: model.nextObservationId++ }] };
      }
      if (flat.startsWith('INSERT INTO source_observations')) {
        const row = {
          id: rendered.params[0],
          fund_id: rendered.params[1],
          company_identity_id: rendered.params[2],
          domain: 'valuation',
          source_type: 'manual',
          effective_date: rendered.params[3],
          normalized_payload: rendered.params[4],
          observation_hash: rendered.params[5],
          candidate_fingerprint: rendered.params[6],
          source_locator: rendered.params[7],
          dependency_group_key: rendered.params[8],
          status: 'accepted',
          created_at: new Date('2026-07-02T00:00:00.000Z'),
        };
        model.observations.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (flat.startsWith('INSERT INTO valuation_marks')) {
        const row = {
          id: model.nextMarkId++,
          fund_id: rendered.params[0],
          vehicle_id: rendered.params[1],
          company_id: rendered.params[2],
          mark_date: rendered.params[3],
          as_of_date: rendered.params[4],
          fair_value: rendered.params[5],
          currency: 'USD',
          cost_basis: null,
          mark_purpose: 'direct_position_fmv',
          source_observation_id: rendered.params[6],
          mark_source: rendered.params[7],
          confidence_level: rendered.params[8],
          valuation_method: rendered.params[9],
          methodology_notes: rendered.params[10],
          status: 'approved',
          approved_by: rendered.params[11],
          approved_at: new Date('2026-07-02T00:00:00.000Z'),
          imported_from: 'position_valuation',
          source_hash: rendered.params[12],
          created_by: rendered.params[13],
          created_at: new Date('2026-07-02T00:00:00.000Z'),
        };
        model.directMarks.push(row);
        return { rows: [{ id: row.id }] };
      }
      return { rows: [] };
    },
    transaction: async <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> =>
      callback(database),
  };
  return database as never;
}

function baseModel(): Model {
  return {
    links: [
      {
        id: 1,
        fund_id: 7,
        portfolio_company_id: 12,
        company_identity_id: 11,
        active: true,
      },
    ],
    vehicles: [
      {
        id: 9,
        fund_id: 7,
      },
    ],
    positionEvents: [
      {
        id: 1,
        fund_id: 7,
        vehicle_id: 9,
        company_identity_id: 11,
        event_type: 'acquisition',
        effective_date: '2026-01-01',
        recorded_at: new Date('2026-01-02T00:00:00.000Z'),
        shares_delta: '10.000000',
        cost_basis_delta: '100.000000',
        proceeds: '0.000000',
        vehicle_participation_id: 100,
        resulting_participation_id: null,
      },
    ],
    participationTerms: [{ id: 100, security_type: 'equity' }],
    ownership: [
      {
        id: 301,
        fund_id: 7,
        vehicle_id: 9,
        company_identity_id: 11,
        effective_date: '2026-07-01',
        recorded_at: new Date('2026-07-02T00:00:00.000Z'),
        ownership_pct: '10.00000000',
        fd_numerator: null,
        fd_denominator: null,
        currency: 'USD',
        supersedes_snapshot_id: null,
        source_observation_id: 201,
        created_by: 3,
        idempotency_key: 'own-1',
        request_hash: 'a'.repeat(64),
      },
    ],
    directMarks: [],
    observations: [
      {
        id: 401,
        fund_id: 7,
        company_identity_id: 11,
        status: 'accepted',
        domain: 'ledger_event',
        effective_date: '2026-06-30',
        observation_hash: 'c'.repeat(64),
        created_at: new Date('2026-07-01T00:00:00.000Z'),
      },
      {
        id: 402,
        fund_id: 7,
        company_identity_id: 11,
        status: 'accepted',
        domain: 'valuation',
        effective_date: '2026-06-30',
        observation_hash: 'd'.repeat(64),
        created_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
    tranches: [
      {
        id: 501,
        version: 2,
        fund_id: 7,
        company_identity_id: 11,
        security_type: 'equity',
        post_money_valuation: '50000000.000000',
        source_observation_id: 401,
        closing_date: '2026-06-30',
        superseded_by_tranche_id: null,
        created_at: new Date('2026-07-01T00:00:00.000Z'),
        event_created_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
    participations: [
      {
        id: 502,
        version: 3,
        fund_id: 7,
        vehicle_id: 9,
        financing_tranche_id: 501,
        post_money_valuation: null,
        closing_date: '2026-06-30',
        superseded_by_participation_id: null,
        created_at: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
    nextObservationId: 700,
    nextMarkId: 600,
  };
}

describe('position valuation selection', () => {
  it('rejects caller companyId that is not the active identity link', async () => {
    const fake = baseModel();

    await expect(
      selectPositionValuation({
        fundId: 7,
        vehicleId: 9,
        companyIdentityId: 11,
        companyId: 99,
        asOfDate: '2026-07-31',
        knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
        database: makeDb(fake),
      })
    ).rejects.toMatchObject({ code: 'POSITION_VALUATION_SCOPE_MISMATCH', status: 422 });
  });

  it('selects accepted direct mark over derived evidence', async () => {
    const fake = baseModel();
    fake.directMarks.push({
      id: 601,
      fund_id: 7,
      vehicle_id: 9,
      company_id: 12,
      mark_date: '2026-07-01',
      as_of_date: '2026-07-01',
      fair_value: '1250000.000000',
      currency: 'USD',
      cost_basis: null,
      mark_purpose: 'direct_position_fmv',
      mark_source: 'board_update',
      confidence_level: 'high',
      valuation_method: 'direct',
      methodology_notes: null,
      status: 'approved',
      source_observation_id: 402,
      source_hash: 'b'.repeat(64),
      created_at: new Date('2026-07-02T00:00:00.000Z'),
      approved_at: new Date('2026-07-02T00:00:00.000Z'),
    });

    const result = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result).toMatchObject({
      basis: 'direct',
      aggregateFairValue: '1250000.000000',
      directMarkId: 601,
      ownershipSnapshotId: null,
    });
  });

  it('keeps mixed direct valuations aggregate-incomplete with priced component disclosure', async () => {
    const fake = baseModel();
    fake.positionEvents.push({
      id: 2,
      fund_id: 7,
      vehicle_id: 9,
      company_identity_id: 11,
      event_type: 'acquisition',
      effective_date: '2026-02-01',
      recorded_at: new Date('2026-02-02T00:00:00.000Z'),
      shares_delta: '0.000000',
      cost_basis_delta: '250.000000',
      proceeds: '0.000000',
      vehicle_participation_id: 101,
      resulting_participation_id: null,
    });
    fake.participationTerms.push({ id: 101, security_type: 'safe' });
    fake.directMarks.push({
      id: 601,
      fund_id: 7,
      vehicle_id: 9,
      company_id: 12,
      mark_date: '2026-07-01',
      as_of_date: '2026-07-01',
      fair_value: '1250000.000000',
      currency: 'USD',
      cost_basis: null,
      mark_purpose: 'direct_position_fmv',
      mark_source: 'board_update',
      confidence_level: 'high',
      valuation_method: 'direct',
      methodology_notes: null,
      status: 'approved',
      source_observation_id: 402,
      source_hash: 'b'.repeat(64),
      created_at: new Date('2026-07-02T00:00:00.000Z'),
      approved_at: new Date('2026-07-02T00:00:00.000Z'),
    });

    const result = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result).toMatchObject({
      basis: 'direct',
      aggregateFairValue: null,
      directMarkId: 601,
      pricedComponentFairValue: '1250000.000000',
      warnings: [
        { code: 'CONTINGENT_INSTRUMENT_EXCLUDED' },
        { code: 'POSITION_VALUATION_INCOMPLETE' },
      ],
    });
  });

  it('requires accepted typed post-money evidence for derived valuation', async () => {
    const fake = baseModel();

    const derived = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });
    fake.observations[0] = { ...fake.observations[0]!, status: 'staged' };
    const unavailable = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });
    fake.observations[0] = { ...fake.observations[0]!, status: 'accepted' };
    fake.ownership[0] = { ...fake.ownership[0]!, effective_date: '2026-01-01' };
    const ownershipBeforeRound = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });
    fake.ownership[0] = { ...fake.ownership[0]!, effective_date: '2026-07-01' };
    fake.tranches[0] = {
      ...fake.tranches[0]!,
      post_money_valuation: null,
      pre_money_valuation: '40000000.000000',
      round_size: '10000000.000000',
    };
    const preMoneyOnly = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(derived).toMatchObject({
      basis: 'derived',
      aggregateFairValue: '5000000.000000',
      ownershipSnapshotId: 301,
    });
    expect(unavailable).toMatchObject({
      basis: 'unavailable',
      aggregateFairValue: null,
    });
    expect(ownershipBeforeRound).toMatchObject({
      basis: 'unavailable',
      aggregateFairValue: null,
    });
    expect(preMoneyOnly).toMatchObject({
      basis: 'unavailable',
      aggregateFairValue: null,
    });
  });

  it('selects the terminal tranche and participation known at each bitemporal cutoff', async () => {
    const fake = baseModel();
    fake.tranches[0] = {
      ...fake.tranches[0]!,
      superseded_by_tranche_id: 503,
    };
    fake.participations[0] = {
      ...fake.participations[0]!,
      superseded_by_participation_id: 504,
    };
    fake.observations.push({
      id: 403,
      fund_id: 7,
      company_identity_id: 11,
      status: 'accepted',
      domain: 'ledger_event',
      effective_date: '2026-06-30',
      observation_hash: 'e'.repeat(64),
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    });
    fake.tranches.push({
      id: 503,
      version: 3,
      fund_id: 7,
      company_identity_id: 11,
      security_type: 'equity',
      post_money_valuation: '60000000.000000',
      source_observation_id: 403,
      closing_date: '2026-06-30',
      superseded_by_tranche_id: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
      event_created_at: new Date('2026-08-01T00:00:00.000Z'),
    });
    fake.participations.push({
      id: 504,
      version: 4,
      fund_id: 7,
      vehicle_id: 9,
      financing_tranche_id: 503,
      post_money_valuation: null,
      closing_date: '2026-06-30',
      superseded_by_participation_id: null,
      created_at: new Date('2026-08-01T00:00:00.000Z'),
    });

    const beforeCorrectionWasKnown = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });
    const afterCorrectionWasKnown = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-08-02T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(beforeCorrectionWasKnown).toMatchObject({
      aggregateFairValue: '5000000.000000',
      derivedTrancheId: 501,
      derivedParticipationId: 502,
    });
    expect(afterCorrectionWasKnown).toMatchObject({
      aggregateFairValue: '6000000.000000',
      derivedTrancheId: 503,
      derivedParticipationId: 504,
    });

    fake.tranches[1] = {
      ...fake.tranches[1]!,
      closing_date: '2026-08-15',
    };
    fake.participations[1] = {
      ...fake.participations[1]!,
      closing_date: '2026-08-15',
    };
    fake.observations[2] = {
      ...fake.observations[2]!,
      effective_date: '2026-08-15',
    };
    const beforeCorrectionEffectiveDate = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-08-20T00:00:00.000Z'),
      database: makeDb(fake),
    });
    expect(beforeCorrectionEffectiveDate).toMatchObject({
      aggregateFairValue: '5000000.000000',
      derivedTrancheId: 501,
      derivedParticipationId: 502,
    });
  });

  it('keeps a stale accepted direct mark selected without derived fallback', async () => {
    const fake = baseModel();
    fake.directMarks.push({
      id: 601,
      fund_id: 7,
      vehicle_id: 9,
      company_id: 12,
      mark_date: '2026-01-01',
      as_of_date: '2026-01-01',
      fair_value: '1250000.000000',
      currency: 'USD',
      cost_basis: null,
      mark_purpose: 'direct_position_fmv',
      mark_source: 'board_update',
      confidence_level: 'high',
      valuation_method: 'direct',
      methodology_notes: null,
      status: 'approved',
      source_observation_id: 402,
      source_hash: 'b'.repeat(64),
      created_at: new Date('2026-01-02T00:00:00.000Z'),
      approved_at: new Date('2026-01-02T00:00:00.000Z'),
    });

    const result = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result).toMatchObject({
      basis: 'direct',
      aggregateFairValue: '1250000.000000',
      directMarkId: 601,
      ownershipSnapshotId: null,
      warnings: [{ code: 'DIRECT_POSITION_MARK_STALE' }],
    });
  });

  it('returns null aggregate and the priced component for mixed contingent holdings', async () => {
    const fake = baseModel();
    fake.positionEvents.push({
      id: 2,
      fund_id: 7,
      vehicle_id: 9,
      company_identity_id: 11,
      event_type: 'acquisition',
      effective_date: '2026-02-01',
      recorded_at: new Date('2026-02-02T00:00:00.000Z'),
      shares_delta: '0.000000',
      cost_basis_delta: '250.000000',
      proceeds: '0.000000',
      vehicle_participation_id: 101,
      resulting_participation_id: null,
    });
    fake.participationTerms.push({ id: 101, security_type: 'safe' });

    const result = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-31T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result).toMatchObject({
      basis: 'derived',
      aggregateFairValue: null,
      pricedComponentFairValue: '5000000.000000',
      warnings: [
        { code: 'CONTINGENT_INSTRUMENT_EXCLUDED' },
        { code: 'POSITION_VALUATION_INCOMPLETE' },
      ],
    });
  });

  it('excludes direct marks and post-money evidence recorded after the knowledge cutoff', async () => {
    const fake = baseModel();
    fake.directMarks.push({
      id: 601,
      fund_id: 7,
      vehicle_id: 9,
      company_id: 12,
      mark_date: '2026-06-30',
      as_of_date: '2026-06-30',
      fair_value: '1250000.000000',
      currency: 'USD',
      cost_basis: null,
      mark_purpose: 'direct_position_fmv',
      mark_source: 'board_update',
      confidence_level: 'high',
      valuation_method: 'direct',
      methodology_notes: null,
      status: 'approved',
      source_observation_id: 402,
      source_hash: 'b'.repeat(64),
      created_at: new Date('2026-07-15T00:00:00.000Z'),
      approved_at: new Date('2026-07-15T00:00:00.000Z'),
    });
    fake.tranches[0] = {
      ...fake.tranches[0]!,
      created_at: new Date('2026-07-15T00:00:00.000Z'),
      event_created_at: new Date('2026-07-15T00:00:00.000Z'),
    };

    const result = await selectPositionValuation({
      fundId: 7,
      vehicleId: 9,
      companyIdentityId: 11,
      companyId: 12,
      asOfDate: '2026-07-31',
      knowledgeCutoff: new Date('2026-07-10T00:00:00.000Z'),
      database: makeDb(fake),
    });

    expect(result).toMatchObject({ basis: 'unavailable', aggregateFairValue: null });
  });
});

describe('direct position valuation command', () => {
  const request = {
    vehicleId: 9,
    companyIdentityId: 11,
    companyId: 12,
    asOfDate: '2026-07-01',
    fairValue: '1250000.000000',
    currency: 'USD',
    sourceObservationId: 402,
    markSource: 'board_update',
    confidenceLevel: 'high',
    valuationMethod: 'direct_position_mark',
  };

  it('replays the exact request and rejects changed payload without extra rows', async () => {
    const fake = baseModel();
    const database = makeDb(fake);

    const created = await recordDirectPositionValuation({
      fundId: 7,
      actorId: 3,
      idempotencyKey: 'valuation-1',
      request,
      database,
    });
    const replayed = await recordDirectPositionValuation({
      fundId: 7,
      actorId: 3,
      idempotencyKey: 'valuation-1',
      request,
      database,
    });
    await expect(
      recordDirectPositionValuation({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'valuation-1',
        request: { ...request, fairValue: '1300000.000000' },
        database,
      })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });

    expect(created.replayed).toBe(false);
    expect(replayed).toEqual({ ...created, replayed: true });
    expect(fake.directMarks).toHaveLength(1);
    expect(fake.observations).toHaveLength(3);
  });

  it('rejects a direct mark when vehicle does not belong to the fund', async () => {
    const fake = baseModel();
    fake.vehicles[0] = { ...fake.vehicles[0]!, fund_id: 8 };

    await expect(
      recordDirectPositionValuation({
        fundId: 7,
        actorId: 3,
        idempotencyKey: 'valuation-cross-fund-vehicle',
        request,
        database: makeDb(fake),
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'POSITION_VALUATION_SCOPE_MISMATCH',
    });

    expect(fake.directMarks).toHaveLength(0);
    expect(fake.observations).toHaveLength(2);
  });
});
