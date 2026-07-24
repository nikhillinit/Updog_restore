/**
 * Task 9 financing-ledger service behaviour.
 *
 * The service speaks raw `sql` templates, so the double renders each statement
 * through `PgDialect` and answers from a tiny in-memory model. That keeps the
 * assertions on real SQL text and real parameter binding rather than on a
 * query-builder mock that could drift from what Postgres would receive.
 */
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { FundScopeError } from '../../../../server/lib/fund-scoped-ownership';
import {
  correctFinancingTranche,
  createFinancingEvent,
  loadFinancingEventDetail,
  recordFinancingTranche,
} from '../../../../server/services/investment-ledger/financing-event-service';
import { USD_FX_RATE_TO_USD } from '../../../../shared/contracts/investment-ledger/financing-event.contract';

const dialect = new PgDialect();
const FUND_ID = 7;
const CREATED_AT = new Date('2026-03-01T00:00:00.000Z');

interface Statement {
  text: string;
  params: unknown[];
}

interface EventRow {
  id: number;
  fund_id: number;
  company_identity_id: number;
  event_key: string;
  round_name: string;
  security_type: string;
  event_date: string;
  currency: string;
  round_size: string | null;
  pre_money_valuation: string | null;
  post_money_valuation: string | null;
  price_per_share: string | null;
  created_by: number | null;
  idempotency_key: string;
  request_hash: string;
  created_at: Date;
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

interface LedgerModel {
  identities: Map<number, number | null>;
  identityNames: Map<number, string>;
  events: EventRow[];
  tranches: TrancheRow[];
  observations: Array<Record<string, unknown>>;
  owned: boolean;
  nextEventId: number;
  nextTrancheId: number;
  nextObservationId: number;
  statements: Statement[];
}

function emptyModel(): LedgerModel {
  return {
    identities: new Map([[11, null]]),
    identityNames: new Map([[11, 'Acme Robotics']]),
    events: [],
    tranches: [],
    observations: [],
    owned: true,
    nextEventId: 100,
    nextTrancheId: 500,
    nextObservationId: 900,
    statements: [],
  };
}

function thenableRows(rows: readonly unknown[]): unknown {
  const chain: unknown = new Proxy(() => undefined, {
    get(_target, property) {
      if (property === 'then') {
        return (resolve: (value: readonly unknown[]) => void, reject: (reason: unknown) => void) =>
          Promise.resolve(rows).then(resolve, reject);
      }
      return () => chain;
    },
  });
  return chain;
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

/**
 * Zip the INSERT's own column list against its VALUES list rather than assuming
 * positions: the service inlines some values (`1`, `NULL`, `'manual'`) as SQL
 * literals, so a params-index mapping would silently drift from the statement.
 */
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

function eventRow(model: LedgerModel, parsed: Record<string, unknown>): EventRow {
  return {
    ...(parsed as unknown as EventRow),
    id: model.nextEventId++,
    created_at: CREATED_AT,
  };
}

function trancheRow(id: number, parsed: Record<string, unknown>): TrancheRow {
  const descriptiveTerms = parsed['descriptive_terms'];
  return {
    ...(parsed as unknown as TrancheRow),
    id,
    descriptive_terms:
      typeof descriptiveTerms === 'string'
        ? (JSON.parse(descriptiveTerms) as Record<string, unknown>)
        : ((descriptiveTerms as Record<string, unknown> | null) ?? {}),
    created_at: CREATED_AT,
  };
}

function resolveChain(model: LedgerModel, startId: number): unknown[] {
  const rows: unknown[] = [];
  let cursor: number | null = startId;
  while (cursor !== null && model.identities.has(cursor)) {
    const merged: number | null = model.identities.get(cursor) ?? null;
    rows.push({ id: cursor, merged_into_identity_id: merged });
    cursor = merged;
  }
  return rows;
}

function runFinancingEventSelect(
  model: LedgerModel,
  flat: string,
  params: unknown[]
): { rows: unknown[] } {
  if (flat.includes('idempotency_key =')) {
    const [fundId, key] = params as [number, string];
    const row = model.events.find((e) => e.fund_id === fundId && e.idempotency_key === key);
    return { rows: row ? [row] : [] };
  }
  if (flat.includes('company_identity_id =')) {
    const [fundId, identityId, eventKey] = params as [number, number, string];
    const row = model.events.find(
      (e) =>
        e.fund_id === fundId && e.company_identity_id === identityId && e.event_key === eventKey
    );
    return { rows: row ? [row] : [] };
  }
  const [eventId, fundId] = params as [number, number];
  const row = model.events.find((e) => e.id === eventId && e.fund_id === fundId);
  return { rows: row ? [row] : [] };
}

function runFinancingTrancheSelect(
  model: LedgerModel,
  flat: string,
  params: unknown[]
): { rows: unknown[] } {
  if (flat.includes('idempotency_key =')) {
    const [fundId, key] = params as [number, string];
    const row = model.tranches.find((t) => t.fund_id === fundId && t.idempotency_key === key);
    return { rows: row ? [row] : [] };
  }
  if (flat.includes('FOR UPDATE')) {
    const [trancheId, fundId] = params as [number, number];
    const row = model.tranches.find(
      (t) => t.id === trancheId && t.fund_id === fundId && t.superseded_by_tranche_id === null
    );
    return { rows: row ? [row] : [] };
  }
  const [eventId, fundId] = params as [number, number];
  const rows = model.tranches.filter(
    (t) => t.financing_event_id === eventId && t.fund_id === fundId
  );
  return {
    rows: flat.includes('superseded_by_tranche_id IS NULL')
      ? rows.filter((t) => t.superseded_by_tranche_id === null)
      : rows,
  };
}

function runTrancheUpdate(
  model: LedgerModel,
  flat: string,
  params: unknown[]
): { rows: unknown[] } {
  if (flat.includes('source_observation_id =')) {
    const [supersededBy, observationId, trancheId, fundId] = params as [
      number | null,
      number,
      number,
      number,
    ];
    const row = model.tranches.find((t) => t.id === trancheId && t.fund_id === fundId);
    if (!row) return { rows: [] };
    row.superseded_by_tranche_id = supersededBy;
    row.source_observation_id = observationId;
    return { rows: [row] };
  }
  const [newHeadId, currentId, fundId] = params as [number, number, number];
  const row = model.tranches.find(
    (t) => t.id === currentId && t.fund_id === fundId && t.superseded_by_tranche_id === null
  );
  if (!row) return { rows: [] };
  row.superseded_by_tranche_id = newHeadId;
  return { rows: [{ id: row.id }] };
}

function runStatement(model: LedgerModel, text: string, params: unknown[]): { rows: unknown[] } {
  const flat = text.replace(/\s+/g, ' ').trim();

  if (flat.includes('WITH RECURSIVE chain')) {
    return { rows: resolveChain(model, params[0] as number) };
  }
  if (flat.includes("nextval('financing_tranches_id_seq')")) {
    return { rows: [{ id: model.nextTrancheId++ }] };
  }
  if (flat.includes("nextval('source_observations_id_seq')")) {
    return { rows: [{ id: model.nextObservationId++ }] };
  }

  if (flat.startsWith('INSERT INTO financing_events')) {
    const row = eventRow(model, parseInsert(flat, params));
    model.events.push(row);
    return { rows: [row] };
  }

  if (flat.startsWith('INSERT INTO financing_tranches')) {
    // The correction path preallocates the id; the first-version path does not.
    const parsed = parseInsert(flat, params);
    const preallocated = parsed['id'];
    const row = trancheRow(
      typeof preallocated === 'number' ? preallocated : model.nextTrancheId++,
      parsed
    );
    model.tranches.push(row);
    return { rows: [row] };
  }

  if (flat.startsWith('INSERT INTO source_observations')) {
    const row = parseInsert(flat, params);
    model.observations.push(row);
    return { rows: [{ id: row['id'] }] };
  }

  if (flat.startsWith('UPDATE financing_tranches')) {
    return runTrancheUpdate(model, flat, params);
  }

  if (flat.startsWith('SELECT e.company_identity_id, i.canonical_name')) {
    const [eventId, fundId] = params as [number, number];
    const event = model.events.find((e) => e.id === eventId && e.fund_id === fundId);
    if (!event) return { rows: [] };
    return {
      rows: [
        {
          company_identity_id: event.company_identity_id,
          canonical_name: model.identityNames.get(event.company_identity_id) ?? 'Unknown',
        },
      ],
    };
  }

  if (flat.includes('count(DISTINCT tranche_key)')) {
    const [fundId, eventId, trancheKey] = params as [number, number, string];
    const keys = new Set(
      model.tranches
        .filter(
          (t) =>
            t.fund_id === fundId && t.financing_event_id === eventId && t.tranche_key !== trancheKey
        )
        .map((t) => t.tranche_key)
    );
    return { rows: [{ count: keys.size }] };
  }

  if (flat.startsWith('SELECT * FROM financing_events')) {
    return runFinancingEventSelect(model, flat, params);
  }
  if (flat.startsWith('SELECT * FROM financing_tranches')) {
    return runFinancingTrancheSelect(model, flat, params);
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
    select: () => thenableRows(model.owned ? [{ id: 1 }] : []),
    transaction: async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => callback(database),
  };
  return database as never;
}

function statementsMatching(model: LedgerModel, needle: string): Statement[] {
  return model.statements.filter((statement) =>
    statement.text.replace(/\s+/g, ' ').includes(needle)
  );
}

const eventRequest = {
  companyIdentityId: 11,
  eventKey: 'series-a-2026',
  roundName: 'Series A',
  securityType: 'equity' as const,
  eventDate: '2026-02-01',
  currency: 'USD',
  postMoneyValuation: '40000000.000000',
};

const trancheRequest = {
  trancheKey: 'first-close',
  closingDate: '2026-02-01',
  securityType: 'equity' as const,
  investmentAmount: '2500000.000000',
  pricePerShare: '4.250000',
};

const correctionRequest = {
  closingDate: '2026-02-01',
  securityType: 'equity' as const,
  investmentAmount: '2750000.000000',
  pricePerShare: '4.250000',
};

let model: LedgerModel;

beforeEach(() => {
  model = emptyModel();
});

async function seedEvent(idempotencyKey = 'evt-1') {
  return createFinancingEvent({
    fundId: FUND_ID,
    actorId: 3,
    idempotencyKey,
    request: eventRequest,
    database: makeDatabase(model),
  });
}

async function seedTranche(idempotencyKey = 'tr-1', overrides: Record<string, unknown> = {}) {
  const event = model.events[0];
  if (!event) throw new Error('seedEvent must run first');
  return recordFinancingTranche({
    fundId: FUND_ID,
    eventId: event.id,
    actorId: 3,
    idempotencyKey,
    request: { ...trancheRequest, ...overrides },
    database: makeDatabase(model),
  });
}

async function correctHead(trancheId: number, idempotencyKey: string, amount?: string) {
  return correctFinancingTranche({
    fundId: FUND_ID,
    trancheId,
    actorId: 3,
    idempotencyKey,
    request: amount ? { ...correctionRequest, investmentAmount: amount } : correctionRequest,
    database: makeDatabase(model),
  });
}

describe('createFinancingEvent', () => {
  it('creates the canonical event once and resolves later closings onto it', async () => {
    const first = await seedEvent('evt-1');
    expect(first.replayed).toBe(false);
    expect(first.value.eventKey).toBe('series-a-2026');

    const second = await createFinancingEvent({
      fundId: FUND_ID,
      actorId: 3,
      idempotencyKey: 'evt-2-different-key',
      request: eventRequest,
      database: makeDatabase(model),
    });

    // Acceptance 1: a second closing reuses the same parent identity and event.
    expect(second.replayed).toBe(true);
    expect(second.value.id).toBe(first.value.id);
    expect(model.events).toHaveLength(1);
    expect(statementsMatching(model, 'INSERT INTO financing_events')).toHaveLength(1);
  });

  it('resolves a merged company identity to its merge-chain head', async () => {
    model.identities = new Map([
      [11, 21],
      [21, null],
    ]);
    model.identityNames.set(21, 'Acme Robotics');

    const created = await seedEvent('evt-merged');

    expect(created.value.companyIdentityId).toBe(21);
  });

  it('replays an identical command and rejects key reuse with a different payload', async () => {
    const first = await seedEvent('evt-1');

    const replay = await seedEvent('evt-1');
    expect(replay.replayed).toBe(true);
    expect(replay.value.id).toBe(first.value.id);
    expect(model.events).toHaveLength(1);

    await expect(
      createFinancingEvent({
        fundId: FUND_ID,
        actorId: 3,
        idempotencyKey: 'evt-1',
        request: { ...eventRequest, roundName: 'Series A-1' },
        database: makeDatabase(model),
      })
    ).rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSE' });
  });

  it('refuses an identity that does not exist in the fund', async () => {
    model.identities = new Map();

    await expect(seedEvent('evt-cross-fund')).rejects.toMatchObject({
      code: 'IDENTITY_NOT_FOUND',
    });
  });
});

describe('recordFinancingTranche', () => {
  it('writes version 1 and synthesizes an accepted manual observation in the same transaction', async () => {
    await seedEvent();
    const recorded = await seedTranche();

    expect(recorded.replayed).toBe(false);
    expect(recorded.value.version).toBe(1);
    expect(recorded.value.supersededByTrancheId).toBeNull();
    expect(recorded.value.fxRateToUsd).toBe(USD_FX_RATE_TO_USD);

    expect(model.observations).toHaveLength(1);
    const observation = model.observations[0];
    expect(observation?.['dependency_group_key']).toBe(`source-observation:${observation?.['id']}`);
    expect(observation?.['source_locator']).toBe('financing-tranche:first-close');

    const inserts = statementsMatching(model, 'INSERT INTO source_observations');
    expect(inserts).toHaveLength(1);
    const insertText = inserts[0]?.text.replace(/\s+/g, ' ') ?? '';
    expect(insertText).toContain("'manual'");
    expect(insertText).toContain("'accepted'");
    expect(insertText).toContain('dependency_group_key');

    // The observation id is linked back onto the tranche before the tx returns.
    expect(recorded.value.sourceObservationId).toBe(observation?.['id']);
  });

  it('labels the first closing initial and later closings follow-on', async () => {
    await seedEvent();
    await seedTranche('tr-1');
    await seedTranche('tr-2', { trancheKey: 'second-close', closingDate: '2026-04-01' });

    const payloads = model.observations.map((observation) =>
      JSON.stringify(observation['normalized_payload'])
    );
    expect(payloads[0]).toContain('initial_investment');
    expect(payloads[1]).toContain('follow_on_investment');
  });

  it('rejects a tranche on an event outside the fund', async () => {
    await seedEvent();
    model.owned = false;

    await expect(seedTranche('tr-cross-fund')).rejects.toBeInstanceOf(FundScopeError);
  });

  it('replays a repeated idempotency key without a second insert', async () => {
    await seedEvent();
    const first = await seedTranche('tr-1');
    const replay = await seedTranche('tr-1');

    expect(replay.replayed).toBe(true);
    expect(replay.value.id).toBe(first.value.id);
    expect(model.tranches).toHaveLength(1);
    expect(model.observations).toHaveLength(1);
  });
});

describe('correctFinancingTranche', () => {
  it('supersedes the head with a new version and never edits the corrected row', async () => {
    await seedEvent();
    const original = await seedTranche('tr-1');
    const originalRow = { ...(model.tranches[0] as TrancheRow) };

    const corrected = await correctHead(original.value.id, 'tr-1-fix');

    // Acceptance 2: a correction is a new version row, not an in-place edit.
    expect(corrected.value.version).toBe(2);
    expect(corrected.value.trancheKey).toBe(originalRow.tranche_key);
    expect(corrected.value.investmentAmount).toBe('2750000.000000');
    expect(corrected.value.supersededByTrancheId).toBeNull();

    const supersededRow = model.tranches.find((tranche) => tranche.id === original.value.id);
    expect(supersededRow?.superseded_by_tranche_id).toBe(corrected.value.id);
    expect(supersededRow?.investment_amount).toBe(originalRow.investment_amount);
    expect(supersededRow?.price_per_share).toBe(originalRow.price_per_share);
    expect(supersededRow?.version).toBe(1);

    // Exactly one head remains for the tranche identity.
    const heads = model.tranches.filter(
      (tranche) =>
        tranche.tranche_key === originalRow.tranche_key && tranche.superseded_by_tranche_id === null
    );
    expect(heads).toHaveLength(1);
    expect(model.observations).toHaveLength(2);
  });

  it('refuses to correct a version that is no longer the head', async () => {
    await seedEvent();
    const original = await seedTranche('tr-1');
    await correctHead(original.value.id, 'tr-1-fix');

    await expect(
      correctHead(original.value.id, 'tr-1-fix-again', '2900000.000000')
    ).rejects.toMatchObject({ status: 409, code: 'FINANCING_TRANCHE_NOT_CURRENT' });
  });
});

describe('loadFinancingEventDetail', () => {
  it('returns the event with current heads and the full version history', async () => {
    await seedEvent();
    const original = await seedTranche('tr-1');
    await correctHead(original.value.id, 'tr-1-fix');

    const event = model.events[0];
    if (!event) throw new Error('expected a seeded event');
    const detail = await loadFinancingEventDetail(FUND_ID, event.id, makeDatabase(model));

    expect(detail.event.id).toBe(event.id);
    expect(detail.headTranches).toHaveLength(1);
    expect(detail.headTranches[0]?.version).toBe(2);
    expect(detail.versionHistory).toHaveLength(2);
    expect(detail.versionHistory.map((tranche) => tranche.version)).toEqual([1, 2]);
  });
});
