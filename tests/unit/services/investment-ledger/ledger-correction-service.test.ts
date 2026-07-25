import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  correctVehicleParticipationLedger,
  type LedgerCorrectionReceiptV1,
} from '../../../../server/services/investment-ledger/ledger-correction-service';
import { canonicalSha256 } from '../../../../shared/lib/canonical-hash';

const dialect = new PgDialect();
const FUND_ID = 7;
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

interface InvestmentRow {
  id: number;
  fund_id: number;
  vehicle_participation_id: number;
  amount: string;
  round: string;
  version: number;
}

interface RoundRow {
  id: number;
  fund_id: number;
  vehicle_participation_id: number;
  supersedes_round_id: number | null;
  investment_amount: string;
}

interface CashFlowRow {
  id: number;
  fund_id: number;
  vehicle_participation_id: number;
  event_type: string;
  amount: string;
  status: string;
  reversal_of_event_id: number | null;
  supersedes_event_id: number | null;
  source_hash: string | null;
}

interface LotRow {
  id: string;
  investment_id: number;
  vehicle_participation_id: number;
  cost_basis_cents: bigint;
}

interface Model {
  tranches: TrancheRow[];
  participations: ParticipationRow[];
  investments: InvestmentRow[];
  rounds: RoundRow[];
  cashFlows: CashFlowRow[];
  lots: LotRow[];
  observations: Array<Record<string, unknown>>;
  cases: Array<Record<string, unknown>>;
  statements: Statement[];
  nextTrancheId: number;
  nextParticipationId: number;
  nextObservationId: number;
  nextCaseId: number;
  nextRoundId: number;
  nextCashFlowId: number;
  owned: boolean;
  identityLinks: number[];
  failInvestmentUpdate: boolean;
  failCashFlowUpdate: boolean;
}

function baseTranche(overrides: Partial<TrancheRow> = {}): TrancheRow {
  return {
    id: 500,
    fund_id: FUND_ID,
    financing_event_id: 100,
    tranche_key: 'first-close',
    version: 1,
    superseded_by_tranche_id: null,
    closing_date: '2026-02-01',
    security_type: 'equity',
    investment_amount: '1000.000000',
    original_amount: '1000.000000',
    currency: 'USD',
    fx_rate_to_usd: '1.0000000000',
    fx_rate_date: '2026-02-01',
    price_per_share: '10.000000',
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
    source_observation_id: 900,
    created_by: 3,
    idempotency_key: 'tr-1',
    request_hash: canonicalSha256({ seed: 'tranche' }),
    created_at: CREATED_AT,
    ...overrides,
  };
}

function baseParticipation(overrides: Partial<ParticipationRow> = {}): ParticipationRow {
  return {
    id: 700,
    fund_id: FUND_ID,
    vehicle_id: 44,
    financing_event_id: 100,
    tranche_key: 'first-close',
    financing_tranche_id: 500,
    version: 1,
    superseded_by_participation_id: null,
    participation_amount: '100.000000',
    original_amount: '100.000000',
    currency: 'USD',
    fx_rate_to_usd: '1.0000000000',
    fx_rate_date: '2026-02-01',
    shares_acquired: '10.00000000',
    closing_date: null,
    price_per_share: null,
    post_money_valuation: null,
    valuation_cap: null,
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
    idempotency_key: 'part-1',
    request_hash: canonicalSha256({ seed: 'participation' }),
    created_at: CREATED_AT,
    ...overrides,
  };
}

function emptyModel(): Model {
  return {
    tranches: [baseTranche()],
    participations: [baseParticipation()],
    investments: [
      {
        id: 800,
        fund_id: FUND_ID,
        vehicle_participation_id: 700,
        amount: '100.00',
        round: 'first-close',
        version: 1,
      },
    ],
    rounds: [
      {
        id: 810,
        fund_id: FUND_ID,
        vehicle_participation_id: 700,
        supersedes_round_id: null,
        investment_amount: '100.000000',
      },
    ],
    cashFlows: [
      {
        id: 820,
        fund_id: FUND_ID,
        vehicle_participation_id: 700,
        event_type: 'portfolio_investment',
        amount: '100.000000',
        status: 'approved',
        reversal_of_event_id: null,
        supersedes_event_id: null,
        source_hash: canonicalSha256({ seed: 'cfe' }),
      },
    ],
    lots: [
      { id: 'lot-1', investment_id: 800, vehicle_participation_id: 700, cost_basis_cents: 10000n },
    ],
    observations: [],
    cases: [],
    statements: [],
    nextTrancheId: 501,
    nextParticipationId: 701,
    nextObservationId: 950,
    nextCaseId: 960,
    nextRoundId: 811,
    nextCashFlowId: 821,
    owned: true,
    identityLinks: [22],
    failInvestmentUpdate: false,
    failCashFlowUpdate: false,
  };
}

function cloneModel(model: Model): Model {
  return {
    ...model,
    tranches: model.tranches.map((row) => ({
      ...row,
      descriptive_terms: { ...row.descriptive_terms },
    })),
    participations: model.participations.map((row) => ({
      ...row,
      descriptive_terms: row.descriptive_terms ? { ...row.descriptive_terms } : null,
      confirmed_duplicates: [...row.confirmed_duplicates],
    })),
    investments: model.investments.map((row) => ({ ...row })),
    rounds: model.rounds.map((row) => ({ ...row })),
    cashFlows: model.cashFlows.map((row) => ({ ...row })),
    lots: model.lots.map((row) => ({ ...row })),
    observations: model.observations.map((row) => ({ ...row })),
    cases: model.cases.map((row) => ({ ...row })),
    statements: [...model.statements],
    identityLinks: [...model.identityLinks],
  };
}

function restoreModel(target: Model, snapshot: Model): void {
  Object.assign(target, cloneModel(snapshot));
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

function normalizeJson(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>;
  return (value as Record<string, unknown> | null) ?? {};
}

function insertTranche(model: Model, flat: string, params: unknown[]): { rows: unknown[] } {
  const parsed = parseInsert(flat, params);
  const row = {
    ...baseTranche(),
    ...(parsed as unknown as TrancheRow),
    descriptive_terms: normalizeJson(parsed['descriptive_terms']),
    created_at: CREATED_AT,
  };
  model.tranches.push(row);
  return { rows: [row] };
}

function insertParticipation(model: Model, flat: string, params: unknown[]): { rows: unknown[] } {
  const parsed = parseInsert(flat, params);
  const row = {
    ...baseParticipation(),
    ...(parsed as unknown as ParticipationRow),
    confirmed_duplicates: [],
    descriptive_terms:
      parsed['descriptive_terms'] === null ? null : normalizeJson(parsed['descriptive_terms']),
    created_at: CREATED_AT,
  };
  model.participations.push(row);
  return { rows: [row] };
}

function runStatement(model: Model, text: string, params: unknown[]): { rows: unknown[] } {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.includes('pg_advisory_xact_lock')) return { rows: [] };
  if (flat.includes("nextval('financing_tranches_id_seq')"))
    return { rows: [{ id: model.nextTrancheId++ }] };
  if (flat.includes("nextval('vehicle_financing_participations_id_seq')"))
    return { rows: [{ id: model.nextParticipationId++ }] };
  if (flat.includes("nextval('source_observations_id_seq')"))
    return { rows: [{ id: model.nextObservationId++ }] };

  if (flat.startsWith('SELECT financing_event_id')) {
    const [trancheId, fundId] = params as [number, number];
    const row = model.tranches.find(
      (t) => t.id === trancheId && t.fund_id === fundId && t.superseded_by_tranche_id === null
    );
    return { rows: row ? [{ financing_event_id: row.financing_event_id }] : [] };
  }
  if (flat.startsWith('SELECT * FROM financing_tranches') && flat.includes('idempotency_key')) {
    const [fundId, key] = params as [number, string];
    const row = model.tranches.find((t) => t.fund_id === fundId && t.idempotency_key === key);
    return { rows: row ? [row] : [] };
  }
  if (flat.startsWith('SELECT * FROM financing_tranches')) {
    const [trancheId, fundId] = params as [number, number];
    const row = model.tranches.find(
      (t) => t.id === trancheId && t.fund_id === fundId && t.superseded_by_tranche_id === null
    );
    return { rows: row ? [row] : [] };
  }
  if (flat.startsWith('SELECT * FROM vehicle_financing_participations')) {
    const [fundId, trancheId] = params as [number, number];
    return {
      rows: model.participations.filter(
        (p) => p.fund_id === fundId && p.financing_tranche_id === trancheId
      ),
    };
  }
  if (flat.startsWith('SELECT e.company_identity_id')) {
    return {
      rows: model.identityLinks.map((portfolioCompanyId) => ({
        company_identity_id: 11,
        canonical_name: 'Acme Robotics',
        round_name: 'Series A',
        portfolio_company_id: portfolioCompanyId,
      })),
    };
  }
  if (flat.startsWith('SELECT id, version FROM investments')) {
    const [fundId, participationId] = params as [number, number];
    const row = model.investments.find(
      (i) => i.fund_id === fundId && i.vehicle_participation_id === participationId
    );
    return { rows: row ? [{ id: row.id, version: row.version }] : [] };
  }
  if (flat.startsWith('SELECT id FROM investment_rounds')) {
    const [fundId, participationId] = params as [number, number];
    const row = model.rounds.find(
      (r) =>
        r.fund_id === fundId &&
        r.vehicle_participation_id === participationId &&
        !model.rounds.some((s) => s.supersedes_round_id === r.id)
    );
    return { rows: row ? [{ id: row.id }] : [] };
  }
  if (flat.startsWith('SELECT id, status FROM cash_flow_events')) {
    const [fundId, participationId] = params as [number, number];
    const row = model.cashFlows.find(
      (c) =>
        c.fund_id === fundId &&
        c.vehicle_participation_id === participationId &&
        c.event_type === 'portfolio_investment' &&
        c.reversal_of_event_id === null
    );
    return { rows: row ? [{ id: row.id, status: row.status }] : [] };
  }
  if (flat.startsWith('SELECT normalized_payload FROM source_observations')) {
    const [observationId, fundId] = params as [number, number];
    const row = model.observations.find(
      (observation) => observation['id'] === observationId && observation['fund_id'] === fundId
    );
    return { rows: row ? [{ normalized_payload: row['normalized_payload'] }] : [] };
  }
  if (flat.startsWith('INSERT INTO financing_tranches')) return insertTranche(model, flat, params);
  if (flat.startsWith('INSERT INTO vehicle_financing_participations'))
    return insertParticipation(model, flat, params);
  if (flat.startsWith('INSERT INTO investment_rounds')) {
    const row = parseInsert(flat, params);
    model.rounds.push({
      id: model.nextRoundId++,
      fund_id: row['fund_id'] as number,
      vehicle_participation_id: row['vehicle_participation_id'] as number,
      supersedes_round_id: row['supersedes_round_id'] as number,
      investment_amount: row['investment_amount'] as string,
    });
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO cash_flow_events')) {
    const row = parseInsert(flat, params);
    model.cashFlows.push({
      id: model.nextCashFlowId++,
      fund_id: row['fund_id'] as number,
      vehicle_participation_id: row['vehicle_participation_id'] as number,
      event_type: row['event_type'] as string,
      amount: row['amount'] as string,
      status: row['status'] as string,
      reversal_of_event_id: (row['reversal_of_event_id'] as number | null) ?? null,
      supersedes_event_id: (row['supersedes_event_id'] as number | null) ?? null,
      source_hash: row['source_hash'] as string,
    });
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO investment_lots')) {
    const row = parseInsert(flat, params);
    model.lots.push({
      id: `lot-${model.lots.length + 1}`,
      investment_id: row['investment_id'] as number,
      vehicle_participation_id: row['vehicle_participation_id'] as number,
      cost_basis_cents: row['cost_basis_cents'] as bigint,
    });
    return { rows: [] };
  }
  if (flat.startsWith('INSERT INTO source_observations')) {
    const row = parseInsert(flat, params);
    model.observations.push(row);
    return { rows: [{ id: row['id'] }] };
  }
  if (flat.startsWith('INSERT INTO reconciliation_cases')) {
    const id = model.nextCaseId++;
    model.cases.push({ id, ...parseInsert(flat, params) });
    return { rows: [{ id }] };
  }
  if (flat.startsWith('UPDATE financing_tranches') && flat.includes('source_observation_id')) {
    const [observationId, trancheId, fundId] = params as [number, number, number];
    const row = model.tranches.find((t) => t.id === trancheId && t.fund_id === fundId);
    if (!row) return { rows: [] };
    row.superseded_by_tranche_id = null;
    row.source_observation_id = observationId;
    return { rows: [row] };
  }
  if (flat.startsWith('UPDATE financing_tranches')) {
    const [newHeadId, currentId, fundId] = params as [number, number, number];
    const row = model.tranches.find(
      (t) => t.id === currentId && t.fund_id === fundId && t.superseded_by_tranche_id === null
    );
    if (!row) return { rows: [] };
    row.superseded_by_tranche_id = newHeadId;
    return { rows: [{ id: row.id }] };
  }
  if (
    flat.startsWith('UPDATE vehicle_financing_participations') &&
    flat.includes('source_observation_id')
  ) {
    const [observationId, participationId, fundId] = params as [number, number, number];
    const row = model.participations.find((p) => p.id === participationId && p.fund_id === fundId);
    if (row) row.source_observation_id = observationId;
    return { rows: row ? [{ id: row.id }] : [] };
  }
  if (
    flat.startsWith('UPDATE vehicle_financing_participations') &&
    flat.includes('superseded_by_participation_id = NULL')
  ) {
    return { rows: [] };
  }
  if (flat.startsWith('UPDATE vehicle_financing_participations')) {
    const [newId, currentId, fundId, version] = params as [number, number, number, number];
    const row = model.participations.find(
      (p) =>
        p.id === currentId &&
        p.fund_id === fundId &&
        p.version === version &&
        p.superseded_by_participation_id === null
    );
    if (!row) return { rows: [] };
    row.superseded_by_participation_id = newId;
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('UPDATE investments')) {
    if (model.failInvestmentUpdate) return { rows: [] };
    const [amount, round, _date, participationId, investmentId, fundId, version] = params as [
      string,
      string,
      Date,
      number,
      number,
      number,
      number,
    ];
    const row = model.investments.find(
      (i) => i.id === investmentId && i.fund_id === fundId && i.version === version
    );
    if (!row) return { rows: [] };
    row.amount = amount;
    row.round = round;
    row.vehicle_participation_id = participationId;
    row.version += 1;
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('UPDATE cash_flow_events')) {
    if (model.failCashFlowUpdate) return { rows: [] };
    const [eventId, fundId] = params as [number, number];
    const row = model.cashFlows.find(
      (c) => c.id === eventId && c.fund_id === fundId && c.status === 'approved'
    );
    if (!row) return { rows: [] };
    row.status = 'reversed';
    return { rows: [{ id: row.id }] };
  }
  if (flat.startsWith('UPDATE source_observations')) {
    const [normalizedPayload, observationHash, observationId, fundId] = params as [
      string,
      string,
      number,
      number,
    ];
    const row = model.observations.find(
      (observation) => observation['id'] === observationId && observation['fund_id'] === fundId
    );
    if (!row) return { rows: [] };
    row['normalized_payload'] = normalizeJson(normalizedPayload);
    row['observation_hash'] = observationHash;
    return { rows: [{ id: observationId }] };
  }
  if (flat.startsWith('DELETE FROM investment_lots')) {
    const [investmentId, participationId] = params as [number, number];
    const deleted = model.lots.filter(
      (lot) =>
        lot.investment_id === investmentId && lot.vehicle_participation_id === participationId
    );
    model.lots = model.lots.filter(
      (lot) =>
        !(lot.investment_id === investmentId && lot.vehicle_participation_id === participationId)
    );
    return { rows: deleted.map((lot) => ({ id: lot.id })) };
  }
  return { rows: [] };
}

function makeDatabase(model: Model) {
  const ownershipRows = {
    limit: () => Promise.resolve(model.owned ? [{ id: 1 }] : []),
  };
  const database = {
    execute: async (query: unknown): Promise<{ rows: unknown[] }> => {
      const rendered = dialect.sqlToQuery(query as never);
      model.statements.push({ text: rendered.sql, params: rendered.params });
      return runStatement(model, rendered.sql, rendered.params);
    },
    select: () => ({
      from: () => ({
        where: () => ownershipRows,
      }),
    }),
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

const correctionRequest = {
  expectedTrancheVersion: 1,
  correctedTranche: {
    closingDate: '2026-02-02',
    securityType: 'equity' as const,
    investmentAmount: '1100.000000',
    pricePerShare: '11.000000',
  },
  dependents: [
    {
      participationId: 700,
      expectedVersion: 1,
      acknowledgements: {
        termsReviewed: true as const,
        compatibilityRewriteAccepted: true as const,
      },
      overrideAdjustments: { participationAmount: '110.000000', originalAmount: '110.000000' },
    },
  ],
};

let model: Model;

beforeEach(() => {
  model = emptyModel();
});

async function runCorrection(request: unknown = correctionRequest) {
  return correctVehicleParticipationLedger({
    fundId: FUND_ID,
    trancheId: 500,
    actorId: 3,
    idempotencyKey: 'cascade-1',
    request,
    database: makeDatabase(model),
  });
}

describe('correctVehicleParticipationLedger', () => {
  it('rejects omitted, extra, duplicate, and stale dependents before mutation', async () => {
    const snapshot = cloneModel(model);
    await expect(runCorrection({ ...correctionRequest, dependents: [] })).rejects.toMatchObject({
      status: 409,
      code: 'PARTICIPATION_SET_MISMATCH',
    });
    expect(model.tranches).toEqual(snapshot.tranches);
    await expect(
      runCorrection({
        ...correctionRequest,
        dependents: [...correctionRequest.dependents, { ...correctionRequest.dependents[0] }],
      })
    ).rejects.toMatchObject({ status: 409, code: 'PARTICIPATION_SET_MISMATCH' });
    await expect(
      runCorrection({
        ...correctionRequest,
        dependents: [{ ...correctionRequest.dependents[0], participationId: 999 }],
      })
    ).rejects.toMatchObject({ status: 409, code: 'PARTICIPATION_SET_MISMATCH' });
    await expect(
      runCorrection({
        ...correctionRequest,
        dependents: [{ ...correctionRequest.dependents[0], expectedVersion: 2 }],
      })
    ).rejects.toMatchObject({ status: 409, code: 'PARTICIPATION_VERSION_CONFLICT' });
    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
  });

  it('rejects non-positive participation override amounts before mutation', async () => {
    const snapshot = cloneModel(model);

    await expect(
      runCorrection({
        ...correctionRequest,
        dependents: [
          {
            ...correctionRequest.dependents[0],
            overrideAdjustments: { participationAmount: '0.000000' },
          },
        ],
      })
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
  });

  it('atomically supersedes tranche and participation while rewriting changed compat rows', async () => {
    const result = await runCorrection();

    expect(result.replayed).toBe(false);
    expect(
      model.statements.find((statement) => statement.text.includes('pg_advisory_xact_lock'))?.params
    ).toContain(`fund-identity:${FUND_ID}`);
    expect(result.value.correctedTranche.version).toBe(2);
    expect(result.value.participationSuccessors).toHaveLength(1);
    expect(result.value.participationSuccessors[0]?.version).toBe(2);
    expect(result.value.compat.rewrittenParticipationIds).toEqual([701]);
    expect(model.tranches.find((row) => row.id === 500)?.superseded_by_tranche_id).toBe(501);
    expect(model.participations.find((row) => row.id === 700)?.superseded_by_participation_id).toBe(
      701
    );
    expect(model.investments[0]).toMatchObject({
      vehicle_participation_id: 701,
      amount: '110.00',
      round: 'Series A',
      version: 2,
    });
    expect(model.rounds.find((row) => row.supersedes_round_id === 810)).toMatchObject({
      vehicle_participation_id: 701,
      investment_amount: '110.000000',
    });
    const replacement = model.cashFlows.find(
      (row) => row.vehicle_participation_id === 701 && row.event_type === 'portfolio_investment'
    );
    expect(model.cashFlows.find((row) => row.id === 820)?.status).toBe('reversed');
    expect(model.cashFlows.find((row) => row.reversal_of_event_id === 820)).toMatchObject({
      amount: '100.000000',
    });
    expect(replacement?.reversal_of_event_id).toBeNull();
    expect(replacement?.supersedes_event_id).toBeNull();
    expect(model.lots).toHaveLength(1);
    expect(model.lots[0]?.vehicle_participation_id).toBe(701);
    expect(result.value.reconciliationCaseIds).toHaveLength(1);
  });

  it('rejects an ambiguous identity link before any correction persists', async () => {
    model.identityLinks = [22, 23];
    const snapshot = cloneModel(model);

    await expect(runCorrection()).rejects.toMatchObject({
      status: 409,
      code: 'IDENTITY_LINK_AMBIGUOUS',
    });

    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
    expect(model.investments).toEqual(snapshot.investments);
    expect(model.rounds).toEqual(snapshot.rounds);
    expect(model.cashFlows).toEqual(snapshot.cashFlows);
    expect(model.lots).toEqual(snapshot.lots);
    expect(model.observations).toEqual(snapshot.observations);
    expect(model.cases).toEqual(snapshot.cases);
  });

  it('emits a newly representable lot when the old participation had none', async () => {
    model.lots = [];

    const result = await runCorrection();

    expect(result.value.compat.emittedLotParticipationIds).toEqual([701]);
    expect(result.value.compat.removedLotParticipationIds).toEqual([]);
    expect(model.lots).toHaveLength(1);
    expect(model.lots[0]?.vehicle_participation_id).toBe(701);
  });

  it('rolls back when an optimistic compat investment update loses its race', async () => {
    model.failInvestmentUpdate = true;
    const snapshot = cloneModel(model);

    await expect(runCorrection()).rejects.toMatchObject({
      status: 409,
      code: 'PARTICIPATION_VERSION_CONFLICT',
    });

    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
    expect(model.investments).toEqual(snapshot.investments);
    expect(model.rounds).toEqual(snapshot.rounds);
    expect(model.cashFlows).toEqual(snapshot.cashFlows);
    expect(model.lots).toEqual(snapshot.lots);
  });

  it('rolls back when the approved cash-flow head changes before reversal', async () => {
    model.failCashFlowUpdate = true;
    const snapshot = cloneModel(model);

    await expect(runCorrection()).rejects.toMatchObject({
      status: 409,
      code: 'PARTICIPATION_VERSION_CONFLICT',
    });

    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
    expect(model.investments).toEqual(snapshot.investments);
    expect(model.rounds).toEqual(snapshot.rounds);
    expect(model.cashFlows).toEqual(snapshot.cashFlows);
    expect(model.lots).toEqual(snapshot.lots);
  });

  it('does not rewrite compat rows for a non-money correction', async () => {
    const result = await runCorrection({
      ...correctionRequest,
      correctedTranche: {
        ...correctionRequest.correctedTranche,
        investmentAmount: '1000.000000',
        closingDate: '2026-02-01',
        pricePerShare: '10.000000',
        descriptiveTerms: { boardObserver: true },
      },
      dependents: [
        {
          ...correctionRequest.dependents[0],
          overrideAdjustments: undefined,
        },
      ],
    });

    expect(result.value.compat.rewrittenParticipationIds).toEqual([]);
    expect(result.value.compat.unchangedParticipationIds).toEqual([701]);
    expect(result.value.warnings).toEqual([]);
    expect(model.investments[0]).toMatchObject({
      vehicle_participation_id: 700,
      version: 1,
    });
    expect(model.rounds).toHaveLength(1);
    expect(model.cashFlows).toHaveLength(1);
    expect(model.lots[0]?.vehicle_participation_id).toBe(700);
  });

  it.each([
    ['investment round', () => (model.rounds = [])],
    ['cash-flow event', () => (model.cashFlows = [])],
  ])('rolls back when required compat %s is missing', async (_label, removeCompat) => {
    removeCompat();
    const snapshot = cloneModel(model);

    await expect(runCorrection()).rejects.toMatchObject({
      status: 500,
      code: 'LEDGER_WRITE_FAILED',
    });

    expect(model.tranches).toEqual(snapshot.tranches);
    expect(model.participations).toEqual(snapshot.participations);
    expect(model.investments).toEqual(snapshot.investments);
  });

  it('removes a lot when corrected terms become unrepresentable', async () => {
    const result = await runCorrection({
      ...correctionRequest,
      correctedTranche: {
        ...correctionRequest.correctedTranche,
        pricePerShare: '10.000001',
      },
    });

    expect(result.value.warnings).toContain('LOT_OMITTED_UNREPRESENTABLE');
    expect(result.value.compat.removedLotParticipationIds).toEqual([701]);
    expect(model.lots).toHaveLength(0);
  });

  it('replays a completed correction without new mutations', async () => {
    const first = await runCorrection();
    const snapshot = cloneModel(model);
    const replay = await runCorrection();

    expect(replay.value as LedgerCorrectionReceiptV1).toEqual(first.value);
    expect(replay.replayed).toBe(true);
    expect(model.tranches).toHaveLength(snapshot.tranches.length);
    expect(model.participations).toHaveLength(snapshot.participations.length);
    expect(model.cashFlows).toHaveLength(snapshot.cashFlows.length);
  });
});
