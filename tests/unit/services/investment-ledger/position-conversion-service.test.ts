import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateH9Artifacts, resolveIdentityHead } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
  resolveIdentityHead: vi.fn(async (_db: unknown, _fundId: number, identityId: number) => identityId),
}));

vi.mock('../../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

vi.mock('../../../../server/services/financial-observations/identity-resolution-service', () => ({
  resolveIdentityHead,
}));

import { convertPosition } from '../../../../server/services/investment-ledger/position-conversion-service';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';

const dialect = new PgDialect();
const CREATED_AT = new Date('2026-07-01T00:00:00.000Z');
const FUND_ID = 7;
const VEHICLE_ID = 41;
const IDENTITY_ID = 11;
const SOURCE_PARTICIPATION_ID = 600;
const SOURCE_TRANCHE_ID = 500;
const TARGET_TRANCHE_ID = 501;
const SOURCE_EVENT_ID = 100;
const TARGET_EVENT_ID = 101;
const SOURCE_ACQUISITION_EVENT_ID = 700;
const INVESTMENT_ID = 800;
const LOT_ID = '11111111-1111-4111-8111-111111111111';
const LOT_ID_TWO = '22222222-2222-4222-8222-222222222222';

interface Statement {
  text: string;
  params: unknown[];
}

interface Model {
  participations: Array<Record<string, unknown>>;
  tranches: Array<Record<string, unknown>>;
  positionEvents: Array<Record<string, unknown>>;
  investments: Array<Record<string, unknown>>;
  lots: Array<Record<string, unknown>>;
  lotReliefs: Array<Record<string, unknown>>;
  sourceBasisReliefs: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  statements: Statement[];
  nextParticipationId: number;
  nextPositionEventId: number;
  nextObservationId: number;
  failSourceBasisReliefInsert: boolean;
  hideResultLotOnReload: boolean;
}

function baseParticipation(overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_PARTICIPATION_ID,
    fund_id: FUND_ID,
    vehicle_id: VEHICLE_ID,
    financing_event_id: SOURCE_EVENT_ID,
    tranche_key: 'safe',
    financing_tranche_id: SOURCE_TRANCHE_ID,
    version: 1,
    superseded_by_participation_id: null,
    economic_origin: 'cash_investment',
    participation_amount: '1000.000000',
    original_amount: '1000.000000',
    currency: 'USD',
    fx_rate_to_usd: '1.0000000000',
    fx_rate_date: '2026-01-01',
    shares_acquired: null,
    closing_date: '2026-01-01',
    price_per_share: null,
    post_money_valuation: null,
    valuation_cap: '5000000.000000',
    conversion_discount_rate: null,
    interest_rate: null,
    liquidation_preference_multiple: null,
    participating_preferred: null,
    participation_cap_multiple: null,
    pro_rata_rights_pct: null,
    maturity_date: null,
    descriptive_terms: null,
    confirmed_duplicates: [],
    source_observation_id: 901,
    created_by: 3,
    idempotency_key: 'source-participation',
    request_hash: canonicalSha256({ seed: 'source' }),
    created_at: CREATED_AT,
    ...overrides,
  };
}

function baseTranche(overrides: Record<string, unknown> = {}) {
  const isTarget = overrides['id'] === TARGET_TRANCHE_ID;
  return {
    id: isTarget ? TARGET_TRANCHE_ID : SOURCE_TRANCHE_ID,
    fund_id: FUND_ID,
    financing_event_id: isTarget ? TARGET_EVENT_ID : SOURCE_EVENT_ID,
    tranche_key: isTarget ? 'series-a' : 'safe',
    version: 1,
    superseded_by_tranche_id: null,
    closing_date: '2026-07-01',
    security_type: isTarget ? 'equity' : 'safe',
    investment_amount: '1000.000000',
    original_amount: '1000.000000',
    currency: 'USD',
    fx_rate_to_usd: '1.0000000000',
    fx_rate_date: '2026-07-01',
    price_per_share: isTarget ? '10.000000' : null,
    post_money_valuation: isTarget ? '10000000.000000' : null,
    valuation_cap: isTarget ? null : '5000000.000000',
    conversion_discount_rate: null,
    interest_rate: null,
    maturity_date: null,
    liquidation_preference_multiple: null,
    participating_preferred: null,
    participation_cap_multiple: null,
    pro_rata_rights_pct: null,
    descriptive_terms: {},
    calculation_eligible: true,
    source_observation_id: 900,
    created_by: 3,
    idempotency_key: isTarget ? 'target-tranche' : 'source-tranche',
    request_hash: canonicalSha256({ seed: isTarget ? 'target' : 'source' }),
    created_at: CREATED_AT,
    company_identity_id: IDENTITY_ID,
    canonical_name: 'Acme Robotics',
    ...overrides,
  };
}

function basePositionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_ACQUISITION_EVENT_ID,
    fund_id: FUND_ID,
    vehicle_id: VEHICLE_ID,
    company_identity_id: IDENTITY_ID,
    event_type: 'acquisition',
    effective_date: '2026-01-01',
    recorded_at: CREATED_AT,
    shares_delta: '0.000000',
    cost_basis_delta: '1000.000000',
    proceeds: '0.000000',
    replaces_event_id: null,
    reverses_position_event_id: null,
    vehicle_participation_id: SOURCE_PARTICIPATION_ID,
    resulting_participation_id: null,
    source_participation_version: null,
    resulting_participation_version: null,
    source_tranche_version: null,
    resulting_tranche_version: null,
    source_observation_id: 901,
    backfilled_from_investment_id: null,
    created_by: 3,
    idempotency_key: 'source-position-event',
    request_hash: canonicalSha256({ seed: 'source-position' }),
    ...overrides,
  };
}

function emptyModel(): Model {
  return {
    participations: [baseParticipation()],
    tranches: [baseTranche(), baseTranche({ id: TARGET_TRANCHE_ID })],
    positionEvents: [basePositionEvent()],
    investments: [{ id: INVESTMENT_ID, fund_id: FUND_ID, vehicle_participation_id: SOURCE_PARTICIPATION_ID }],
    lots: [],
    lotReliefs: [],
    sourceBasisReliefs: [],
    observations: [],
    statements: [],
    nextParticipationId: 601,
    nextPositionEventId: 701,
    nextObservationId: 950,
    failSourceBasisReliefInsert: false,
    hideResultLotOnReload: false,
  };
}

function cloneModel(model: Model): Model {
  return {
    ...model,
    participations: model.participations.map((row) => ({ ...row })),
    tranches: model.tranches.map((row) => ({ ...row })),
    positionEvents: model.positionEvents.map((row) => ({ ...row })),
    investments: model.investments.map((row) => ({ ...row })),
    lots: model.lots.map((row) => ({ ...row })),
    lotReliefs: model.lotReliefs.map((row) => ({ ...row })),
    sourceBasisReliefs: model.sourceBasisReliefs.map((row) => ({ ...row })),
    observations: model.observations.map((row) => ({ ...row })),
    statements: [...model.statements],
  };
}

function restoreModel(model: Model, snapshot: Model): void {
  Object.assign(model, cloneModel(snapshot));
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim().length > 0) parts.push(current.trim());
  return parts;
}

function literalValue(token: string, params: unknown[]): unknown {
  const bare = token.replace(/::[a-z[\]]+$/i, '').trim();
  const placeholder = /^\$(\d+)$/.exec(bare);
  if (placeholder) return params[Number.parseInt(placeholder[1] ?? '0', 10) - 1];
  if (/^NULL$/i.test(bare)) return null;
  if (/^'([^']*)'$/.test(bare)) return bare.slice(1, -1);
  return bare;
}

function parseInsert(flat: string, params: unknown[]): Record<string, unknown> {
  const columnStart = flat.indexOf('(');
  const columnEnd = flat.indexOf(')', columnStart);
  const columns = splitTopLevel(flat.slice(columnStart + 1, columnEnd)).map((column) =>
    column.replace(/"/g, '').trim()
  );
  const valuesStart = flat.indexOf('(', flat.indexOf('VALUES'));
  const valuesEnd = flat.lastIndexOf(')');
  const values = splitTopLevel(flat.slice(valuesStart + 1, valuesEnd));
  const row: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    const token = values[index] ?? 'NULL';
    const value = literalValue(token, params);
    row[column] =
      typeof value === 'string' &&
      token.includes('::jsonb') &&
      (value.startsWith('{') || value.startsWith('['))
        ? (JSON.parse(value) as unknown)
        : value;
  });
  return row;
}

function runStatement(model: Model, text: string, params: unknown[]): { rows: unknown[] } {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (flat.includes("nextval('vehicle_financing_participations_id_seq')")) {
    return { rows: [{ id: model.nextParticipationId++ }] };
  }
  if (flat.includes("nextval('source_observations_id_seq')")) {
    return { rows: [{ id: model.nextObservationId++ }] };
  }
  if (flat.startsWith('SELECT id FROM financing_tranches')) return { rows: [] };
  if (flat.includes('FROM investments') && flat.includes('vehicle_participation_id')) {
    const [fundId, participationId] = params as [number, number];
    return {
      rows: model.investments
        .filter(
          (row) =>
            row['fund_id'] === fundId && row['vehicle_participation_id'] === participationId
        )
        .map((row) => ({ id: row['id'] })),
    };
  }
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT * FROM position_events') && flat.includes('idempotency_key')) {
    const [fundId, key] = params as [number, string];
    return {
      rows: model.positionEvents.filter(
        (row) => row['fund_id'] === fundId && row['idempotency_key'] === key
      ),
    };
  }
  if (flat.startsWith('SELECT * FROM vehicle_financing_participations') && flat.includes('FOR UPDATE')) {
    const [fundId, participationId] = params as [number, number];
    return {
      rows: model.participations.filter(
        (row) =>
          row['fund_id'] === fundId &&
          row['id'] === participationId &&
          row['superseded_by_participation_id'] === null
      ),
    };
  }
  if (flat.startsWith('SELECT * FROM vehicle_financing_participations')) {
    const [fundId, participationId] = params as [number, number];
    const currentOnly = flat.includes('superseded_by_participation_id IS NULL');
    return {
      rows: model.participations.filter(
        (row) =>
          row['fund_id'] === fundId &&
          row['id'] === participationId &&
          (!currentOnly || row['superseded_by_participation_id'] === null)
      ),
    };
  }
  if (flat.startsWith('SELECT t.*, e.company_identity_id')) {
    const [trancheId, fundId] = params as [number, number];
    return {
      rows: model.tranches.filter(
        (row) =>
          row['id'] === trancheId &&
          row['fund_id'] === fundId &&
          row['superseded_by_tranche_id'] === null
      ),
    };
  }
  if (flat.startsWith('SELECT pe.* FROM position_event_source_basis_reliefs')) {
    const [fundId, conversionEventId] = params as [number, number];
    const relief = model.sourceBasisReliefs.find(
      (row) =>
        row['fund_id'] === fundId &&
        row['conversion_position_event_id'] === conversionEventId &&
        row['capitalized_adjustment_position_event_id'] !== null
    );
    return {
      rows: model.positionEvents.filter(
        (row) => row['id'] === relief?.['capitalized_adjustment_position_event_id']
      ),
    };
  }
  if (flat.startsWith('SELECT pe.*')) {
    const [fundId, participationId] = params as [number, number];
    return {
      rows: model.positionEvents.filter(
        (row) =>
          row['fund_id'] === fundId &&
          row['vehicle_participation_id'] === participationId &&
          row['event_type'] === 'acquisition' &&
          !model.positionEvents.some(
            (candidate) =>
              candidate['fund_id'] === row['fund_id'] &&
              candidate['reverses_position_event_id'] === row['id']
          )
      ),
    };
  }
  if (flat.startsWith('SELECT id FROM investments') || flat.startsWith('SELECT id FROM investments WHERE')) {
    return { rows: [] };
  }
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.startsWith('SELECT id FROM investments')) return { rows: [] };
  if (flat.includes('FROM investments') && flat.includes('vehicle_participation_id')) {
    const [fundId, participationId] = params as [number, number];
    return { rows: model.investments.filter((row) => row['fund_id'] === fundId && row['vehicle_participation_id'] === participationId).map((row) => ({ id: row['id'] })) };
  }
  if (flat.startsWith('SELECT conversion_position_event_id')) {
    const [fundId, acquisitionId] = params as [number, number];
    return { rows: model.sourceBasisReliefs.filter((row) => row['fund_id'] === fundId && row['source_acquisition_position_event_id'] === acquisitionId) };
  }
  if (
    flat.startsWith('SELECT id FROM vehicle_financing_participations') &&
    flat.includes('AND id =')
  ) {
    const [fundId, participationId] = params as [number, number];
    return {
      rows: model.participations.filter(
        (row) =>
          row['fund_id'] === fundId &&
          row['id'] === participationId &&
          row['superseded_by_participation_id'] === null
      ),
    };
  }
  if (flat.startsWith('SELECT id FROM vehicle_financing_participations')) {
    const [fundId, vehicleId, eventId, trancheKey] = params as [number, number, number, string];
    return { rows: model.participations.filter((row) => row['fund_id'] === fundId && row['vehicle_id'] === vehicleId && row['financing_event_id'] === eventId && row['tranche_key'] === trancheKey && row['superseded_by_participation_id'] === null) };
  }
  if (flat.startsWith('SELECT id, investment_id, shares_acquired')) {
    const [investmentId] = params as [number];
    return {
      rows: model.lots
        .filter((row) => row['investment_id'] === investmentId && row['lot_type'] !== 'conversion')
        .sort((left, right) => String(left['id']).localeCompare(String(right['id']))),
    };
  }
  if (flat.startsWith('SELECT 1 FROM position_event_lot_reliefs')) {
    return { rows: model.lotReliefs.length > 0 ? [{ '?column?': 1 }] : [] };
  }
  if (flat.startsWith('INSERT INTO vehicle_financing_participations')) {
    const row = { ...parseInsert(flat, params), created_at: CREATED_AT };
    row['confirmed_duplicates'] = [];
    row['descriptive_terms'] = {};
    model.participations.push(row);
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO source_observations')) {
    const row = parseInsert(flat, params);
    model.observations.push(row);
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO position_events')) {
    const row = { ...parseInsert(flat, params), id: model.nextPositionEventId++, recorded_at: CREATED_AT };
    model.positionEvents.push(row);
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('INSERT INTO position_event_source_basis_reliefs')) {
    if (model.failSourceBasisReliefInsert) throw new Error('Injected source-basis relief failure.');
    const row = parseInsert(flat, params);
    model.sourceBasisReliefs.push(row);
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO position_event_lot_reliefs')) {
    model.lotReliefs.push(parseInsert(flat, params));
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO investment_lots')) {
    const row = {
      ...parseInsert(flat, params),
      id: '22222222-2222-4222-8222-222222222222',
      created_at: CREATED_AT,
    };
    model.lots.push(row);
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('UPDATE vehicle_financing_participations')) {
    const [observationId, fundId, participationId] = params as [number, number, number];
    const row = model.participations.find((candidate) => candidate['fund_id'] === fundId && candidate['id'] === participationId);
    if (row) row['source_observation_id'] = observationId;
    return { rows: row ? [row] : [] };
  }
  if (flat.startsWith('SELECT * FROM position_events') && flat.includes('event_type =')) {
    const [fundId, eventId] = params as [number, number];
    return { rows: model.positionEvents.filter((row) => row['fund_id'] === fundId && row['id'] === eventId && row['event_type'] === 'conversion') };
  }
  if (flat.startsWith('SELECT * FROM position_event_source_basis_reliefs')) {
    const [fundId, conversionEventId] = params as [number, number];
    return { rows: model.sourceBasisReliefs.filter((row) => row['fund_id'] === fundId && row['conversion_position_event_id'] === conversionEventId) };
  }
  if (flat.startsWith('SELECT investment_id, investment_lot_id')) {
    const [fundId, eventId] = params as [number, number];
    return { rows: model.lotReliefs.filter((row) => row['fund_id'] === fundId && row['position_event_id'] === eventId) };
  }
  if (flat.startsWith('SELECT id FROM investment_lots')) {
    const [participationId] = params as [number];
    return {
      rows: model.hideResultLotOnReload
        ? []
        : model.lots
            .filter(
              (row) =>
                row['vehicle_participation_id'] === participationId &&
                row['lot_type'] === 'conversion' &&
                row['imported_from'] === 'position_conversion'
            )
            .map((row) => ({ id: row['id'] })),
    };
  }

  return { rows: [] };
}

function makeDatabase(model: Model) {
  const database = {
    execute: async (query: unknown): Promise<{ rows: unknown[] }> => {
      const rendered = dialect.sqlToQuery(query as never);
      model.statements.push({ text: rendered.sql, params: rendered.params });
      return runStatement(model, rendered.sql, rendered.params);
    },
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = cloneModel(model);
      try {
        return await callback(database);
      } catch (error) {
        restoreModel(model, snapshot);
        throw error;
      }
    },
  };
  return database as never;
}

function conversionRequest(overrides: Record<string, unknown> = {}) {
  return {
    sourceParticipationId: SOURCE_PARTICIPATION_ID,
    resultingTrancheId: TARGET_TRANCHE_ID,
    effectiveDate: '2026-07-01',
    resultingSharesAcquired: '100.000000',
    accruedInterest: { mode: 'excluded' },
    currency: 'USD',
    ...overrides,
  };
}

function statementTexts(model: Model): string {
  return model.statements.map((statement) => statement.text.replace(/\s+/g, ' ')).join('\n');
}

function mutationCounts(source: Model): Record<string, number> {
  return {
    participations: source.participations.length,
    positionEvents: source.positionEvents.length,
    sourceBasisReliefs: source.sourceBasisReliefs.length,
    lotReliefs: source.lotReliefs.length,
    lots: source.lots.length,
    observations: source.observations.length,
  };
}

async function expectConversionFailure(
  setup: (source: Model) => void,
  expected: { status: number; code: string },
  request: Record<string, unknown> = {},
  idempotencyKey = `reject-${expected.code.toLowerCase()}`
): Promise<Model> {
  const localModel = emptyModel();
  setup(localModel);
  const before = mutationCounts(localModel);

  await expect(
    convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey,
      request: conversionRequest(request),
      database: makeDatabase(localModel),
    })
  ).rejects.toMatchObject(expected);

  expect(mutationCounts(localModel)).toEqual(before);
  expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  return localModel;
}

let model: Model;

beforeEach(() => {
  model = emptyModel();
  invalidateH9Artifacts.mockClear();
  resolveIdentityHead.mockReset();
  resolveIdentityHead.mockImplementation(
    async (_db: unknown, _fundId: number, identityId: number) => identityId
  );
});

describe('convertPosition', () => {
  it('converts a no-lot SAFE source with one source-basis receipt and conversion lot', async () => {
    const result = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-no-lot',
      request: conversionRequest(),
      database: makeDatabase(model),
    });

    expect(result.replayed).toBe(false);
    expect(result.value.reliefMode).toBe('source_basis');
    expect(result.value.resultingParticipation.economicOrigin).toBe('conversion_result');
    expect(result.value.sourceBasisRelief).toMatchObject({
      sourceAcquisitionPositionEventId: SOURCE_ACQUISITION_EVENT_ID,
      sourceAcquisitionCostBasis: '1000.000000',
      relievedCostBasis: '1000.000000',
      resultingEconomicOrigin: 'conversion_result',
    });
    expect(model.participations).toHaveLength(2);
    expect(model.sourceBasisReliefs).toHaveLength(1);
    expect(model.lotReliefs).toHaveLength(0);
    expect(model.observations[0]?.['normalized_payload']).toMatchObject({
      schemaVersion: 1,
      domain: 'ledger_event',
      measureKey: 'follow_on_investment',
      companyIdentity: { kind: 'name' },
      provenance: {
        source: 'position_conversion',
        sourceParticipationId: SOURCE_PARTICIPATION_ID,
        resultingTrancheId: TARGET_TRANCHE_ID,
      },
    });
    expect(model.lots).toContainEqual(
      expect.objectContaining({
        lot_type: 'conversion',
        imported_from: 'position_conversion',
        vehicle_participation_id: 601,
      })
    );
    expect(invalidateH9Artifacts).toHaveBeenCalledOnce();
    expect(statementTexts(model)).not.toMatch(/INSERT INTO (financing_events|financing_tranches|investments|investment_rounds|cash_flow_events)/);
    expect(statementTexts(model)).not.toMatch(/UPDATE (financing_events|financing_tranches|investments|investment_rounds|cash_flow_events)/);
    const texts = model.statements.map((statement) => statement.text.replace(/\s+/g, ' ').trim());
    const eventLockIndex = texts.findIndex(
      (text, index) =>
        text.includes('pg_advisory_xact_lock') &&
        model.statements[index]?.params[0] === `financing-event:${FUND_ID}:${SOURCE_EVENT_ID}`
    );
    const participationLockIndex = texts.findIndex(
      (text) =>
        text.startsWith('SELECT id FROM vehicle_financing_participations') &&
        text.includes('FOR UPDATE')
    );
    const acquisitionLock = texts.find(
      (text) => text.startsWith('SELECT pe.* FROM position_events pe') && text.includes('FOR UPDATE OF pe')
    );
    const lotLockIndex = texts.findIndex((text) =>
      text.startsWith('SELECT id, investment_id, shares_acquired')
    );
    const activeReliefIndex = texts.findIndex((text) =>
      text.startsWith('SELECT 1 FROM position_event_lot_reliefs')
    );
    const targetFamilyIndex = texts.findIndex(
      (text) =>
        text.startsWith('SELECT id FROM vehicle_financing_participations') &&
        text.includes('vehicle_id') &&
        text.includes('FOR UPDATE')
    );
    expect(eventLockIndex).toBeGreaterThanOrEqual(0);
    expect(participationLockIndex).toBeGreaterThan(eventLockIndex);
    expect(acquisitionLock).toContain('NOT EXISTS');
    expect(lotLockIndex).toBeGreaterThan(participationLockIndex);
    expect(activeReliefIndex).toBeGreaterThan(lotLockIndex);
    expect(targetFamilyIndex).toBeGreaterThan(activeReliefIndex);
  });

  it('converts a complete physical source-lot path with strict lot relief', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: INVESTMENT_ID,
      lot_type: 'initial',
      shares_acquired: '100.00000000',
      cost_basis_cents: 100000n,
    });

    const result = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-lot-backed',
      request: conversionRequest({
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      }),
      database: makeDatabase(model),
    });

    expect(result.value.reliefMode).toBe('specific_lots');
    expect(result.value.conversionEvent.sharesDelta).toBe('0.000000');
    expect(model.sourceBasisReliefs).toHaveLength(1);
    expect(model.lotReliefs).toEqual([
      expect.objectContaining({
        investment_id: INVESTMENT_ID,
        investment_lot_id: LOT_ID,
        relieved_shares: '100.000000',
        relieved_cost_basis: '1000.000000',
      }),
    ]);
  });

  it('treats source-lot reliefs as a deterministic set for hashing and writes', async () => {
    model.lots.push(
      {
        id: LOT_ID_TWO,
        investment_id: INVESTMENT_ID,
        lot_type: 'initial',
        shares_acquired: '60.00000000',
        cost_basis_cents: 60000n,
      },
      {
        id: LOT_ID,
        investment_id: INVESTMENT_ID,
        lot_type: 'initial',
        shares_acquired: '40.00000000',
        cost_basis_cents: 40000n,
      }
    );
    const descendingReliefs = [
      {
        investmentId: INVESTMENT_ID,
        investmentLotId: LOT_ID_TWO,
        relievedShares: '60.000000',
        relievedCostBasis: '600.000000',
      },
      {
        investmentId: INVESTMENT_ID,
        investmentLotId: LOT_ID,
        relievedShares: '40.000000',
        relievedCostBasis: '400.000000',
      },
    ];
    const ascendingReliefs = [...descendingReliefs].reverse();

    const first = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-set-order',
      request: conversionRequest({ sourceLotReliefs: descendingReliefs }),
      database: makeDatabase(model),
    });
    const eventCount = model.positionEvents.length;
    invalidateH9Artifacts.mockClear();

    const replay = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-set-order',
      request: conversionRequest({ sourceLotReliefs: ascendingReliefs }),
      database: makeDatabase(model),
    });

    expect(model.lotReliefs.map((row) => row['investment_lot_id'])).toEqual([
      LOT_ID,
      LOT_ID_TWO,
    ]);
    expect(replay).toEqual({ value: first.value, replayed: true });
    expect(model.positionEvents).toHaveLength(eventCount);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('replays by hash before head validation and never invalidates H9 on replay', async () => {
    const first = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-replay',
      request: conversionRequest(),
      database: makeDatabase(model),
    });
    invalidateH9Artifacts.mockClear();
    model.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)!['superseded_by_tranche_id'] = 999;
    resolveIdentityHead.mockResolvedValueOnce(999);

    const replay = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-replay',
      request: conversionRequest(),
      database: makeDatabase(model),
    });

    expect(replay).toEqual({ value: first.value, replayed: true });
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'convert-replay',
        request: conversionRequest({ resultingSharesAcquired: '101.000000' }),
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('makes capitalized-interest observation hashes unique to the conversion receipt', async () => {
    const request = conversionRequest({
      resultingSharesAcquired: '101.000000',
      accruedInterest: { mode: 'capitalized_with_adjustment', amount: '10.000000' },
    });

    const first = await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-interest-a',
      request,
      database: makeDatabase(model),
    });
    const firstAdjustmentHash = model.observations[0]?.['observation_hash'];
    expect(first.value.capitalizedAdjustmentEvent).toMatchObject({
      eventType: 'adjustment',
      costBasisDelta: '10.000000',
      sharesDelta: '0.000000',
      proceeds: '0.000000',
    });
    expect(first.value.sourceBasisRelief).toMatchObject({
      capitalizedAdjustmentCostBasis: '10.000000',
      relievedCostBasis: '1010.000000',
    });
    expect(first.value.resultingParticipation.participationAmount).toBe('1010.000000');
    expect(model.positionEvents.slice(1).map((event) => event['event_type'])).toEqual([
      'adjustment',
      'conversion',
    ]);
    expect(model.lots.at(-1)).toMatchObject({ cost_basis_cents: 101000n });

    model = emptyModel();
    invalidateH9Artifacts.mockClear();
    await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-interest-b',
      request,
      database: makeDatabase(model),
    });
    const secondAdjustmentHash = model.observations[0]?.['observation_hash'];

    expect(firstAdjustmentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondAdjustmentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondAdjustmentHash).not.toBe(firstAdjustmentHash);
  });

  it('rejects an idempotency key already owned by another position event type', async () => {
    model.positionEvents.push(
      basePositionEvent({
        id: 999,
        event_type: 'adjustment',
        idempotency_key: 'cross-event-key',
        request_hash: canonicalSha256({ seed: 'adjustment' }),
      })
    );

    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'cross-event-key',
        request: conversionRequest(),
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });

    expect(model.participations).toHaveLength(1);
    expect(model.positionEvents).toHaveLength(2);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'missing source participation',
      setup: (source: Model) => {
        source.participations = [];
      },
      expected: { status: 404, code: 'POSITION_CONVERSION_NOT_FOUND' },
    },
    {
      name: 'non-current source participation',
      setup: (source: Model) => {
        source.participations[0]!['superseded_by_participation_id'] = 999;
      },
      expected: { status: 404, code: 'POSITION_CONVERSION_NOT_FOUND' },
    },
    {
      name: 'conversion-result source participation',
      setup: (source: Model) => {
        source.participations[0]!['economic_origin'] = 'conversion_result';
      },
      expected: { status: 404, code: 'POSITION_CONVERSION_NOT_FOUND' },
    },
    {
      name: 'missing source acquisition receipt',
      setup: (source: Model) => {
        source.positionEvents = [];
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
    {
      name: 'reversed source acquisition receipt',
      setup: (source: Model) => {
        source.positionEvents.push(
          basePositionEvent({
            id: 710,
            event_type: 'reversal',
            reverses_position_event_id: SOURCE_ACQUISITION_EVENT_ID,
          })
        );
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
    {
      name: 'missing source compatibility investment',
      setup: (source: Model) => {
        source.investments = [];
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
    {
      name: 'source tranche is not SAFE or note',
      setup: (source: Model) => {
        source.tranches[0]!['security_type'] = 'equity';
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
  ])('rejects $name before mutation', async ({ setup, expected }) => {
    await expectConversionFailure(setup, expected);
  });

  it.each([
    {
      name: 'missing target tranche',
      setup: (source: Model) => {
        source.tranches = source.tranches.filter((row) => row['id'] !== TARGET_TRANCHE_ID);
      },
      expected: { status: 404, code: 'POSITION_CONVERSION_NOT_FOUND' },
    },
    {
      name: 'non-current target tranche',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)![
          'superseded_by_tranche_id'
        ] = 999;
      },
      expected: { status: 404, code: 'POSITION_CONVERSION_NOT_FOUND' },
    },
    {
      name: 'unpriced target tranche',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)!['price_per_share'] =
          null;
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
    {
      name: 'non-equity target tranche',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)!['security_type'] =
          'safe';
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
    },
    {
      name: 'cross-company target tranche',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)![
          'company_identity_id'
        ] = 12;
      },
      expected: { status: 409, code: 'POSITION_CONVERSION_CONFLICT' },
    },
    {
      name: 'occupied target participation family',
      setup: (source: Model) => {
        source.participations.push(
          baseParticipation({
            id: 602,
            financing_event_id: TARGET_EVENT_ID,
            tranche_key: 'series-a',
            financing_tranche_id: TARGET_TRANCHE_ID,
          })
        );
      },
      expected: { status: 409, code: 'POSITION_CONVERSION_CONFLICT' },
    },
  ])('rejects $name before mutation', async ({ setup, expected }) => {
    await expectConversionFailure(setup, expected);
  });

  it('rejects when source company identity is not current before mutation', async () => {
    resolveIdentityHead.mockResolvedValueOnce(12);

    await expectConversionFailure(
      () => undefined,
      { status: 409, code: 'POSITION_CONVERSION_CONFLICT' },
      {},
      'reject-stale-identity'
    );
  });

  it('rejects a prior source-basis receipt before mutation', async () => {
    await expectConversionFailure((source) => {
      source.sourceBasisReliefs.push({
        fund_id: FUND_ID,
        source_acquisition_position_event_id: SOURCE_ACQUISITION_EVENT_ID,
        conversion_position_event_id: 900,
      });
    }, { status: 409, code: 'POSITION_CONVERSION_CONFLICT' });
  });

  it.each([
    {
      name: 'incomplete source-lot relief set',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '40.000000',
            relievedCostBasis: '400.000000',
          },
        ],
      },
      setup: (source: Model) => {
        source.lots.push(
          {
            id: LOT_ID,
            investment_id: INVESTMENT_ID,
            lot_type: 'initial',
            shares_acquired: '40.00000000',
            cost_basis_cents: 40000n,
          },
          {
            id: LOT_ID_TWO,
            investment_id: INVESTMENT_ID,
            lot_type: 'initial',
            shares_acquired: '60.00000000',
            cost_basis_cents: 60000n,
          }
        );
      },
    },
    {
      name: 'duplicate source-lot relief',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '50.000000',
            relievedCostBasis: '500.000000',
          },
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '50.000000',
            relievedCostBasis: '500.000000',
          },
        ],
      },
      setup: (source: Model) => {
        source.lots.push(
          {
            id: LOT_ID,
            investment_id: INVESTMENT_ID,
            lot_type: 'initial',
            shares_acquired: '50.00000000',
            cost_basis_cents: 50000n,
          },
          {
            id: LOT_ID_TWO,
            investment_id: INVESTMENT_ID,
            lot_type: 'initial',
            shares_acquired: '50.00000000',
            cost_basis_cents: 50000n,
          }
        );
      },
    },
    {
      name: 'wrong investment source-lot relief',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID + 1,
            investmentLotId: LOT_ID,
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      },
      setup: (source: Model) => {
        source.lots.push({
          id: LOT_ID,
          investment_id: INVESTMENT_ID,
          lot_type: 'initial',
          shares_acquired: '100.00000000',
          cost_basis_cents: 100000n,
        });
      },
    },
    {
      name: 'wrong lot id source-lot relief',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID_TWO,
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      },
      setup: (source: Model) => {
        source.lots.push({
          id: LOT_ID,
          investment_id: INVESTMENT_ID,
          lot_type: 'initial',
          shares_acquired: '100.00000000',
          cost_basis_cents: 100000n,
        });
      },
    },
    {
      name: 'lot basis does not equal source acquisition basis',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '100.000000',
            relievedCostBasis: '999.000000',
          },
        ],
      },
      setup: (source: Model) => {
        source.lots.push({
          id: LOT_ID,
          investment_id: INVESTMENT_ID,
          lot_type: 'initial',
          shares_acquired: '100.00000000',
          cost_basis_cents: 99900n,
        });
      },
    },
    {
      name: 'no-lot source cannot supply source-lot relief',
      request: {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      },
      setup: () => undefined,
    },
  ])('rejects $name before mutation', async ({ setup, request }) => {
    await expectConversionFailure(
      setup,
      { status: 409, code: 'POSITION_CONVERSION_CONFLICT' },
      request
    );
  });

  it('rejects smallest 8dp source-lot precision loss before mutation', async () => {
    await expectConversionFailure(
      (source) => {
        source.lots.push({
          id: LOT_ID,
          investment_id: INVESTMENT_ID,
          lot_type: 'initial',
          shares_acquired: '100.00000001',
          cost_basis_cents: 100000n,
        });
      },
      { status: 422, code: 'POSITION_CONVERSION_PRECISION_LOSS' },
      {
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '100.000000',
            relievedCostBasis: '1000.000000',
          },
        ],
      },
      'reject-8dp-source-lot'
    );
  });

  it.each([
    {
      name: 'zero target price',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)![
          'price_per_share'
        ] = '0.000000';
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_INELIGIBLE' },
      request: {},
    },
    {
      name: 'sub-cent target price',
      setup: (source: Model) => {
        source.tranches.find((row) => row['id'] === TARGET_TRANCHE_ID)![
          'price_per_share'
        ] = '10.000001';
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_PRECISION_LOSS' },
      request: {},
    },
    {
      name: 'result price equation mismatch',
      setup: () => undefined,
      expected: { status: 422, code: 'POSITION_CONVERSION_PRECISION_LOSS' },
      request: { resultingSharesAcquired: '99.999999' },
    },
    {
      name: 'sub-cent result basis',
      setup: (source: Model) => {
        source.positionEvents[0]!['cost_basis_delta'] = '1000.000001';
      },
      expected: { status: 422, code: 'POSITION_CONVERSION_PRECISION_LOSS' },
      request: {},
    },
  ])('rejects $name before mutation', async ({ setup, expected, request }) => {
    await expectConversionFailure(setup, expected, request);
  });

  it('rolls back all conversion rows when final relief persistence fails', async () => {
    model.failSourceBasisReliefInsert = true;

    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'convert-rollback',
        request: conversionRequest(),
        database: makeDatabase(model),
      })
    ).rejects.toThrow('Injected source-basis relief failure.');

    expect(model.participations).toHaveLength(1);
    expect(model.positionEvents).toHaveLength(1);
    expect(model.sourceBasisReliefs).toHaveLength(0);
    expect(model.lotReliefs).toHaveLength(0);
    expect(model.lots).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('rolls back and skips H9 invalidation when receipt reload fails', async () => {
    model.hideResultLotOnReload = true;

    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'convert-reload-fail',
        request: conversionRequest(),
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({ status: 500, code: 'LEDGER_WRITE_FAILED' });

    expect(model.participations).toHaveLength(1);
    expect(model.positionEvents).toHaveLength(1);
    expect(model.sourceBasisReliefs).toHaveLength(0);
    expect(model.lotReliefs).toHaveLength(0);
    expect(model.lots).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('locks financing events, tranches, and source lots in deterministic order', async () => {
    const targetTrancheId = 499;
    const targetEventId = 99;
    model.tranches = [
      baseTranche(),
      baseTranche({
        id: targetTrancheId,
        financing_event_id: targetEventId,
        tranche_key: 'seed',
        security_type: 'equity',
        price_per_share: '10.000000',
        post_money_valuation: '10000000.000000',
        valuation_cap: null,
      }),
    ];
    model.lots.push(
      {
        id: LOT_ID_TWO,
        investment_id: INVESTMENT_ID,
        lot_type: 'initial',
        shares_acquired: '60.00000000',
        cost_basis_cents: 60000n,
      },
      {
        id: LOT_ID,
        investment_id: INVESTMENT_ID,
        lot_type: 'initial',
        shares_acquired: '40.00000000',
        cost_basis_cents: 40000n,
      }
    );

    await convertPosition({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'convert-lock-order',
      request: conversionRequest({
        resultingTrancheId: targetTrancheId,
        sourceLotReliefs: [
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID_TWO,
            relievedShares: '60.000000',
            relievedCostBasis: '600.000000',
          },
          {
            investmentId: INVESTMENT_ID,
            investmentLotId: LOT_ID,
            relievedShares: '40.000000',
            relievedCostBasis: '400.000000',
          },
        ],
      }),
      database: makeDatabase(model),
    });

    const financingEventLocks = model.statements
      .filter((statement) => statement.text.includes('pg_advisory_xact_lock'))
      .map((statement) => statement.params[0]);
    const trancheLock = model.statements.find((statement) =>
      statement.text.includes('FROM financing_tranches') &&
      statement.text.includes('FOR UPDATE') &&
      statement.params.includes(targetTrancheId)
    );

    expect(financingEventLocks).toEqual([
      `fund-identity:${FUND_ID}`,
      `financing-event:${FUND_ID}:${targetEventId}`,
      `financing-event:${FUND_ID}:${SOURCE_EVENT_ID}`,
    ]);
    expect(trancheLock?.params).toEqual([FUND_ID, targetTrancheId, SOURCE_TRANCHE_ID]);
    expect(model.lotReliefs.map((row) => row['investment_lot_id'])).toEqual([
      LOT_ID,
      LOT_ID_TWO,
    ]);
  });

  it('rejects forbidden no-lot and precision paths before mutation', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: INVESTMENT_ID,
      lot_type: 'initial',
      shares_acquired: '100.00000000',
      cost_basis_cents: 100000n,
    });

    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'convert-no-lot-with-lot',
        request: conversionRequest(),
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({ status: 409, code: 'POSITION_CONVERSION_CONFLICT' });

    const precisionModel = emptyModel();
    await expect(
      convertPosition({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'convert-subcent',
        request: conversionRequest({
          accruedInterest: { mode: 'capitalized_with_adjustment', amount: '0.000001' },
        }),
        database: makeDatabase(precisionModel),
      })
    ).rejects.toMatchObject({ status: 422, code: 'POSITION_CONVERSION_PRECISION_LOSS' });
    expect(precisionModel.participations).toHaveLength(1);
  });
});
