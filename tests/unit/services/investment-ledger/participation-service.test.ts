import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidateH9Artifacts } = vi.hoisted(() => ({
  invalidateH9Artifacts: vi.fn(async () => undefined),
}));

vi.mock('../../../../server/services/h9-artifact-invalidation-service', () => ({
  invalidateH9Artifacts,
}));

import {
  createVehicleFinancingParticipation,
  ParticipationLedgerServiceError,
} from '../../../../server/services/investment-ledger/participation-service';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';

const EXPECTED_WIRE_FINGERPRINT =
  'd53cfe684a8035fa107cafef10ef09d4168f3074eb7bd69a694471d14c60f947';
const EXPECTED_ORIGINAL_SOURCE_HASH =
  '0916d139dee222b9a47461fbee66157d7262785e6bc8a13466e95c91ebb0d62f';

const dialect = new PgDialect();
const FUND_ID = 7;
const TRANCHE_ID = 500;
const VEHICLE_ID = 41;
const COMPANY_ID = 42;
const IDENTITY_ID = 11;
const CREATED_AT = new Date('2026-03-01T00:00:00.000Z');

interface Statement {
  text: string;
  params: unknown[];
}

interface TrancheRow {
  id: number;
  fund_id: number;
  financing_event_id: number;
  tranche_key: string;
  version: number;
  superseded_by_tranche_id: number | null;
  closing_date: string;
  security_type: string;
  investment_amount: string;
  original_amount: string;
  currency: string;
  fx_rate_to_usd: string;
  fx_rate_date: string;
  price_per_share: string | null;
  post_money_valuation: string | null;
  valuation_cap: string | null;
  conversion_discount_rate: string | null;
  interest_rate: string | null;
  maturity_date: string | null;
  liquidation_preference_multiple: string | null;
  participating_preferred: boolean | null;
  participation_cap_multiple: string | null;
  pro_rata_rights_pct: string | null;
  descriptive_terms: Record<string, unknown>;
  calculation_eligible: boolean;
  source_observation_id: number | null;
  created_by: number | null;
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
}

interface EventRow {
  id: number;
  fund_id: number;
  company_identity_id: number;
  round_name: string;
}

interface ParticipationRow {
  id: number;
  fund_id: number;
  vehicle_id: number;
  financing_event_id: number;
  tranche_key: string;
  financing_tranche_id: number;
  version: number;
  superseded_by_participation_id: number | null;
  participation_amount: string;
  original_amount: string | null;
  currency: string | null;
  fx_rate_to_usd: string | null;
  fx_rate_date: string | null;
  shares_acquired: string | null;
  closing_date: string | null;
  price_per_share: string | null;
  post_money_valuation: string | null;
  valuation_cap: string | null;
  conversion_discount_rate: string | null;
  interest_rate: string | null;
  liquidation_preference_multiple: string | null;
  participating_preferred: boolean | null;
  participation_cap_multiple: string | null;
  pro_rata_rights_pct: string | null;
  maturity_date: string | null;
  descriptive_terms: Record<string, unknown> | null;
  confirmed_duplicates: string[];
  source_observation_id: number | null;
  created_by: number | null;
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
}

interface LegacyInvestmentRow {
  id: number;
  fund_id: number;
  company_id: number;
  investment_date: Date;
  amount: string;
  round: string;
  imported_from: string | null;
}

interface LedgerModel {
  events: EventRow[];
  tranches: TrancheRow[];
  activeLinks: number[];
  participations: ParticipationRow[];
  investments: Array<Record<string, unknown>>;
  rounds: Array<Record<string, unknown>>;
  lots: Array<Record<string, unknown>>;
  cashFlowEvents: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  legacyInvestments: LegacyInvestmentRow[];
  owned: boolean;
  nextParticipationId: number;
  nextInvestmentId: number;
  nextRoundId: number;
  nextLotId: number;
  nextCashFlowEventId: number;
  nextObservationId: number;
  failCashFlowInsert: boolean;
  statements: Statement[];
}

interface LedgerModelSnapshot {
  events: EventRow[];
  tranches: TrancheRow[];
  activeLinks: number[];
  participations: ParticipationRow[];
  investments: Array<Record<string, unknown>>;
  rounds: Array<Record<string, unknown>>;
  lots: Array<Record<string, unknown>>;
  cashFlowEvents: Array<Record<string, unknown>>;
  observations: Array<Record<string, unknown>>;
  legacyInvestments: LegacyInvestmentRow[];
  owned: boolean;
  nextParticipationId: number;
  nextInvestmentId: number;
  nextRoundId: number;
  nextLotId: number;
  nextCashFlowEventId: number;
  nextObservationId: number;
  failCashFlowInsert: boolean;
}

function emptyModel(): LedgerModel {
  return {
    events: [
      { id: 100, fund_id: FUND_ID, company_identity_id: IDENTITY_ID, round_name: 'Series A' },
    ],
    tranches: [
      {
        id: TRANCHE_ID,
        fund_id: FUND_ID,
        financing_event_id: 100,
        tranche_key: 'first-close',
        version: 1,
        superseded_by_tranche_id: null,
        closing_date: '2026-02-01',
        security_type: 'equity',
        investment_amount: '2500000.000000',
        original_amount: '2500000.000000',
        currency: 'USD',
        fx_rate_to_usd: '1.0000000000',
        fx_rate_date: '2026-02-01',
        price_per_share: '5.000000',
        post_money_valuation: null,
        valuation_cap: null,
        conversion_discount_rate: null,
        interest_rate: null,
        maturity_date: null,
        liquidation_preference_multiple: null,
        participating_preferred: null,
        participation_cap_multiple: null,
        pro_rata_rights_pct: null,
        descriptive_terms: {},
        calculation_eligible: true,
        source_observation_id: null,
        created_by: 3,
        idempotency_key: 'tr-1',
        request_hash: canonicalSha256({ tranche: 'seed' }),
        created_at: CREATED_AT,
      },
    ],
    activeLinks: [COMPANY_ID],
    participations: [],
    investments: [],
    rounds: [],
    lots: [],
    cashFlowEvents: [],
    observations: [],
    legacyInvestments: [],
    owned: true,
    nextParticipationId: 700,
    nextInvestmentId: 800,
    nextRoundId: 900,
    nextLotId: 1000,
    nextCashFlowEventId: 1100,
    nextObservationId: 1200,
    failCashFlowInsert: false,
    statements: [],
  };
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
  const bare = token.replace(/::[a-z]+$/i, '').trim();
  const placeholder = /^\$(\d+)$/.exec(bare);
  if (placeholder) return params[Number.parseInt(placeholder[1] ?? '0', 10) - 1];
  if (/^NULL$/i.test(bare)) return null;
  if (/^true$/i.test(bare)) return true;
  if (/^false$/i.test(bare)) return false;
  if (/^'.*'$/.test(bare)) return bare.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(bare)) return Number(bare);
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
    row[column] = literalValue(values[index] ?? 'NULL', params);
  });
  return row;
}

function cloneRecords<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row }));
}

function snapshotModel(model: LedgerModel): LedgerModelSnapshot {
  return {
    events: model.events.map((event) => ({ ...event })),
    tranches: model.tranches.map((tranche) => ({
      ...tranche,
      descriptive_terms: { ...tranche.descriptive_terms },
    })),
    activeLinks: [...model.activeLinks],
    participations: cloneRecords(model.participations),
    investments: cloneRecords(model.investments),
    rounds: cloneRecords(model.rounds),
    lots: cloneRecords(model.lots),
    cashFlowEvents: cloneRecords(model.cashFlowEvents),
    observations: cloneRecords(model.observations),
    legacyInvestments: model.legacyInvestments.map((investment) => ({ ...investment })),
    owned: model.owned,
    nextParticipationId: model.nextParticipationId,
    nextInvestmentId: model.nextInvestmentId,
    nextRoundId: model.nextRoundId,
    nextLotId: model.nextLotId,
    nextCashFlowEventId: model.nextCashFlowEventId,
    nextObservationId: model.nextObservationId,
    failCashFlowInsert: model.failCashFlowInsert,
  };
}

function restoreModel(model: LedgerModel, snapshot: LedgerModelSnapshot): void {
  model.events = snapshot.events.map((event) => ({ ...event }));
  model.tranches = snapshot.tranches.map((tranche) => ({
    ...tranche,
    descriptive_terms: { ...tranche.descriptive_terms },
  }));
  model.activeLinks = [...snapshot.activeLinks];
  model.participations = cloneRecords(snapshot.participations);
  model.investments = cloneRecords(snapshot.investments);
  model.rounds = cloneRecords(snapshot.rounds);
  model.lots = cloneRecords(snapshot.lots);
  model.cashFlowEvents = cloneRecords(snapshot.cashFlowEvents);
  model.observations = cloneRecords(snapshot.observations);
  model.legacyInvestments = snapshot.legacyInvestments.map((investment) => ({ ...investment }));
  model.owned = snapshot.owned;
  model.nextParticipationId = snapshot.nextParticipationId;
  model.nextInvestmentId = snapshot.nextInvestmentId;
  model.nextRoundId = snapshot.nextRoundId;
  model.nextLotId = snapshot.nextLotId;
  model.nextCashFlowEventId = snapshot.nextCashFlowEventId;
  model.nextObservationId = snapshot.nextObservationId;
  model.failCashFlowInsert = snapshot.failCashFlowInsert;
}

function rowWithId(row: Record<string, unknown>, id: number): Record<string, unknown> {
  return { ...row, id, created_at: CREATED_AT };
}

function runStatement(model: LedgerModel, text: string, params: unknown[]): { rows: unknown[] } {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (flat.includes("nextval('vehicle_financing_participations_id_seq')")) {
    return { rows: [{ id: model.nextParticipationId++ }] };
  }
  if (flat.includes("nextval('source_observations_id_seq')")) {
    return { rows: [{ id: model.nextObservationId++ }] };
  }

  if (flat.startsWith('SELECT * FROM vehicle_financing_participations')) {
    const [fundId, key] = params as [number, string];
    const row = model.participations.find(
      (participation) => participation.fund_id === fundId && participation.idempotency_key === key
    );
    return { rows: row ? [row] : [] };
  }

  if (flat.startsWith('SELECT p.*, i.id AS investment_id')) {
    const [fundId, participationId] = params as [number, number];
    const participation = model.participations.find(
      (candidate) => candidate.fund_id === fundId && candidate.id === participationId
    );
    if (!participation) return { rows: [] };
    const investment = model.investments.find(
      (candidate) =>
        candidate['fund_id'] === fundId && candidate['vehicle_participation_id'] === participationId
    );
    const round = model.rounds.find(
      (candidate) =>
        candidate['fund_id'] === fundId && candidate['vehicle_participation_id'] === participationId
    );
    const lot = model.lots.find(
      (candidate) => candidate['vehicle_participation_id'] === participationId
    );
    const cashFlowEvent = model.cashFlowEvents.find(
      (candidate) =>
        candidate['fund_id'] === fundId && candidate['vehicle_participation_id'] === participationId
    );
    const observation = model.observations.find(
      (candidate) => candidate['id'] === participation.source_observation_id
    );
    return {
      rows: [
        {
          ...participation,
          investment_id: investment?.['id'] ?? null,
          investment_round_id: round?.['id'] ?? null,
          investment_lot_id: lot?.['id'] === undefined ? null : String(lot['id']),
          cash_flow_event_id: cashFlowEvent?.['id'] ?? null,
          source_hash: cashFlowEvent?.['source_hash'] ?? null,
          normalized_payload: observation?.['normalized_payload'] ?? {},
        },
      ],
    };
  }

  if (flat.startsWith('SELECT t.*, e.round_name')) {
    const [trancheId, fundId] = params as [number, number];
    const tranche = model.tranches.find(
      (candidate) =>
        candidate.id === trancheId &&
        candidate.fund_id === fundId &&
        candidate.superseded_by_tranche_id === null
    );
    const event = model.events.find(
      (candidate) => candidate.id === tranche?.financing_event_id && candidate.fund_id === fundId
    );
    return {
      rows:
        tranche && event
          ? [
              {
                ...tranche,
                round_name: event.round_name,
                company_identity_id: event.company_identity_id,
                canonical_name: 'Acme Robotics',
              },
            ]
          : [],
    };
  }

  if (flat.startsWith('SELECT portfolio_company_id')) {
    return { rows: model.activeLinks.map((id) => ({ portfolio_company_id: id })) };
  }

  if (flat.startsWith('SELECT i.id AS investment_id')) {
    const [fundId, companyId, amount, roundName, closingDate] = params as [
      number,
      number,
      string,
      string,
      string,
      string,
    ];
    const rows = model.legacyInvestments.filter(
      (investment) =>
        investment.fund_id === fundId &&
        investment.company_id === companyId &&
        investment.amount === amount &&
        investment.round === roundName &&
        investment.investment_date.toISOString().slice(0, 10) === closingDate &&
        investment.imported_from !== 'vehicle_participation'
    );
    return {
      rows: rows.map((investment) => ({
        investment_id: investment.id,
        round_id: null,
        amount: investment.amount,
        round: investment.round,
        investment_date: investment.investment_date,
        round_name: null,
        round_date: null,
        investment_amount: null,
      })),
    };
  }

  if (flat.startsWith('INSERT INTO vehicle_financing_participations')) {
    const parsed = parseInsert(flat, params);
    const row = rowWithId(parsed, parsed['id'] as number) as unknown as ParticipationRow;
    row.confirmed_duplicates =
      typeof parsed['confirmed_duplicates'] === 'string'
        ? (JSON.parse(parsed['confirmed_duplicates']) as string[])
        : ((parsed['confirmed_duplicates'] as string[] | null) ?? []);
    row.descriptive_terms =
      typeof parsed['descriptive_terms'] === 'string'
        ? (JSON.parse(parsed['descriptive_terms']) as Record<string, unknown>)
        : ((parsed['descriptive_terms'] as Record<string, unknown> | null) ?? null);
    model.participations.push(row);
    return { rows: [row] };
  }

  if (flat.startsWith('INSERT INTO investments')) {
    const row = rowWithId(parseInsert(flat, params), model.nextInvestmentId++);
    model.investments.push(row);
    return { rows: [{ id: row.id }] };
  }

  if (flat.startsWith('INSERT INTO investment_rounds')) {
    const row = rowWithId(parseInsert(flat, params), model.nextRoundId++);
    model.rounds.push(row);
    return { rows: [{ id: row.id }] };
  }

  if (flat.startsWith('INSERT INTO investment_lots')) {
    const row = rowWithId(parseInsert(flat, params), model.nextLotId++);
    model.lots.push(row);
    return { rows: [{ id: String(row.id) }] };
  }

  if (flat.startsWith('INSERT INTO cash_flow_events')) {
    if (model.failCashFlowInsert) throw new Error('fake cash flow insert failure');
    const row = rowWithId(parseInsert(flat, params), model.nextCashFlowEventId++);
    model.cashFlowEvents.push(row);
    return { rows: [{ id: row.id }] };
  }

  if (flat.startsWith('INSERT INTO source_observations')) {
    const row = parseInsert(flat, params);
    model.observations.push(row);
    return { rows: [{ id: row['id'] }] };
  }

  if (flat.startsWith('UPDATE vehicle_financing_participations')) {
    const [sourceObservationId, participationId, fundId] = params as [number, number, number];
    const row = model.participations.find(
      (participation) => participation.id === participationId && participation.fund_id === fundId
    );
    if (!row) return { rows: [] };
    row.source_observation_id = sourceObservationId;
    return { rows: [row] };
  }

  return { rows: [] };
}

function makeDatabase(model: LedgerModel) {
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

function statementsMatching(model: LedgerModel, needle: string): Statement[] {
  return model.statements.filter((statement) =>
    statement.text.replace(/\s+/g, ' ').includes(needle)
  );
}

function participationRequest(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE_ID,
    participationAmount: '1000.000000',
    sharesAcquired: '200.00000000',
    ...overrides,
  };
}

async function createParticipation(
  idempotencyKey = 'part-1',
  overrides: Record<string, unknown> = {}
) {
  return createVehicleFinancingParticipation({
    fundId: FUND_ID,
    trancheId: TRANCHE_ID,
    actorId: 3,
    idempotencyKey,
    request: participationRequest(overrides),
    database: makeDatabase(model),
  });
}

let model: LedgerModel;

beforeEach(() => {
  model = emptyModel();
  invalidateH9Artifacts.mockClear();
});

describe('createVehicleFinancingParticipation', () => {
  it('writes participation, compat rows, CFE, and accepted observation atomically', async () => {
    const created = await createParticipation();

    expect(created.replayed).toBe(false);
    expect(created.value.participation.id).toBe(700);
    expect(created.value.participation.sourceObservationId).toBe(1200);
    expect(created.value.participation.originalAmount).toBe('1000.000000');
    expect(created.value.participation.currency).toBe('USD');
    expect(created.value.participation.fxRateToUsd).toBe('1.0000000000');
    expect(created.value.participation.fxRateDate).toBe('2026-02-01');
    expect(created.value.warnings).toEqual([]);
    expect(created.value.lotStatus).toBe('emitted');
    expect(created.value.compat).toMatchObject({
      investmentId: 800,
      investmentRoundId: 900,
      investmentLotId: '1000',
      cashFlowEventId: 1100,
      sourceObservationId: 1200,
    });
    expect(model.participations).toHaveLength(1);
    expect(model.investments).toHaveLength(1);
    expect(model.rounds).toHaveLength(1);
    expect(model.lots).toHaveLength(1);
    expect(model.cashFlowEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
    const storedPayload = model.observations[0]?.['normalized_payload'];
    expect(model.observations[0]?.['observation_hash']).toBe(
      canonicalSha256(
        typeof storedPayload === 'string'
          ? (JSON.parse(storedPayload) as Record<string, unknown>)
          : storedPayload
      )
    );

    expect(model.investments[0]).toMatchObject({
      fund_id: FUND_ID,
      company_id: COMPANY_ID,
      amount: '1000.00',
      round: 'Series A',
      imported_from: 'vehicle_participation',
      vehicle_participation_id: 700,
    });
    expect(model.rounds[0]).toMatchObject({
      fund_id: FUND_ID,
      investment_amount: '1000.000000',
      idempotency_key: 'vfp:700:v1:round',
      vehicle_participation_id: 700,
      financing_tranche_id: TRANCHE_ID,
    });
    expect(model.lots[0]).toMatchObject({
      investment_id: 800,
      share_price_cents: 500n,
      shares_acquired: '200.00000000',
      cost_basis_cents: 100000n,
      idempotency_key: 'vfp:700:v1:lot:initial',
    });
    expect(model.cashFlowEvents[0]).toMatchObject({
      fund_id: FUND_ID,
      vehicle_id: VEHICLE_ID,
      company_id: COMPANY_ID,
      event_type: 'portfolio_investment',
      amount: '1000.000000',
      perspective: 'vehicle',
      status: 'approved',
      source_hash: EXPECTED_ORIGINAL_SOURCE_HASH,
    });
    expect(JSON.parse(String(model.cashFlowEvents[0]?.['payload']))).toMatchObject({
      source: 'vehicle_participation',
      wireFingerprint: EXPECTED_WIRE_FINGERPRINT,
      participationId: 700,
      participationVersion: 1,
    });
    expect(model.cashFlowEvents[0]?.['event_date']).toEqual(new Date('2026-02-01T00:00:00.000Z'));
    expect(model.observations[0]).toMatchObject({
      fund_id: FUND_ID,
      company_identity_id: IDENTITY_ID,
      source_type: 'manual',
      status: 'accepted',
      dependency_group_key: 'source-observation:1200',
    });
    expect(
      JSON.parse(String(model.observations[0]?.['normalized_payload']))['provenance']
    ).toMatchObject({
      sourceHash: EXPECTED_ORIGINAL_SOURCE_HASH,
      wireFingerprint: EXPECTED_WIRE_FINGERPRINT,
    });
    expect(invalidateH9Artifacts).toHaveBeenCalledTimes(1);
    expect(invalidateH9Artifacts).toHaveBeenCalledWith(FUND_ID);
    expect(
      statementsMatching(model, "nextval('vehicle_financing_participations_id_seq')")
    ).toHaveLength(1);
    const lockParams = statementsMatching(model, 'pg_advisory_xact_lock(hashtext(').map(
      (statement) => statement.params[0]
    );
    expect(lockParams.slice(0, 2)).toEqual([
      `fund-identity:${FUND_ID}`,
      `participation:${FUND_ID}:${TRANCHE_ID}:${VEHICLE_ID}`,
    ]);
  });

  it('replays before parsing malformed body and rejects changed payload reuse', async () => {
    const first = await createParticipation('part-replay');
    invalidateH9Artifacts.mockClear();
    model.investments[0]!['vehicle_participation_id'] = 701;
    model.rounds[0]!['vehicle_participation_id'] = 701;
    model.lots = [];
    model.cashFlowEvents[0]!['vehicle_participation_id'] = 701;

    const replay = await createVehicleFinancingParticipation({
      fundId: FUND_ID,
      trancheId: TRANCHE_ID,
      actorId: 3,
      idempotencyKey: 'part-replay',
      request: {},
      database: makeDatabase(model),
    });

    expect(replay.replayed).toBe(true);
    expect(replay.value).toEqual(first.value);
    expect(model.participations).toHaveLength(1);
    expect(model.cashFlowEvents).toHaveLength(1);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();

    await expect(
      createParticipation('part-replay', { participationAmount: '1100.000000' })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
    expect(model.participations).toHaveLength(1);
  });

  it('requires exactly one active identity link with zero persistence on rejection', async () => {
    model.activeLinks = [];

    await expect(createParticipation('missing-link')).rejects.toMatchObject({
      status: 409,
      code: 'IDENTITY_LINK_REQUIRED',
    });
    expect(model.participations).toHaveLength(0);
    expect(model.investments).toHaveLength(0);
    expect(model.rounds).toHaveLength(0);
    expect(model.lots).toHaveLength(0);
    expect(model.cashFlowEvents).toHaveLength(0);
    expect(model.observations).toHaveLength(0);

    model.activeLinks = [COMPANY_ID, 43];
    await expect(createParticipation('ambiguous-link')).rejects.toMatchObject({
      status: 409,
      code: 'IDENTITY_LINK_AMBIGUOUS',
    });
    expect(model.participations).toHaveLength(0);
  });

  it('returns stored projection warnings and lot status on create and replay', async () => {
    const tranche = model.tranches[0] as TrancheRow;
    tranche.price_per_share = null;
    tranche.post_money_valuation = '5000000.000000';

    const created = await createParticipation('warning-receipt', {
      participationAmount: '1000.001000',
    });

    expect(created.value.warnings).toEqual(['SUB_CENT_FX_RESIDUE', 'LOT_OMITTED_UNPRICED']);
    expect(created.value.lotStatus).toBe('omitted_unpriced');
    expect(created.value.compat.investmentLotId).toBeNull();
    expect(model.lots).toHaveLength(0);

    const replay = await createParticipation('warning-receipt', {
      participationAmount: '1000.001000',
    });
    expect(replay.replayed).toBe(true);
    expect(replay.value).toEqual(created.value);
  });

  it('runs duplicate 409-confirm-stale flow without burning idempotency key', async () => {
    model.legacyInvestments.push({
      id: 77,
      fund_id: FUND_ID,
      company_id: COMPANY_ID,
      amount: '1000.00',
      round: 'Series A',
      investment_date: new Date('2026-02-01T00:00:00.000Z'),
      imported_from: null,
    });

    let duplicateFingerprint = '';
    await createParticipation('part-confirm').catch((error: unknown) => {
      expect(error).toBeInstanceOf(ParticipationLedgerServiceError);
      const serviceError = error as ParticipationLedgerServiceError;
      expect(serviceError).toMatchObject({ status: 409, code: 'SUSPECTED_DUPLICATE_POSITION' });
      const fingerprints = serviceError.details?.['duplicateFingerprints'];
      expect(Array.isArray(fingerprints)).toBe(true);
      duplicateFingerprint = String((fingerprints as string[])[0]);
    });
    expect(model.participations).toHaveLength(0);

    model.legacyInvestments[0] = {
      ...(model.legacyInvestments[0] as LegacyInvestmentRow),
      amount: '1001.00',
    };
    await expect(
      createParticipation('part-confirm', { confirmedDuplicates: [duplicateFingerprint] })
    ).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_CONFIRMATION_STALE' });
    expect(model.participations).toHaveLength(0);

    model.legacyInvestments[0] = {
      ...(model.legacyInvestments[0] as LegacyInvestmentRow),
      amount: '1000.00',
    };
    const confirmed = await createParticipation('part-confirm', {
      confirmedDuplicates: [duplicateFingerprint],
    });
    expect(confirmed.replayed).toBe(false);
    expect(confirmed.value.participation.confirmedDuplicates).toEqual([duplicateFingerprint]);
    expect(confirmed.value.warnings).toEqual([]);
    expect(model.participations).toHaveLength(1);
  });

  it('scans duplicate investments using the 2dp legacy amount projection', async () => {
    model.legacyInvestments.push({
      id: 78,
      fund_id: FUND_ID,
      company_id: COMPANY_ID,
      amount: '123.46',
      round: 'Series A',
      investment_date: new Date('2026-02-01T00:00:00.000Z'),
      imported_from: null,
    });

    await expect(
      createParticipation('rounded-duplicate', { participationAmount: '123.456789' })
    ).rejects.toMatchObject({ status: 409, code: 'SUSPECTED_DUPLICATE_POSITION' });
    expect(model.participations).toHaveLength(0);

    const scan = statementsMatching(model, 'SELECT i.id AS investment_id').at(-1);
    expect(scan?.params).toEqual(expect.arrayContaining(['123.46', '123.456789']));
  });

  it('isolates failing siblings and rolls back final-step failures', async () => {
    model.tranches.push({
      ...(model.tranches[0] as TrancheRow),
      id: 501,
      price_per_share: null,
      post_money_valuation: null,
      idempotency_key: 'tr-bad',
    });

    await expect(
      createVehicleFinancingParticipation({
        fundId: FUND_ID,
        trancheId: 501,
        actorId: 3,
        idempotencyKey: 'bad-matrix',
        request: participationRequest(),
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({ status: 422, code: 'EFFECTIVE_TERMS_MATRIX_VIOLATION' });
    expect(model.participations).toHaveLength(0);

    const good = await createParticipation('good-sibling');
    expect(good.value.participation.id).toBe(700);
    expect(model.participations).toHaveLength(1);

    model.failCashFlowInsert = true;
    invalidateH9Artifacts.mockClear();
    await expect(createParticipation('late-fail')).rejects.toThrow('fake cash flow insert failure');
    expect(model.participations).toHaveLength(1);
    expect(model.investments).toHaveLength(1);
    expect(model.rounds).toHaveLength(1);
    expect(model.cashFlowEvents).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
    expect(invalidateH9Artifacts).not.toHaveBeenCalled();
  });
});
