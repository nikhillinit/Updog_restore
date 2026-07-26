import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rowVersionETag } from '../../../../server/lib/http-preconditions';

const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));

vi.mock('../../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

import {
  correctPosition,
  recordPositionEvent,
} from '../../../../server/services/investment-ledger/position-service';

const dialect = new PgDialect();
const FUND_ID = 7;
const VEHICLE_ID = 41;
const IDENTITY_ID = 11;
const ACTOR_ID = 3;
const CREATED_AT = new Date('2026-03-01T00:00:00.000Z');
const LOT_ID = '11111111-1111-4111-8111-111111111111';

interface Statement {
  text: string;
  params: unknown[];
}

interface IdentityRow {
  id: number;
  fund_id: number;
  merged_into_identity_id: number | null;
  canonical_name: string;
}

interface LotRow {
  id: string;
  investment_id: number;
  fund_id: number;
  shares_acquired: string;
  cost_basis_cents: bigint;
}

interface Model {
  identities: IdentityRow[];
  lots: LotRow[];
  positionEvents: Array<Record<string, unknown>>;
  reliefs: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  reconciliationCases: Array<Record<string, unknown>>;
  statements: Statement[];
  nextPositionEventId: number;
  nextObservationId: number;
  nextReconciliationCaseId: number;
  owned: boolean;
  failReliefInsert: boolean;
  failReconciliationCaseInsert: boolean;
}

interface ModelSnapshot {
  identities: IdentityRow[];
  lots: LotRow[];
  positionEvents: Array<Record<string, unknown>>;
  reliefs: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  reconciliationCases: Array<Record<string, unknown>>;
  nextPositionEventId: number;
  nextObservationId: number;
  nextReconciliationCaseId: number;
  owned: boolean;
  failReliefInsert: boolean;
  failReconciliationCaseInsert: boolean;
}

function emptyModel(): Model {
  return {
    identities: [
      {
        id: IDENTITY_ID,
        fund_id: FUND_ID,
        merged_into_identity_id: null,
        canonical_name: 'Acme Robotics',
      },
    ],
    lots: [],
    positionEvents: [],
    reliefs: [],
    observations: [],
    reconciliationCases: [],
    statements: [],
    nextPositionEventId: 1300,
    nextObservationId: 1200,
    nextReconciliationCaseId: 1400,
    owned: true,
    failReliefInsert: false,
    failReconciliationCaseInsert: false,
  };
}

function cloneRecords<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function snapshotModel(model: Model): ModelSnapshot {
  return {
    identities: model.identities.map((row) => ({ ...row })),
    lots: model.lots.map((row) => ({ ...row })),
    positionEvents: cloneRecords(model.positionEvents),
    reliefs: cloneRecords(model.reliefs),
    observations: cloneRecords(model.observations),
    reconciliationCases: cloneRecords(model.reconciliationCases),
    nextPositionEventId: model.nextPositionEventId,
    nextObservationId: model.nextObservationId,
    nextReconciliationCaseId: model.nextReconciliationCaseId,
    owned: model.owned,
    failReliefInsert: model.failReliefInsert,
    failReconciliationCaseInsert: model.failReconciliationCaseInsert,
  };
}

function restoreModel(model: Model, snapshot: ModelSnapshot): void {
  model.identities = snapshot.identities.map((row) => ({ ...row }));
  model.lots = snapshot.lots.map((row) => ({ ...row }));
  model.positionEvents = cloneRecords(snapshot.positionEvents);
  model.reliefs = cloneRecords(snapshot.reliefs);
  model.observations = cloneRecords(snapshot.observations);
  model.reconciliationCases = cloneRecords(snapshot.reconciliationCases);
  model.nextPositionEventId = snapshot.nextPositionEventId;
  model.nextObservationId = snapshot.nextObservationId;
  model.nextReconciliationCaseId = snapshot.nextReconciliationCaseId;
  model.owned = snapshot.owned;
  model.failReliefInsert = snapshot.failReliefInsert;
  model.failReconciliationCaseInsert = snapshot.failReconciliationCaseInsert;
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
  if (/^'.*'$/.test(bare)) return bare.slice(1, -1);
  return bare;
}

function parseInsert(flat: string, params: unknown[]): Record<string, unknown> {
  const columnStart = flat.indexOf('(');
  const columnEnd = flat.indexOf(')', columnStart);
  const columns = splitTopLevel(flat.slice(columnStart + 1, columnEnd)).map((column) =>
    column.replace(/"/g, '').trim()
  );
  const valuesStart = flat.indexOf('(', flat.indexOf('VALUES'));
  const valuesEnd = flat.indexOf(')', valuesStart);
  const values = splitTopLevel(flat.slice(valuesStart + 1, valuesEnd));
  const row: Record<string, unknown> = {};
  columns.forEach((column, index) => {
    row[column] = literalValue(values[index] ?? 'NULL', params);
  });
  return row;
}

function identityChain(model: Model, startId: number, fundId: number): IdentityRow[] {
  const rows: IdentityRow[] = [];
  const seen = new Set<number>();
  let currentId: number | null = startId;
  while (currentId !== null && !seen.has(currentId)) {
    seen.add(currentId);
    const row = model.identities.find(
      (candidate) => candidate.id === currentId && candidate.fund_id === fundId
    );
    if (!row) break;
    rows.push(row);
    currentId = row.merged_into_identity_id;
  }
  return rows;
}

function runStatement(model: Model, text: string, params: unknown[]): { rows: unknown[] } {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (flat.includes("nextval('source_observations_id_seq')")) {
    return { rows: [{ id: model.nextObservationId++ }] };
  }
  if (flat.startsWith('WITH RECURSIVE chain AS')) {
    const [startId, fundId] = params as [number, number];
    return {
      rows: identityChain(model, startId, fundId).map((row) => ({
        id: row.id,
        merged_into_identity_id: row.merged_into_identity_id,
      })),
    };
  }
  if (flat.startsWith('SELECT canonical_name FROM company_identities')) {
    const [identityId, fundId] = params as [number, number];
    const row = model.identities.find(
      (candidate) =>
        candidate.id === identityId &&
        candidate.fund_id === fundId &&
        candidate.merged_into_identity_id === null
    );
    return { rows: row ? [{ canonical_name: row.canonical_name }] : [] };
  }
  if (flat.startsWith('SELECT l.id, l.investment_id')) {
    const lotIds = params.filter(
      (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
    ) as string[];
    const numericParams = params.filter((value): value is number => typeof value === 'number');
    const fundId = numericParams[numericParams.length - 1] as number;
    const investmentIds = numericParams.slice(0, -1);
    return {
      rows: model.lots
        .filter(
          (lot) =>
            lotIds.includes(lot.id) &&
            investmentIds.includes(lot.investment_id) &&
            lot.fund_id === fundId
        )
        .map((lot) => ({
          id: lot.id,
          investment_id: lot.investment_id,
          shares_acquired: lot.shares_acquired,
          cost_basis_cents: lot.cost_basis_cents,
        })),
    };
  }
  if (flat.startsWith('SELECT r.investment_id, r.investment_lot_id')) {
    const lotIds = params.filter(
      (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
    ) as string[];
    const fundId = params.find((value) => typeof value === 'number') as number;
    const numericParams = params.filter((value): value is number => typeof value === 'number');
    const excludedPositionEventId = flat.includes('source_event.id <>')
      ? numericParams[numericParams.length - 1]
      : undefined;
    const activeReliefs = model.reliefs.filter((relief) => {
      if (relief['fund_id'] !== fundId) return false;
      if (!lotIds.includes(String(relief['investment_lot_id']))) return false;
      if (relief['position_event_id'] === excludedPositionEventId) return false;
      return !model.positionEvents.some(
        (event) =>
          event['fund_id'] === fundId &&
          event['reverses_position_event_id'] === relief['position_event_id']
      );
    });
    const totals = new Map<
      string,
      {
        investment_id: number;
        investment_lot_id: string;
        relieved_shares: string;
        relieved_cost_basis: string;
      }
    >();
    for (const relief of activeReliefs) {
      const key = `${String(relief['investment_id'])}:${String(relief['investment_lot_id'])}`;
      const current = totals.get(key) ?? {
        investment_id: Number(relief['investment_id']),
        investment_lot_id: String(relief['investment_lot_id']),
        relieved_shares: '0.000000',
        relieved_cost_basis: '0.000000',
      };
      current.relieved_shares = (
        Number(current.relieved_shares) + Number(relief['relieved_shares'])
      ).toFixed(6);
      current.relieved_cost_basis = (
        Number(current.relieved_cost_basis) + Number(relief['relieved_cost_basis'])
      ).toFixed(6);
      totals.set(key, current);
    }
    return { rows: [...totals.values()] };
  }
  if (flat.startsWith('SELECT investment_id, investment_lot_id')) {
    const [fundId, positionEventId] = params as [number, number];
    return {
      rows: model.reliefs
        .filter(
          (relief) =>
            relief['fund_id'] === fundId && relief['position_event_id'] === positionEventId
        )
        .map((relief) => ({
          investment_id: relief['investment_id'],
          investment_lot_id: relief['investment_lot_id'],
        })),
    };
  }
  if (flat.startsWith('SELECT * FROM position_events') && flat.includes('idempotency_key')) {
    const [fundId, idempotencyKey] = params as [number, string];
    const row = model.positionEvents.find(
      (candidate) =>
        candidate['fund_id'] === fundId && candidate['idempotency_key'] === idempotencyKey
    );
    return { rows: row ? [row] : [] };
  }
  if (flat.startsWith('SELECT * FROM position_events') && flat.includes('WHERE id =')) {
    const [eventId, fundId] = params as [number, number];
    const row = model.positionEvents.find(
      (candidate) => candidate['id'] === eventId && candidate['fund_id'] === fundId
    );
    return { rows: row ? [row] : [] };
  }
  if (
    flat.startsWith('SELECT *, xmin::text AS xmin FROM position_events') &&
    flat.includes('FOR UPDATE')
  ) {
    const [eventId, fundId] = params as [number, number];
    const row = model.positionEvents.find(
      (candidate) => candidate['id'] === eventId && candidate['fund_id'] === fundId
    );
    return { rows: row ? [row] : [] };
  }
  if (
    flat.startsWith('SELECT * FROM position_events') &&
    flat.includes('reverses_position_event_id')
  ) {
    const [fundId, targetEventId] = params as [number, number];
    const row = model.positionEvents.find(
      (candidate) =>
        candidate['fund_id'] === fundId && candidate['reverses_position_event_id'] === targetEventId
    );
    return { rows: row ? [row] : [] };
  }
  if (flat.startsWith('INSERT INTO source_observations')) {
    const row = parseInsert(flat, params);
    model.observations.push(row);
    return { rows: [{ id: row['id'] }] };
  }
  if (flat.startsWith('INSERT INTO position_events')) {
    const parsed = parseInsert(flat, params);
    const duplicate = model.positionEvents.find(
      (candidate) =>
        candidate['fund_id'] === parsed['fund_id'] &&
        candidate['idempotency_key'] === parsed['idempotency_key']
    );
    if (duplicate) return { rows: [] };
    const row = {
      ...parsed,
      id: model.nextPositionEventId++,
      recorded_at: CREATED_AT,
    };
    model.positionEvents.push(row);
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('INSERT INTO position_event_lot_reliefs')) {
    if (model.failReliefInsert) {
      throw new Error('Injected position-event lot-relief failure.');
    }
    const row = parseInsert(flat, params);
    model.reliefs.push(row);
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO reconciliation_cases')) {
    if (model.failReconciliationCaseInsert) {
      throw new Error('Injected reconciliation-case failure.');
    }
    const row = {
      ...parseInsert(flat, params),
      id: model.nextReconciliationCaseId++,
    };
    model.reconciliationCases.push(row);
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('SELECT id FROM reconciliation_cases')) {
    const [fundId, observationId] = params as [number, number];
    const row = [...model.reconciliationCases]
      .reverse()
      .find(
        (candidate) =>
          candidate['fund_id'] === fundId &&
          candidate['source_observation_id'] === observationId &&
          candidate['case_type'] === 'observation_match'
      );
    return { rows: row ? [{ id: row['id'] }] : [] };
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
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (model.owned ? [{ id: 1 }] : []),
        }),
      }),
    }),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
      const snapshot = snapshotModel(model);
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

function acquisitionRequest(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE_ID,
    companyIdentityId: IDENTITY_ID,
    eventType: 'acquisition',
    effectiveDate: '2026-02-01',
    currency: 'USD',
    sharesDelta: '10.00000000',
    costBasisDelta: '100.000000',
    proceeds: '0.000000',
    ...overrides,
  };
}

function realizationRequest(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE_ID,
    companyIdentityId: IDENTITY_ID,
    eventType: 'realization',
    effectiveDate: '2026-02-15',
    currency: 'USD',
    sharesDelta: '-4.00000000',
    costBasisDelta: '-40.000000',
    proceeds: '60.000000',
    lotReliefs: [
      {
        investmentId: 800,
        investmentLotId: LOT_ID,
        relievedShares: '4.00000000',
        relievedCostBasis: '40.000000',
        allocatedProceeds: '60.000000',
      },
    ],
    ...overrides,
  };
}

async function recordEvent(
  idempotencyKey = 'position-acquisition-1',
  request: unknown = acquisitionRequest()
) {
  return recordPositionEvent({
    fundId: FUND_ID,
    actorId: ACTOR_ID,
    idempotencyKey,
    request,
    database: makeDatabase(model),
  });
}

function seedPositionEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const row = {
    id: 1299,
    fund_id: FUND_ID,
    vehicle_id: VEHICLE_ID,
    company_identity_id: IDENTITY_ID,
    event_type: 'realization',
    effective_date: '2026-02-15',
    recorded_at: new Date('2026-02-16T00:00:00.000Z'),
    xmin: '101',
    shares_delta: '-4.000000',
    cost_basis_delta: '-40.000000',
    proceeds: '60.000000',
    replaces_event_id: null,
    reverses_position_event_id: null,
    vehicle_participation_id: null,
    resulting_participation_id: null,
    source_participation_version: null,
    resulting_participation_version: null,
    source_tranche_version: null,
    resulting_tranche_version: null,
    source_observation_id: 1199,
    backfilled_from_investment_id: null,
    created_by: ACTOR_ID,
    idempotency_key: 'position-realization-original',
    request_hash: 'a'.repeat(64),
    ...overrides,
  };
  model.positionEvents.push(row);
  return row;
}

async function correctEvent(
  idempotencyKey = 'position-correction-1',
  request: unknown = {
    positionEventId: 1299,
    currency: 'USD',
    sharesDelta: '-3.00000000',
    costBasisDelta: '-30.000000',
    proceeds: '55.000000',
    lotReliefs: [
      {
        investmentId: 800,
        investmentLotId: LOT_ID,
        relievedShares: '3.00000000',
        relievedCostBasis: '30.000000',
        allocatedProceeds: '55.000000',
      },
    ],
  },
  ifMatch = rowVersionETag('101')
) {
  return correctPosition({
    fundId: FUND_ID,
    actorId: ACTOR_ID,
    idempotencyKey,
    ifMatch,
    request,
    database: makeDatabase(model),
  });
}

function statementsMatching(model: Model, needle: string): Statement[] {
  return model.statements.filter((statement) =>
    statement.text.replace(/\s+/g, ' ').includes(needle)
  );
}

function foldPositionEconomics(
  rows: Array<Record<string, unknown>>,
  knowledgeCutoff: Date
): { shares: number; costBasis: number; proceeds: number } {
  return rows
    .filter((row) => {
      const recordedAt = row['recorded_at'];
      return recordedAt instanceof Date && recordedAt <= knowledgeCutoff;
    })
    .reduce(
      (total, row) => ({
        shares: total.shares + Number(row['shares_delta']),
        costBasis: total.costBasis + Number(row['cost_basis_delta']),
        proceeds: total.proceeds + Number(row['proceeds']),
      }),
      { shares: 0, costBasis: 0, proceeds: 0 }
    );
}

let model: Model;

beforeEach(() => {
  model = emptyModel();
  invalidateH9Artifacts.mockClear();
});

describe('recordPositionEvent', () => {
  it('records a manual acquisition with accepted observation lineage', async () => {
    const result = await recordEvent();

    expect(result.replayed).toBe(false);
    expect(result.value).toMatchObject({
      fundId: FUND_ID,
      vehicleId: VEHICLE_ID,
      companyIdentityId: IDENTITY_ID,
      eventType: 'acquisition',
      effectiveDate: '2026-02-01',
      sharesDelta: '10.000000',
      costBasisDelta: '100.000000',
      proceeds: '0.000000',
      replacesEventId: null,
      reversesPositionEventId: null,
      vehicleParticipationId: null,
      resultingParticipationId: null,
      sourceParticipationVersion: null,
      resultingParticipationVersion: null,
      sourceTrancheVersion: null,
      resultingTrancheVersion: null,
      sourceObservationId: 1200,
      createdBy: ACTOR_ID,
      idempotencyKey: 'position-acquisition-1',
      requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(model.positionEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
    expect(model.observations[0]).toMatchObject({
      fund_id: FUND_ID,
      company_identity_id: IDENTITY_ID,
      source_type: 'manual',
      status: 'accepted',
    });
    expect(model.positionEvents[0]).toMatchObject({
      fund_id: FUND_ID,
      vehicle_id: VEHICLE_ID,
      company_identity_id: IDENTITY_ID,
      event_type: 'acquisition',
      source_observation_id: 1200,
      idempotency_key: 'position-acquisition-1',
      replaces_event_id: null,
      reverses_position_event_id: null,
      resulting_participation_id: null,
      source_participation_version: null,
      resulting_participation_version: null,
      source_tranche_version: null,
      resulting_tranche_version: null,
    });
    expect(model.positionEvents[0]?.['request_hash']).toMatch(/^[a-f0-9]{64}$/);
    expect(statementsMatching(model, 'INSERT INTO position_events')[0]?.text).not.toContain(
      'recorded_at'
    );
    expect(invalidateH9Artifacts).toHaveBeenCalledOnce();
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('records a realization only when its event economics conserve lot relief', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });

    const result = await recordEvent('position-realization-1', realizationRequest());

    expect(result.value).toMatchObject({
      eventType: 'realization',
      sharesDelta: '-4.000000',
      costBasisDelta: '-40.000000',
      proceeds: '60.000000',
    });
    expect(model.reliefs).toEqual([
      expect.objectContaining({
        fund_id: FUND_ID,
        position_event_id: 1300,
        investment_id: 800,
        investment_lot_id: LOT_ID,
        relieved_shares: '4.000000',
        relieved_cost_basis: '40.000000',
        allocated_proceeds: '60.000000',
      }),
    ]);
    const fundLockIndex = model.statements.findIndex(
      (statement) =>
        statement.text.includes('pg_advisory_xact_lock') &&
        statement.params.includes(`fund-identity:${FUND_ID}`)
    );
    const lotLockIndex = model.statements.findIndex(
      (statement) =>
        statement.text.includes('FROM investment_lots') && statement.text.includes('FOR UPDATE')
    );
    expect(fundLockIndex).toBeGreaterThanOrEqual(0);
    expect(lotLockIndex).toBeGreaterThan(fundLockIndex);
  });

  it('rejects over-relief without persisting an event or relief row', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '3.00000000',
      cost_basis_cents: 3000n,
    });

    await expect(recordEvent('position-over-relief', realizationRequest())).rejects.toMatchObject({
      status: 422,
      code: 'LOT_RELIEF_EXCEEDED',
    });

    expect(model.positionEvents).toHaveLength(0);
    expect(model.reliefs).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('includes active prior relief when enforcing lot capacity', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '5.00000000',
      cost_basis_cents: 5000n,
    });
    model.positionEvents.push({
      id: 1299,
      fund_id: FUND_ID,
      event_type: 'realization',
      reverses_position_event_id: null,
      idempotency_key: 'prior-realization',
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '2.000000',
      relieved_cost_basis: '20.000000',
      allocated_proceeds: '25.000000',
    });

    await expect(
      recordEvent('position-cumulative-over-relief', realizationRequest())
    ).rejects.toMatchObject({
      status: 422,
      code: 'LOT_RELIEF_EXCEEDED',
    });

    expect(model.positionEvents).toHaveLength(1);
    expect(model.reliefs).toHaveLength(1);
    expect(model.observations).toHaveLength(0);
  });

  it('rejects realization economics that do not exactly match relief sums', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });

    await expect(
      recordEvent('position-conservation-failure', realizationRequest({ proceeds: '59.000000' }))
    ).rejects.toMatchObject({
      status: 422,
      code: 'POSITION_EVENT_CONSERVATION_VIOLATION',
    });

    expect(model.positionEvents).toHaveLength(0);
    expect(model.reliefs).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
  });

  it('rolls back observation and event when lot-relief persistence fails', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.failReliefInsert = true;

    await expect(
      recordEvent('position-relief-insert-failure', realizationRequest())
    ).rejects.toThrow('Injected position-event lot-relief failure.');

    expect(statementsMatching(model, 'INSERT INTO source_observations')).toHaveLength(1);
    expect(statementsMatching(model, 'INSERT INTO position_events')).toHaveLength(1);
    expect(statementsMatching(model, 'INSERT INTO position_event_lot_reliefs')).toHaveLength(1);
    expect(model.observations).toHaveLength(0);
    expect(model.positionEvents).toHaveLength(0);
    expect(model.reliefs).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('records a write-off with zero event and allocated proceeds', async () => {
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });

    const result = await recordEvent('position-write-off-1', {
      ...realizationRequest(),
      eventType: 'write_off',
      sharesDelta: '-2.00000000',
      costBasisDelta: '-20.000000',
      proceeds: '0.000000',
      lotReliefs: [
        {
          investmentId: 800,
          investmentLotId: LOT_ID,
          relievedShares: '2.00000000',
          relievedCostBasis: '20.000000',
          allocatedProceeds: '0.000000',
        },
      ],
    });

    expect(result.value).toMatchObject({
      eventType: 'write_off',
      sharesDelta: '-2.000000',
      costBasisDelta: '-20.000000',
      proceeds: '0.000000',
    });
    expect(model.reliefs[0]).toMatchObject({
      allocated_proceeds: '0.000000',
    });
  });

  it('replays an exact key once and rejects changed payload reuse', async () => {
    const first = await recordEvent('position-replay-1');
    invalidateH9Artifacts.mockClear();

    const replay = await recordEvent('position-replay-1');

    expect(replay).toEqual({ value: first.value, replayed: true });
    expect(model.positionEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();

    await expect(
      recordEvent('position-replay-1', acquisitionRequest({ costBasisDelta: '101.000000' }))
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(model.positionEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
  });

  it('rejects a merged non-head company identity with zero persistence', async () => {
    model.identities.unshift({
      id: 10,
      fund_id: FUND_ID,
      merged_into_identity_id: IDENTITY_ID,
      canonical_name: 'Acme Robotics Legacy',
    });

    await expect(
      recordEvent('position-stale-identity', acquisitionRequest({ companyIdentityId: 10 }))
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDENTITY_NOT_CURRENT',
      details: {
        companyIdentityId: 10,
        identityHead: IDENTITY_ID,
      },
    });

    expect(model.positionEvents).toHaveLength(0);
    expect(model.reliefs).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('records a signed adjustment without lot relief or proceeds', async () => {
    const result = await recordEvent('position-adjustment-1', {
      ...acquisitionRequest(),
      eventType: 'adjustment',
      sharesDelta: '-1.25000000',
      costBasisDelta: '12.500000',
    });

    expect(result.value).toMatchObject({
      eventType: 'adjustment',
      sharesDelta: '-1.250000',
      costBasisDelta: '12.500000',
      proceeds: '0.000000',
    });
    expect(model.reliefs).toHaveLength(0);
  });

  it('rejects non-USD position money before transaction persistence', async () => {
    await expect(
      recordEvent('position-non-usd', acquisitionRequest({ currency: 'EUR' }))
    ).rejects.toMatchObject({
      status: 422,
      code: 'NON_USD_VALUE_UNSUPPORTED',
    });

    expect(model.positionEvents).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(model.statements).toHaveLength(0);
  });
});

describe('correctPosition', () => {
  it('rejects a stale If-Match with zero persisted rows', async () => {
    seedPositionEvent();
    const before = cloneRecords(model.positionEvents);

    await expect(
      correctEvent('position-correction-stale', undefined, rowVersionETag('100'))
    ).rejects.toMatchObject({
      status: 412,
      code: 'precondition_failed',
    });

    expect(model.positionEvents).toEqual(before);
    expect(model.reliefs).toHaveLength(0);
    expect(model.observations).toHaveLength(0);
    expect(model.reconciliationCases).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('rejects participation-backed compat corrections so callers use ledger-corrections', async () => {
    seedPositionEvent({ vehicle_participation_id: 900 });

    await expect(correctEvent('position-correction-participation')).rejects.toMatchObject({
      status: 409,
      code: 'POSITION_EVENT_NOT_CORRECTABLE',
    });

    expect(model.positionEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(0);
    expect(statementsMatching(model, 'UPDATE investments')).toHaveLength(0);
  });

  it('rejects backfill-backed compat corrections until the backfill writer owns compensation', async () => {
    seedPositionEvent({ backfilled_from_investment_id: 800 });

    await expect(correctEvent('position-correction-backfill')).rejects.toMatchObject({
      status: 409,
      code: 'POSITION_EVENT_NOT_CORRECTABLE',
    });

    expect(model.positionEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(0);
    expect(statementsMatching(model, 'UPDATE investments')).toHaveLength(0);
  });

  it('reverses stored economics exactly and appends corrected replacement lineage', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });

    const result = await correctEvent();

    expect(result.replayed).toBe(false);
    expect(result.value.reversal).toMatchObject({
      eventType: 'reversal',
      sharesDelta: '4.000000',
      costBasisDelta: '40.000000',
      proceeds: '-60.000000',
      reversesPositionEventId: 1299,
      replacesEventId: null,
    });
    expect(result.value.replacement).toMatchObject({
      eventType: 'realization',
      sharesDelta: '-3.000000',
      costBasisDelta: '-30.000000',
      proceeds: '55.000000',
      replacesEventId: 1299,
      reversesPositionEventId: null,
    });
    expect(
      Number(result.value.reversal.sharesDelta) + Number(model.positionEvents[0]?.['shares_delta'])
    ).toBe(0);
    expect(
      Number(result.value.reversal.costBasisDelta) +
        Number(model.positionEvents[0]?.['cost_basis_delta'])
    ).toBe(0);
    expect(
      Number(result.value.reversal.proceeds) + Number(model.positionEvents[0]?.['proceeds'])
    ).toBe(0);
    expect(result.value.reversal.sourceObservationId).toBe(
      result.value.replacement.sourceObservationId
    );
    expect(model.observations).toHaveLength(1);
    expect(model.reconciliationCases).toContainEqual(
      expect.objectContaining({
        id: result.value.reconciliationCaseId,
        fund_id: FUND_ID,
        source_observation_id: result.value.replacement.sourceObservationId,
        case_type: 'observation_match',
        status: 'resolved',
      })
    );
    expect(statementsMatching(model, 'UPDATE investments')).toHaveLength(0);
    expect(statementsMatching(model, 'INSERT INTO investment_rounds')).toHaveLength(0);
    expect(statementsMatching(model, 'INSERT INTO cash_flow_events')).toHaveLength(0);
    expect(invalidateH9Artifacts).toHaveBeenCalledOnce();
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
  });

  it('deactivates target relief through reversal and recreates relief only on replacement', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '5.00000000',
      cost_basis_cents: 5000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });

    const result = await correctEvent();

    expect(model.reliefs).toHaveLength(2);
    expect(model.reliefs).toContainEqual(
      expect.objectContaining({
        position_event_id: result.value.replacement.id,
        relieved_shares: '3.000000',
        relieved_cost_basis: '30.000000',
        allocated_proceeds: '55.000000',
      })
    );
    expect(model.reliefs).not.toContainEqual(
      expect.objectContaining({ position_event_id: result.value.reversal.id })
    );

    const fundLockIndex = model.statements.findIndex((statement) =>
      statement.text.includes('pg_advisory_xact_lock')
    );
    const eventLockIndex = model.statements.findIndex(
      (statement) =>
        statement.text.includes('SELECT *, xmin::text AS xmin') &&
        statement.text.includes('FOR UPDATE')
    );
    const lotLockIndex = model.statements.findIndex(
      (statement) =>
        statement.text.includes('FROM investment_lots l') && statement.text.includes('FOR UPDATE')
    );
    expect(fundLockIndex).toBeGreaterThanOrEqual(0);
    expect(eventLockIndex).toBeGreaterThan(fundLockIndex);
    expect(lotLockIndex).toBeGreaterThan(eventLockIndex);
  });

  it('rejects a second correction of the same target without persisting rows', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });
    await correctEvent();
    const countsBeforeConflict = {
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    };

    await expect(correctEvent('position-correction-2')).rejects.toMatchObject({
      status: 409,
      code: 'POSITION_EVENT_ALREADY_CORRECTED',
    });

    expect({
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    }).toEqual(countsBeforeConflict);
  });

  it('replays one correction key and rejects changed payload reuse without duplicates', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });

    const first = await correctEvent();
    const replay = await correctEvent();

    expect(replay).toEqual({ ...first, replayed: true });
    expect(model.positionEvents).toHaveLength(3);
    expect(model.reliefs).toHaveLength(2);
    expect(model.observations).toHaveLength(1);
    expect(model.reconciliationCases).toHaveLength(1);
    expect(invalidateH9Artifacts).toHaveBeenCalledOnce();

    await expect(
      correctEvent('position-correction-1', {
        positionEventId: 1299,
        currency: 'USD',
        sharesDelta: '-2.00000000',
        costBasisDelta: '-20.000000',
        proceeds: '45.000000',
        lotReliefs: [
          {
            investmentId: 800,
            investmentLotId: LOT_ID,
            relievedShares: '2.00000000',
            relievedCostBasis: '20.000000',
            allocatedProceeds: '45.000000',
          },
        ],
      })
    ).rejects.toMatchObject({
      status: 409,
      code: 'IDEMPOTENCY_KEY_REUSE',
    });
    expect(model.positionEvents).toHaveLength(3);
    expect(model.reliefs).toHaveLength(2);
  });

  it('replays an exact correction after the target identity later merges into a new head', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });

    const first = await correctEvent();
    const countsAfterFirstCorrection = {
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    };
    model.identities = [
      {
        id: IDENTITY_ID,
        fund_id: FUND_ID,
        merged_into_identity_id: 12,
        canonical_name: 'Acme Robotics Legacy',
      },
      {
        id: 12,
        fund_id: FUND_ID,
        merged_into_identity_id: null,
        canonical_name: 'Acme Robotics',
      },
    ];

    const replay = await correctEvent();

    expect(replay).toEqual({ ...first, replayed: true });
    expect({
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    }).toEqual(countsAfterFirstCorrection);
    expect(invalidateH9Artifacts).toHaveBeenCalledOnce();
  });

  it('rejects a new correction when the target identity has already merged into a new head', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });
    const countsBeforeCorrection = {
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    };
    model.identities = [
      {
        id: IDENTITY_ID,
        fund_id: FUND_ID,
        merged_into_identity_id: 12,
        canonical_name: 'Acme Robotics Legacy',
      },
      {
        id: 12,
        fund_id: FUND_ID,
        merged_into_identity_id: null,
        canonical_name: 'Acme Robotics',
      },
    ];

    await expect(correctEvent('position-correction-after-merge')).rejects.toMatchObject({
      status: 409,
      code: 'IDENTITY_NOT_CURRENT',
      details: {
        companyIdentityId: IDENTITY_ID,
        identityHead: 12,
      },
    });

    expect({
      events: model.positionEvents.length,
      reliefs: model.reliefs.length,
      observations: model.observations.length,
      reconciliationCases: model.reconciliationCases.length,
    }).toEqual(countsBeforeCorrection);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });

  it('preserves the old knowledge cutoff while later cutoffs reflect the correction', async () => {
    seedPositionEvent();
    seedPositionEvent({
      id: 1298,
      event_type: 'adjustment',
      effective_date: '2026-02-20',
      recorded_at: new Date('2026-02-20T00:00:00.000Z'),
      xmin: '100',
      shares_delta: '1.000000',
      cost_basis_delta: '5.000000',
      proceeds: '0.000000',
      idempotency_key: 'position-adjustment-later',
      request_hash: 'b'.repeat(64),
    });
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });
    const oldCutoff = new Date('2026-02-25T00:00:00.000Z');
    const beforeCorrection = foldPositionEconomics(model.positionEvents, oldCutoff);

    await correctEvent();

    expect(foldPositionEconomics(model.positionEvents, oldCutoff)).toEqual(beforeCorrection);
    expect(
      foldPositionEconomics(model.positionEvents, new Date('2026-03-02T00:00:00.000Z'))
    ).toEqual({
      shares: -2,
      costBasis: -25,
      proceeds: 55,
    });
  });

  it('rolls back the full correction when final reconciliation-case persistence fails', async () => {
    seedPositionEvent();
    model.lots.push({
      id: LOT_ID,
      investment_id: 800,
      fund_id: FUND_ID,
      shares_acquired: '10.00000000',
      cost_basis_cents: 10000n,
    });
    model.reliefs.push({
      fund_id: FUND_ID,
      position_event_id: 1299,
      investment_id: 800,
      investment_lot_id: LOT_ID,
      relieved_shares: '4.000000',
      relieved_cost_basis: '40.000000',
      allocated_proceeds: '60.000000',
    });
    model.failReconciliationCaseInsert = true;

    await expect(correctEvent('position-correction-rollback')).rejects.toThrow(
      'Injected reconciliation-case failure.'
    );

    expect(model.positionEvents).toHaveLength(1);
    expect(model.reliefs).toHaveLength(1);
    expect(model.observations).toHaveLength(0);
    expect(model.reconciliationCases).toHaveLength(0);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});
