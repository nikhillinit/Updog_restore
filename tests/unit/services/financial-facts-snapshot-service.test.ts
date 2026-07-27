import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import type { db } from '../../../server/db';
import { buildFinancialFactsSnapshot } from '../../../server/services/financial-facts-snapshot-service';
import { buildSelectionSetHash } from '../../../shared/contracts/financial-facts-snapshot-v1.contract';
import { funds } from '../../../shared/schema/fund';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
import { sourceObservations } from '../../../shared/schema/financial-observations';
import { investmentRoundModelOverrides } from '../../../shared/schema/investment-round-model-overrides';
import { investmentRounds } from '../../../shared/schema/investment-rounds';
import {
  cashFlowEvents,
  valuationMarks,
  vehicles,
} from '../../../shared/schema/lp-reporting-evidence';
import { investments, portfolioCompanies } from '../../../shared/schema/portfolio';
import {
  INTERNAL_FUND_CORPUS,
  loadCorpusExpected,
  loadCorpusInput,
  loadInternalFundCorpusManifest,
  serializeCorpusValue,
} from '../../utils/internal-fund-corpus';

type SnapshotDatabase = typeof db;
const OBSERVATION_HASH = 'a'.repeat(64);

function queryRows<T>(rows: T[]) {
  const query: {
    limit: (count: number) => Promise<T[]>;
    orderBy: (..._order: unknown[]) => typeof query;
    where: (_condition: unknown) => typeof query;
    then: Promise<T[]>['then'];
  } = {
    limit: (count: number) => Promise.resolve(rows.slice(0, count)),
    orderBy: (..._order: unknown[]) => query,
    where: (_condition: unknown) => query,
    then: <TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(rows).then(onfulfilled, onrejected),
  };
  return query;
}

function cashRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    fundId: 1,
    vehicleId: null,
    companyId: null,
    eventType: 'lp_capital_call',
    amount: '100.000000',
    currency: 'USD',
    eventDate: new Date('2026-06-30T00:00:00.000Z'),
    perspective: 'lp_net',
    status: 'approved',
    supersedesEventId: null,
    reversalOfEventId: null,
    importedFrom: 'financial_observation_v2',
    sourceHash: OBSERVATION_HASH,
    ...overrides,
  };
}

function acceptedObservation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 71,
    fundId: 1,
    companyIdentityId: 42,
    domain: 'ledger_event',
    effectiveDate: '2026-06-30',
    normalizedPayload: {
      domain: 'ledger_event',
      measureKey: 'capital_contribution',
    },
    observationHash: OBSERVATION_HASH,
    status: 'accepted',
    ...overrides,
  };
}

class FakeSnapshotDb {
  readonly fundRows = [{ id: 1, baseCurrency: 'USD' }];
  readonly companyRows: Array<Record<string, unknown>> = [];
  readonly investmentRows: Array<Record<string, unknown>> = [];
  readonly roundRows: Array<Record<string, unknown>> = [];
  readonly overrideRows: Array<Record<string, unknown>> = [];
  readonly vehicleRows: Array<Record<string, unknown>> = [];
  readonly cashRows: Array<Record<string, unknown>> = [];
  readonly valuationMarkReads: Array<Array<Record<string, unknown>>> = [];
  readonly markRows: Array<Record<string, unknown>> = [];
  readonly sourceObservationRows: Array<Record<string, unknown>> = [];
  readonly latestSelectionRows: Array<Record<string, unknown>> = [];
  readonly positionRefRows: Array<Record<string, unknown>> = [];
  readonly participationTermRefRows: Array<Record<string, unknown>> = [];
  readonly ownershipRefRows: Array<Record<string, unknown>> = [];
  readonly directValuationRefRows: Array<Record<string, unknown>> = [];
  readonly derivedValuationRefRows: Array<Record<string, unknown>> = [];
  readonly positionCompanyRefRows: Array<Record<string, unknown>> = [];
  readonly snapshotRows: Array<Record<string, unknown>> = [];
  readonly executedStatements: SQL[] = [];
  readonly valuationMarkWhereClauses: Array<{ sql: string; params: unknown[] }> = [];
  readonly transactionConfigs: Array<Record<string, unknown>> = [];
  readonly snapshotInsertAttempts: Array<Record<string, unknown>> = [];
  ownershipRows: Array<Record<string, unknown>> | null = null;
  insertSerializationFailuresRemaining = 0;
  transactionAttempts = 0;
  insertedSnapshotCount = 0;

  asDatabase(): SnapshotDatabase {
    return this as unknown as SnapshotDatabase;
  }

  async transaction<T>(
    callback: (transaction: SnapshotDatabase) => Promise<T>,
    config?: Record<string, unknown>
  ): Promise<T> {
    this.transactionAttempts += 1;
    this.transactionConfigs.push(config ?? {});
    return callback(this.asDatabase());
  }

  execute(query: SQL) {
    this.executedStatements.push(query);
    const rendered = new PgDialect().sqlToQuery(query).sql;
    if (rendered.includes('financial_facts_v2_position_refs')) {
      return Promise.resolve({ rows: this.positionRefRows });
    }
    if (rendered.includes('financial_facts_v2_position_company_refs')) {
      return Promise.resolve({ rows: this.positionCompanyRefRows });
    }
    if (rendered.includes('financial_facts_v2_participation_term_refs')) {
      return Promise.resolve({ rows: this.participationTermRefRows });
    }
    if (rendered.includes('financial_facts_v2_ownership_refs')) {
      return Promise.resolve({ rows: this.ownershipRefRows });
    }
    if (rendered.includes('financial_facts_v2_direct_valuation_refs')) {
      return Promise.resolve({ rows: this.directValuationRefRows });
    }
    if (rendered.includes('financial_facts_v2_derived_valuation_refs')) {
      return Promise.resolve({ rows: this.derivedValuationRefRows });
    }
    if (rendered.includes('pg_advisory_xact_lock')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: this.latestSelectionRows });
  }

  select(projection?: unknown) {
    return {
      from: (table: unknown) => {
        const rows = this.rowsFor(table, projection);
        const baseQuery = queryRows(rows);
        return {
          ...baseQuery,
          where: (condition: unknown) => {
          if (table === vehicles) {
            return queryRows(this.ownershipRows ?? this.vehicleRows);
          }
          if (table === valuationMarks) {
            const rendered = new PgDialect().sqlToQuery(condition as SQL);
            this.valuationMarkWhereClauses.push(rendered);
            if (rendered.params.includes('planning_company_fmv')) {
              return queryRows(
                rows.filter(
                  (row) =>
                    row['markPurpose'] === undefined ||
                    row['markPurpose'] === 'planning_company_fmv'
                )
              );
            }
          }
          if (table === financialFactsSnapshots) {
            const rendered = new PgDialect().sqlToQuery(condition as SQL);
            let filtered = rows;
            if (rendered.sql.includes('idempotency_key')) {
              const key = rendered.params.find((param) => typeof param === 'string');
              filtered = filtered.filter((row) => row['idempotencyKey'] === key);
            }
            if (rendered.sql.includes('as_of_date')) {
              const asOfDate = rendered.params.find(
                (param) => typeof param === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(param)
              );
              if (asOfDate !== undefined) {
                filtered = filtered.filter((row) => row['asOfDate'] === asOfDate);
              }
            }
            return queryRows(filtered);
          }
          return queryRows(rows);
        },
        };
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: () => {
            if (table !== financialFactsSnapshots) return Promise.resolve([]);
            this.snapshotInsertAttempts.push(values);
            if (this.insertSerializationFailuresRemaining > 0) {
              this.insertSerializationFailuresRemaining -= 1;
              throw Object.assign(new Error('serialization failure during insert'), {
                code: '40001',
              });
            }
            const conflict = this.snapshotRows.some(
              (row) =>
                row['fundId'] === values['fundId'] &&
                (row['idempotencyKey'] === values['idempotencyKey'] ||
                  row['snapshotInputHash'] === values['snapshotInputHash'])
            );
            if (conflict) return Promise.resolve([]);
            const inserted = { id: this.snapshotRows.length + 1, ...values };
            this.snapshotRows.push(inserted);
            this.insertedSnapshotCount += 1;
            return Promise.resolve([inserted]);
          },
        }),
      }),
    };
  }

  private rowsFor(table: unknown, _projection?: unknown): Array<Record<string, unknown>> {
    if (table === funds) return this.fundRows;
    if (table === portfolioCompanies) return this.companyRows;
    if (table === investments) return this.investmentRows;
    if (table === investmentRounds) return this.roundRows;
    if (table === investmentRoundModelOverrides) return this.overrideRows;
    if (table === vehicles) return this.vehicleRows;
    if (table === cashFlowEvents) return this.cashRows;
    if (table === valuationMarks) return this.valuationMarkReads.shift() ?? this.markRows;
    if (table === sourceObservations) return this.sourceObservationRows;
    if (table === financialFactsSnapshots) return this.snapshotRows;
    return [];
  }
}

function seedInternalFundCorpus(fakeDb: FakeSnapshotDb): void {
  fakeDb.fundRows.splice(
    0,
    fakeDb.fundRows.length,
    ...loadCorpusInput<Array<{ id: number; baseCurrency: string }>>('legacy-inputs/funds.json')
  );
  fakeDb.companyRows.push(
    ...loadCorpusInput<Array<Record<string, unknown>>>(
      'legacy-inputs/portfolio-companies.json'
    ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
  );
  fakeDb.investmentRows.push(
    ...loadCorpusInput<Array<Record<string, unknown>>>('legacy-inputs/investments.json').filter(
      (row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId
    )
  );
  fakeDb.roundRows.push(
    ...loadCorpusInput<Array<Record<string, unknown>>>(
      'legacy-inputs/investment-rounds.json'
    ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
  );
  fakeDb.overrideRows.push(
    ...loadCorpusInput<Array<Record<string, unknown>>>(
      'legacy-inputs/investment-round-overrides.json'
    ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
  );
  fakeDb.vehicleRows.push(
    ...loadCorpusInput<Array<Record<string, unknown>>>('legacy-inputs/vehicles.json')
      .filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
      .map(({ id, ...row }) => ({ vehicleId: id, ...row }))
  );
  const snapshotMarkRows = loadCorpusInput<Array<Record<string, unknown>>>(
    'legacy-inputs/valuation-marks.json'
  ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId);
  const planningMarkRows = snapshotMarkRows
    .filter(
      (row) =>
        row['importedFrom'] === 'planning_fmv_override' &&
        (row['status'] === 'approved' || row['status'] === 'locked')
    )
    .map(({ importedFrom: _importedFrom, vehicleId: _vehicleId, priorMarkId: _priorMarkId, ...row }) => row);
  fakeDb.valuationMarkReads.push(snapshotMarkRows, planningMarkRows);
  fakeDb.markRows.push(...snapshotMarkRows);
}

describe('buildFinancialFactsSnapshot', () => {
  it('matches the legacy internal-fund corpus for split cash-flow and valuation authority', async () => {
    loadInternalFundCorpusManifest();
    const fakeDb = new FakeSnapshotDb();
    fakeDb.fundRows.splice(
      0,
      fakeDb.fundRows.length,
      ...loadCorpusInput<Array<{ id: number; baseCurrency: string }>>('legacy-inputs/funds.json')
    );
    fakeDb.companyRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>(
        'legacy-inputs/portfolio-companies.json'
      ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
    );
    fakeDb.investmentRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>('legacy-inputs/investments.json').filter(
        (row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId
      )
    );
    fakeDb.roundRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>(
        'legacy-inputs/investment-rounds.json'
      ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
    );
    fakeDb.overrideRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>(
        'legacy-inputs/investment-round-overrides.json'
      ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
    );
    fakeDb.vehicleRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>('legacy-inputs/vehicles.json')
        .filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
        .map(({ id, ...row }) => ({ vehicleId: id, ...row }))
    );
    fakeDb.cashRows.push(
      ...loadCorpusInput<Array<Record<string, unknown>>>(
        'legacy-inputs/cash-flow-events.json'
      ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId)
    );
    const snapshotMarkRows = loadCorpusInput<Array<Record<string, unknown>>>(
      'legacy-inputs/valuation-marks.json'
    ).filter((row) => row['fundId'] === INTERNAL_FUND_CORPUS.fundId);
    const planningMarkRows = snapshotMarkRows
      .filter(
        (row) =>
          row['importedFrom'] === 'planning_fmv_override' &&
          (row['status'] === 'approved' || row['status'] === 'locked')
      )
      .map(
        ({
          importedFrom: _importedFrom,
          vehicleId: _vehicleId,
          priorMarkId: _priorMarkId,
          ...row
        }) => row
      );
    fakeDb.valuationMarkReads.push(snapshotMarkRows, planningMarkRows);
    fakeDb.markRows.push(...snapshotMarkRows);

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: INTERNAL_FUND_CORPUS.fundId,
      asOfDate: INTERNAL_FUND_CORPUS.asOfDate,
      actorId: INTERNAL_FUND_CORPUS.actorId,
      idempotencyKey: 'internal-fund-corpus-snapshot',
      database: fakeDb.asDatabase(),
      now: INTERNAL_FUND_CORPUS.fixedClock,
    });

    expect(snapshot.payload.sourceObservationIds).toEqual([]);
    expect(snapshot.payload.workingValueSelectionIds).toEqual([]);
    expect(snapshot.payload.participationTermRefs).toEqual([]);
    const expectedSnapshot = loadCorpusExpected<Record<string, unknown>>(
      'expected-facts/financial-facts-snapshot.json'
    );
    const payload = snapshot.payload as Record<string, unknown>;
    const expectedPayload = expectedSnapshot['payload'] as Record<string, unknown>;
    const legacyComparablePayload = {
      ...payload,
      cashFlowSeries: {
        ...(payload['cashFlowSeries'] as Record<string, unknown>),
        warnings: (expectedPayload['cashFlowSeries'] as Record<string, unknown>)['warnings'],
      },
      participationTermRefs: [],
    };
    delete legacyComparablePayload['positionRefs'];
    delete legacyComparablePayload['positionComponentRefs'];
    delete legacyComparablePayload['ownershipRefs'];
    delete legacyComparablePayload['valuationRefs'];
    delete legacyComparablePayload['observationRefs'];
    expect(
      serializeCorpusValue({
        ...snapshot,
        payloadSchemaId: undefined,
        policyVersion: expectedSnapshot['policyVersion'],
        snapshotInputHash: expectedSnapshot['snapshotInputHash'],
        payload: legacyComparablePayload,
      })
    ).toEqual(expectedSnapshot);
    expect(serializeCorpusValue(legacyComparablePayload.cashFlowSeries)).toEqual(
      loadCorpusExpected('expected-cash-flows/financial-facts-cash-flow-series.json')
    );
    expect(serializeCorpusValue(snapshot.payload.marksSeries)).toEqual(
      loadCorpusExpected('expected-valuations/financial-facts-marks-series.json')
    );
  });

  it('rejects every client-supplied knowledge cutoff', async () => {
    await expect(
      buildFinancialFactsSnapshot({
        fundId: 1,
        asOfDate: '2026-06-30',
        knowledgeCutoff: '2026-06-30T23:59:59.000Z',
        actorId: 7,
        idempotencyKey: 'snapshot-cutoff-rejected',
      })
    ).rejects.toMatchObject({ status: 400, code: 'CUTOFF_NOT_ACCEPTED' });
  });

  it('includes only cash-flow facts effective on or before the as-of date', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.cashRows.push(
      {
        id: 1,
        fundId: 1,
        vehicleId: null,
        companyId: null,
        eventType: 'lp_capital_call',
        amount: '100.000000',
        currency: 'USD',
        eventDate: new Date('2026-06-30T23:59:59.000Z'),
        perspective: 'lp_net',
        status: 'approved',
        supersedesEventId: null,
        reversalOfEventId: null,
      },
      {
        id: 2,
        fundId: 1,
        vehicleId: null,
        companyId: null,
        eventType: 'lp_distribution',
        amount: '25.000000',
        currency: 'USD',
        eventDate: new Date('2026-07-01T00:00:00.000Z'),
        perspective: 'lp_net',
        status: 'locked',
        supersedesEventId: null,
        reversalOfEventId: null,
      }
    );

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-effective-date',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.cashFlowSeries.series).toHaveLength(1);
    expect(snapshot.payload.cashFlowSeries.series[0]?.points.map((point) => point.eventId)).toEqual(
      [1]
    );
    expect(snapshot.payload.cashFlowSeries.totals.contributions).toBe('100.000000');
  });

  it('rejects a vehicle subset and accepts the same full roster in any order', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.vehicleRows.push(
      {
        id: 10,
        vehicleId: 10,
        vehicleType: 'main_fund',
        vehicleSlug: 'main',
        name: 'Main Fund',
        currency: 'USD',
      },
      {
        id: 20,
        vehicleId: 20,
        vehicleType: 'spv',
        vehicleSlug: 'spv-one',
        name: 'SPV One',
        currency: 'USD',
      }
    );

    await expect(
      buildFinancialFactsSnapshot({
        fundId: 1,
        vehicleIds: [10],
        asOfDate: '2026-06-30',
        actorId: 7,
        idempotencyKey: 'snapshot-subset',
        database: fakeDb.asDatabase(),
        now: new Date('2026-07-22T01:42:44.186Z'),
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'VEHICLE_SCOPE_UNSUPPORTED',
      message: 'Policy 1.1.0 supports only the complete fund vehicle roster.',
    });

    const accepted = await buildFinancialFactsSnapshot({
      fundId: 1,
      vehicleIds: [20, 10],
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-full-roster',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(accepted.vehicleIds).toEqual([10, 20]);
  });

  it('applies the R35 cash-flow status, chain, perspective, recallable, and currency pins', async () => {
    const fakeDb = new FakeSnapshotDb();
    const base = {
      fundId: 1,
      vehicleId: null,
      companyId: null,
      currency: 'USD',
      eventDate: new Date('2026-06-15T00:00:00.000Z'),
      status: 'approved',
      supersedesEventId: null,
      reversalOfEventId: null,
    };
    fakeDb.cashRows.push(
      { ...base, id: 1, eventType: 'lp_capital_call', amount: '100.000000', perspective: 'lp_net' },
      {
        ...base,
        id: 2,
        eventType: 'lp_capital_call',
        amount: '999.000000',
        perspective: 'lp_net',
        status: 'draft',
      },
      {
        ...base,
        id: 3,
        eventType: 'lp_distribution',
        amount: '50.000000',
        perspective: 'lp_net',
        status: 'locked',
      },
      {
        ...base,
        id: 4,
        eventType: 'reversal',
        amount: '-50.000000',
        perspective: 'lp_net',
        reversalOfEventId: 3,
      },
      {
        ...base,
        id: 5,
        eventType: 'recallable_distribution',
        amount: '10.000000',
        perspective: 'lp_net',
      },
      {
        ...base,
        id: 6,
        eventType: 'realized_proceeds',
        amount: '20.000000',
        perspective: 'fund_gross',
      },
      {
        ...base,
        id: 7,
        eventType: 'realized_proceeds',
        amount: '500.000000',
        perspective: 'company',
      },
      {
        ...base,
        id: 8,
        eventType: 'lp_distribution',
        amount: '25.000000',
        perspective: 'lp_net',
        currency: 'EUR',
      },
      { ...base, id: 9, eventType: 'lp_capital_call', amount: '33.000000', perspective: 'lp_net' },
      {
        ...base,
        id: 10,
        eventType: 'lp_capital_call',
        amount: '44.000000',
        perspective: 'lp_net',
        supersedesEventId: 9,
      }
    );

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-cash-r35',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.cashFlowSeries.totals).toEqual({
      contributions: '90.000000',
      distributions: '20.000000',
      recallableDistributions: '10.000000',
    });
    expect(
      snapshot.payload.cashFlowSeries.series.flatMap((series) =>
        series.points.map((point) => point.eventId)
      )
    ).toEqual([1, 6, 5]);
    expect(
      snapshot.payload.cashFlowSeries.series.find(
        (series) => series.eventType === 'realized_proceeds'
      )
    ).toMatchObject({ perspective: 'fund_gross', points: [{ eventId: 6 }] });
    expect(snapshot.payload.cashFlowSeries.warnings).toEqual([
      expect.objectContaining({
        code: 'NON_USD_CASH_FLOW_EXCLUDED',
        severity: 'warning',
        source: 'cash_flow_events:8',
      }),
    ]);
  });

  it('round-trips the vehicle roster and composes period NAV from marks effective by each period end', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.vehicleRows.push({
      id: 10,
      vehicleId: 10,
      vehicleType: 'main_fund',
      vehicleSlug: 'main',
      name: 'Main Fund',
      currency: 'USD',
    });
    const markBase = {
      fundId: 1,
      vehicleId: 10,
      currency: 'USD',
      status: 'approved',
      confidenceLevel: 'high',
      markPurpose: 'planning_company_fmv',
    };
    fakeDb.markRows.push(
      {
        ...markBase,
        id: 1,
        companyId: 42,
        markDate: '2026-03-31',
        asOfDate: '2026-03-31',
        fairValue: '100.000000',
      },
      {
        ...markBase,
        id: 2,
        companyId: 43,
        markDate: '2026-03-31',
        asOfDate: '2026-03-31',
        fairValue: '200.000000',
        status: 'locked',
      },
      {
        ...markBase,
        id: 3,
        companyId: 42,
        markDate: '2026-06-30',
        asOfDate: '2026-06-30',
        fairValue: '150.000000',
      },
      {
        ...markBase,
        id: 4,
        companyId: 43,
        markDate: '2026-07-01',
        asOfDate: '2026-07-01',
        fairValue: '900.000000',
      },
      {
        ...markBase,
        id: 5,
        companyId: 44,
        markDate: '2026-06-30',
        asOfDate: '2026-06-30',
        fairValue: '800.000000',
        status: 'draft',
      },
      {
        ...markBase,
        id: 6,
        companyId: 45,
        markDate: '2026-06-30',
        asOfDate: '2026-06-30',
        fairValue: '999.000000',
        markPurpose: 'direct_position_fmv',
      }
    );

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-marks-nav',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.vehicleRoster).toEqual([
      {
        vehicleId: 10,
        vehicleType: 'main_fund',
        vehicleSlug: 'main',
        name: 'Main Fund',
        currency: 'USD',
      },
    ]);
    expect(snapshot.payload.marksSeries.marks.map((mark) => mark.markId)).toEqual([1, 2, 3]);
    expect(
      fakeDb.valuationMarkWhereClauses.some(
        (clause) =>
          clause.sql.includes('mark_purpose') &&
          clause.params.includes('planning_company_fmv') &&
          clause.sql.includes('created_at') &&
          clause.sql.includes('COALESCE')
      )
    ).toBe(true);
    expect(snapshot.payload.marksSeries.periodNav).toEqual([
      { periodEnd: '2026-03-31', nav: '300.000000', warnings: [] },
      {
        periodEnd: '2026-06-30',
        nav: '350.000000',
        warnings: [expect.objectContaining({ code: 'VALUATION_MARK_STALE' })],
      },
    ]);
  });

  it('blocks only the consumer whose populated dependency lacks observation lineage', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.cashRows.push({
      id: 1,
      fundId: 1,
      vehicleId: null,
      companyId: null,
      eventType: 'lp_capital_call',
      amount: '100.000000',
      currency: 'USD',
      eventDate: new Date('2026-06-30T00:00:00.000Z'),
      perspective: 'lp_net',
      status: 'approved',
      supersedesEventId: null,
      reversalOfEventId: null,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-consumers',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.consumerEvaluations).toEqual([
      { consumer: 'forecast', status: 'accepted', reasons: [] },
      { consumer: 'reserve', status: 'accepted', reasons: [] },
      {
        consumer: 'economics',
        status: 'blocked',
        reasons: ['unattributed_legacy_direct'],
      },
      { consumer: 'periodic_analysis', status: 'accepted', reasons: [] },
    ]);
  });

  it('attributes only accepted, as-of, domain-compatible observations from the V2 bridge', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.cashRows.push(cashRow());
    fakeDb.sourceObservationRows.push(acceptedObservation());
    fakeDb.latestSelectionRows.push({
      id: 91,
      fundId: 1,
      consumer: 'economics',
      companyIdentityId: 42,
      domain: 'ledger_event',
      measureKey: 'capital_contribution',
      selectedObservationId: 71,
      isDefault: false,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-linked-lineage',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.sourceObservationIds).toEqual([71]);
    expect(snapshot.payload.workingValueSelectionIds).toEqual([91]);
    expect(snapshot.selectionSetHash).toBe(
      buildSelectionSetHash({
        sourceObservationIds: [71],
        workingValueSelectionIds: [91],
      })
    );
    const selectionSql = fakeDb.executedStatements
      .map((statement) => new PgDialect().sqlToQuery(statement).sql)
      .find((rendered) => rendered.includes('WITH ranked_working_value_selections AS'))!;
    expect(selectionSql).toContain('WITH ranked_working_value_selections AS');
    expect(selectionSql).toContain('ROW_NUMBER() OVER');
    expect(selectionSql).toContain('selection.created_at <=');
    expect(selectionSql).toContain('successor.id = selection.superseded_by_selection_id');
    expect(selectionSql).toContain("observation.status = 'accepted'");
    expect(selectionSql).toContain('observation.created_at <=');
    expect(selectionSql).toContain('selection.as_of_date DESC, selection.id DESC');
    expect(
      snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'economics')
    ).toEqual({
      consumer: 'economics',
      status: 'blocked',
      reasons: ['working_value_selection_deviation'],
    });
  });

  it('emits payload 2 position, term, ownership, valuation, and observation provenance refs', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.sourceObservationRows.push(acceptedObservation());
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'conversion',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: 202,
      sourceObservationId: 71,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.participationTermRefRows.push({
      participationId: 202,
      participationVersion: 3,
      financingTrancheId: 302,
      trancheVersion: 4,
      vehicleId: 10,
      companyIdentityId: 42,
      isCurrent: true,
      kind: 'conversion_result',
    });
    fakeDb.ownershipRefRows.push({
      ownershipSnapshotId: 601,
      vehicleId: 10,
      companyIdentityId: 42,
      sourceObservationId: 71,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42,
      directSourceObservationId: 71,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-payload2-provenance',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.positionRefs).toEqual([
      expect.objectContaining({
        positionEventId: 501,
        eventType: 'conversion',
        vehicleParticipationId: 201,
        resultingParticipationId: 202,
      }),
    ]);
    expect(snapshot.payload.positionComponentRefs).toEqual([
      expect.objectContaining({
        kind: 'conversion_result',
        participationId: 202,
        financingTrancheId: 302,
      }),
    ]);
    expect(snapshot.payload.participationTermRefs).toEqual([
      {
        participationId: 202,
        participationVersion: 3,
        financingTrancheId: 302,
        trancheVersion: 4,
      },
    ]);
    expect(snapshot.payload.ownershipRefs).toEqual([
      expect.objectContaining({ ownershipSnapshotId: 601, sourceObservationId: 71 }),
    ]);
    expect(snapshot.payload.valuationRefs).toEqual([
      expect.objectContaining({
        basis: 'direct',
        directMarkId: 701,
        directSourceObservationId: 71,
      }),
    ]);
    expect(snapshot.payload.observationRefs).toEqual([
      {
        observationId: 71,
        domain: 'ledger_event',
        status: 'accepted',
        effectiveDate: '2026-06-30',
      },
    ]);
    const renderedSql = fakeDb.executedStatements.map(
      (statement) => new PgDialect().sqlToQuery(statement).sql
    );
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_participation_term_refs')))
      .toContain('participation.created_at <=');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_participation_term_refs')))
      .toContain('tranche_successor.created_at <=');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_position_refs')))
      .toContain('event.recorded_at <=');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_position_company_refs')))
      .toContain('link.company_identity_id = event.company_identity_id');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_ownership_refs')))
      .toContain('successor.recorded_at <=');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_direct_valuation_refs')))
      .toContain("observation.domain = 'valuation'");
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_direct_valuation_refs')))
      .toContain('COALESCE(mark.approved_at, mark.locked_at, mark.created_at) <=');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_derived_valuation_refs')))
      .toContain("observation.domain = 'ledger_event'");
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_derived_valuation_refs')))
      .toContain('COALESCE(participation.post_money_valuation, tranche.post_money_valuation)');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_derived_valuation_refs')))
      .toContain('snapshot.effective_date AS ownership_effective_date');
    expect(renderedSql.find((sql) => sql.includes('financial_facts_v2_derived_valuation_refs')))
      .toMatch(
        /ownership\.ownership_effective_date\s*>=\s*COALESCE\(participation\.closing_date,\s*tranche\.closing_date\)/
      );
    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({ consumer: 'forecast', status: 'accepted', reasons: [] });
  });

  it('emits a derived valuation ref only from accepted post-money evidence', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.ownershipRefRows.push({
      ownershipSnapshotId: 601,
      vehicleId: 10,
      companyIdentityId: 42,
      sourceObservationId: 71,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.derivedValuationRefRows.push({
      ownershipSnapshotId: 601,
      vehicleId: 10,
      companyIdentityId: 42,
      derivedTrancheId: 302,
      derivedTrancheVersion: 4,
      derivedParticipationId: 202,
      derivedParticipationVersion: 3,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-derived-valuation-ref',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.valuationRefs).toEqual([
      {
        basis: 'derived',
        vehicleId: 10,
        companyIdentityId: 42,
        directMarkId: null,
        directSourceObservationId: null,
        ownershipSnapshotId: 601,
        derivedTrancheId: 302,
        derivedTrancheVersion: 4,
        derivedParticipationId: 202,
        derivedParticipationVersion: 3,
      },
    ]);
    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({ consumer: 'forecast', status: 'accepted', reasons: [] });
  });

  it('blocks when chronology rejects derived valuation provenance before ownership exists', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.ownershipRefRows.push({
      ownershipSnapshotId: 601,
      vehicleId: 10,
      companyIdentityId: 42,
      sourceObservationId: 71,
      effectiveDate: '2026-05-31',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-derived-valuation-chronology-blocked',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.valuationRefs).toEqual([
      {
        basis: 'unavailable',
        vehicleId: 10,
        companyIdentityId: 42,
        directMarkId: null,
        directSourceObservationId: null,
        ownershipSnapshotId: 601,
        derivedTrancheId: null,
        derivedTrancheVersion: null,
        derivedParticipationId: null,
        derivedParticipationVersion: null,
      },
    ]);
    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({
        consumer: 'forecast',
        status: 'blocked',
        reasons: ['position_valuation_incomplete'],
        details: [
          expect.objectContaining({
            code: 'position_valuation_incomplete',
            vehicleId: 10,
            companyIdentityId: 42,
          }),
        ],
      });
  });

  it('blocks forecast evaluation when payload 2 mixes current and stale term refs', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.participationTermRefRows.push(
      {
        participationId: 201,
        participationVersion: 1,
        financingTrancheId: 301,
        trancheVersion: 1,
        vehicleId: 10,
        companyIdentityId: 42,
        isCurrent: false,
        kind: 'contingent',
      },
      {
        participationId: 202,
        participationVersion: 2,
        financingTrancheId: 302,
        trancheVersion: 2,
        vehicleId: 10,
        companyIdentityId: 42,
        isCurrent: true,
        kind: 'priced',
      }
    );
    fakeDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42,
      directSourceObservationId: 71,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-mixed-term-refs',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({
        consumer: 'forecast',
        status: 'blocked',
        reasons: ['mixed_term_versions'],
        details: [
          expect.objectContaining({
            code: 'mixed_term_versions',
            vehicleId: 10,
            companyIdentityId: 42,
          }),
        ],
      });
    expect(snapshot.payload.valuationRefs).toEqual([
      expect.objectContaining({
        basis: 'direct',
        vehicleId: 10,
        companyIdentityId: 42,
        directMarkId: 701,
        directSourceObservationId: 71,
        ownershipSnapshotId: null,
      }),
    ]);
  });

  it('keeps uniformly stale term refs accepted with warn-only details', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    fakeDb.participationTermRefRows.push({
      participationId: 201,
      participationVersion: 1,
      financingTrancheId: 301,
      trancheVersion: 1,
      vehicleId: 10,
      companyIdentityId: 42,
      isCurrent: false,
      kind: 'contingent',
    });
    fakeDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42,
      directSourceObservationId: 71,
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-uniform-stale-refs',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({
        consumer: 'forecast',
        status: 'accepted',
        reasons: [],
        details: [
          expect.objectContaining({
            code: 'uniformly_stale_refs',
            vehicleId: 10,
            companyIdentityId: 42,
          }),
        ],
      });
  });

  it('blocks forecast evaluation when a position lacks direct or derived valuation provenance', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-position-without-valuation',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({
        consumer: 'forecast',
        status: 'blocked',
        reasons: ['position_valuation_incomplete'],
        details: [
          expect.objectContaining({
            code: 'position_valuation_incomplete',
            vehicleId: 10,
            companyIdentityId: 42,
          }),
        ],
      });
    expect(snapshot.payload.valuationRefs).toEqual([
      {
        basis: 'unavailable',
        vehicleId: 10,
        companyIdentityId: 42,
        directMarkId: null,
        directSourceObservationId: null,
        ownershipSnapshotId: null,
        derivedTrancheId: null,
        derivedTrancheVersion: null,
        derivedParticipationId: null,
        derivedParticipationVersion: null,
      },
    ]);
  });

  it('does not let reversal-only position refs create unavailable valuation blockers', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.positionRefRows.push({
      positionEventId: 901,
      eventType: 'reversal',
      vehicleId: 10,
      companyIdentityId: 42,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-reversal-only-position',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.positionRefs).toEqual([
      expect.objectContaining({ positionEventId: 901, eventType: 'reversal' }),
    ]);
    expect(snapshot.payload.valuationRefs).toEqual([]);
    expect(snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'forecast'))
      .toEqual({ consumer: 'forecast', status: 'accepted', reasons: [] });
  });

  it('emits mixed legacy-ledger details only for mapped overlapping company ids', async () => {
    const allLegacyDb = new FakeSnapshotDb();
    seedInternalFundCorpus(allLegacyDb);
    const allLegacy = await buildFinancialFactsSnapshot({
      fundId: INTERNAL_FUND_CORPUS.fundId,
      asOfDate: INTERNAL_FUND_CORPUS.asOfDate,
      actorId: INTERNAL_FUND_CORPUS.actorId,
      idempotencyKey: 'snapshot-all-legacy-origin',
      database: allLegacyDb.asDatabase(),
      now: INTERNAL_FUND_CORPUS.fixedClock,
    });
    expect(
      allLegacy.consumerEvaluations
        .find((evaluation) => evaluation.consumer === 'forecast')
        ?.details?.filter((detail) => detail.code === 'mixed_legacy_ledger_provenance')
    ).toEqual(undefined);

    const allLedgerDb = new FakeSnapshotDb();
    allLedgerDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42001,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    allLedgerDb.positionCompanyRefRows.push({
      vehicleId: 10,
      companyIdentityId: 42001,
      companyId: 1001,
    });
    allLedgerDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42001,
      directSourceObservationId: 71,
    });
    const allLedger = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-all-ledger-origin',
      database: allLedgerDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });
    expect(
      allLedger.consumerEvaluations
        .find((evaluation) => evaluation.consumer === 'forecast')
        ?.details?.filter((detail) => detail.code === 'mixed_legacy_ledger_provenance')
    ).toEqual(undefined);

    const nonOverlapDb = new FakeSnapshotDb();
    seedInternalFundCorpus(nonOverlapDb);
    nonOverlapDb.positionRefRows.push({
      positionEventId: 501,
      eventType: 'acquisition',
      vehicleId: 10,
      companyIdentityId: 42099,
      vehicleParticipationId: 201,
      resultingParticipationId: null,
      sourceObservationId: null,
      effectiveDate: '2026-06-30',
      recordedAt: new Date('2026-07-22T01:00:00.000Z'),
    });
    nonOverlapDb.positionCompanyRefRows.push({
      vehicleId: 10,
      companyIdentityId: 42099,
      companyId: 9999,
    });
    nonOverlapDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42099,
      directSourceObservationId: 71,
    });
    const nonOverlap = await buildFinancialFactsSnapshot({
      fundId: INTERNAL_FUND_CORPUS.fundId,
      asOfDate: INTERNAL_FUND_CORPUS.asOfDate,
      actorId: INTERNAL_FUND_CORPUS.actorId,
      idempotencyKey: 'snapshot-non-overlap-origin',
      database: nonOverlapDb.asDatabase(),
      now: INTERNAL_FUND_CORPUS.fixedClock,
    });
    expect(
      nonOverlap.consumerEvaluations
        .find((evaluation) => evaluation.consumer === 'forecast')
        ?.details?.filter((detail) => detail.code === 'mixed_legacy_ledger_provenance')
    ).toEqual(undefined);

    const mixedDb = new FakeSnapshotDb();
    seedInternalFundCorpus(mixedDb);
    mixedDb.positionRefRows.push(
      {
        positionEventId: 501,
        eventType: 'acquisition',
        vehicleId: 10,
        companyIdentityId: 42001,
        vehicleParticipationId: 201,
        resultingParticipationId: null,
        sourceObservationId: null,
        effectiveDate: INTERNAL_FUND_CORPUS.asOfDate,
        recordedAt: INTERNAL_FUND_CORPUS.fixedClock,
      },
      {
        positionEventId: 502,
        eventType: 'adjustment',
        vehicleId: 10,
        companyIdentityId: 42001,
        vehicleParticipationId: 201,
        resultingParticipationId: null,
        sourceObservationId: null,
        effectiveDate: INTERNAL_FUND_CORPUS.asOfDate,
        recordedAt: INTERNAL_FUND_CORPUS.fixedClock,
      }
    );
    mixedDb.positionCompanyRefRows.push(
      { vehicleId: 10, companyIdentityId: 42001, companyId: 1001 },
      { vehicleId: 10, companyIdentityId: 42001, companyId: 1001 }
    );
    mixedDb.directValuationRefRows.push({
      directMarkId: 701,
      vehicleId: 10,
      companyIdentityId: 42001,
      directSourceObservationId: 71,
    });
    const mixed = await buildFinancialFactsSnapshot({
      fundId: INTERNAL_FUND_CORPUS.fundId,
      asOfDate: INTERNAL_FUND_CORPUS.asOfDate,
      actorId: INTERNAL_FUND_CORPUS.actorId,
      idempotencyKey: 'snapshot-mixed-origin',
      database: mixedDb.asDatabase(),
      now: INTERNAL_FUND_CORPUS.fixedClock,
    });

    expect(
      mixed.consumerEvaluations
        .find((evaluation) => evaluation.consumer === 'forecast')
        ?.details?.filter((detail) => detail.code === 'mixed_legacy_ledger_provenance')
    ).toEqual([
      expect.objectContaining({
        code: 'mixed_legacy_ledger_provenance',
        companyIds: [1001],
      }),
    ]);
  });

  it.each(['csv', 'notion', 'planning_fmv_override', null])(
    'does not attribute a matching hash when canonical imported_from is %s',
    async (importedFrom) => {
      const fakeDb = new FakeSnapshotDb();
      fakeDb.cashRows.push(cashRow({ importedFrom }));
      fakeDb.sourceObservationRows.push(acceptedObservation());

      const snapshot = await buildFinancialFactsSnapshot({
        fundId: 1,
        asOfDate: '2026-06-30',
        actorId: 7,
        idempotencyKey: `snapshot-provenance-${String(importedFrom)}`,
        database: fakeDb.asDatabase(),
        now: new Date('2026-07-22T01:42:44.186Z'),
      });

      expect(snapshot.payload.sourceObservationIds).toEqual([]);
      expect(
        snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'economics')
      ).toEqual({
        consumer: 'economics',
        status: 'blocked',
        reasons: ['unattributed_legacy_direct'],
      });
    }
  );

  it('does not attribute a matching V2 hash across incompatible canonical domains', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.cashRows.push(cashRow());
    fakeDb.sourceObservationRows.push(
      acceptedObservation({
        domain: 'valuation',
        normalizedPayload: {
          domain: 'valuation',
          measureKey: 'post_money_valuation',
        },
      })
    );

    const snapshot = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-domain-mismatch',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });

    expect(snapshot.payload.sourceObservationIds).toEqual([]);
    expect(
      snapshot.consumerEvaluations.find((evaluation) => evaluation.consumer === 'economics')
        ?.reasons
    ).toEqual(['unattributed_legacy_direct']);
  });

  it('does not let irrelevant accepted observations affect the payload 2 snapshot hash', async () => {
    const leftDb = new FakeSnapshotDb();
    const rightDb = new FakeSnapshotDb();
    rightDb.sourceObservationRows.push(
      acceptedObservation({
        id: 999,
        observationHash: '9'.repeat(64),
        normalizedPayload: {
          domain: 'valuation',
          measureKey: 'post_money_valuation',
        },
      })
    );
    const input = {
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-irrelevant-observation',
      now: new Date('2026-07-22T01:42:44.186Z'),
    };

    const left = await buildFinancialFactsSnapshot({ ...input, database: leftDb.asDatabase() });
    const right = await buildFinancialFactsSnapshot({ ...input, database: rightDb.asDatabase() });

    expect(right.payload.observationRefs).toEqual([]);
    expect(right.snapshotInputHash).toBe(left.snapshotInputHash);
  });

  it('keeps terminal facts predecessor chains scoped to the same as-of family', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.snapshotRows.push({
      id: 90,
      fundId: 1,
      policyVersion: 'financial-facts-policy/1.1.0',
      payloadSchemaId: 'financial-facts-payload/2',
      asOfDate: '2026-05-31',
      knowledgeCutoff: new Date('2026-07-20T01:00:00.000Z'),
      vehicleScope: 'fund_all',
      vehicleIds: [],
      selectionSetHash: buildSelectionSetHash({
        sourceObservationIds: [],
        workingValueSelectionIds: [],
      }),
      sourceFactsInputHash: 'a'.repeat(64),
      snapshotInputHash: 'b'.repeat(64),
      payload: {
        companyActuals: { fundId: 1, asOfDate: '2026-05-31', facts: [], inputHash: 'c'.repeat(64) },
        sourceObservationIds: [],
        workingValueSelectionIds: [],
        cashFlowSeries: {
          series: [],
          totals: {
            contributions: '0.000000',
            distributions: '0.000000',
            recallableDistributions: '0.000000',
          },
          warnings: [],
        },
        marksSeries: { marks: [], periodNav: [], warnings: [] },
        vehicleRoster: [],
        participationTermRefs: [],
        positionRefs: [],
        positionComponentRefs: [],
        ownershipRefs: [],
        valuationRefs: [],
        observationRefs: [],
      },
      consumerEvaluations: [],
      actorId: 7,
      idempotencyKey: 'older-asof',
      requestHash: 'd'.repeat(64),
      supersedesSnapshotId: null,
      createdAt: new Date('2026-07-20T01:00:00.000Z'),
    });

    await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-family-first',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });
    const secondFamilyHead = await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-family-second',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-23T01:42:44.186Z'),
    });

    expect(fakeDb.snapshotInsertAttempts.at(-2)?.['supersedesSnapshotId']).toBeNull();
    expect(fakeDb.snapshotInsertAttempts.at(-1)?.['supersedesSnapshotId']).toBe(
      fakeDb.snapshotRows.at(-2)?.['id']
    );
    expect(secondFamilyHead.asOfDate).toBe('2026-06-30');
  });

  it('rejects a cross-fund vehicle through the shared ownership guard', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.vehicleRows.push({
      id: 10,
      vehicleId: 10,
      vehicleType: 'main_fund',
      vehicleSlug: 'main',
      name: 'Main Fund',
      currency: 'USD',
    });
    fakeDb.ownershipRows = [];

    await expect(
      buildFinancialFactsSnapshot({
        fundId: 1,
        vehicleIds: [99],
        asOfDate: '2026-06-30',
        actorId: 7,
        idempotencyKey: 'snapshot-cross-fund',
        database: fakeDb.asDatabase(),
        now: new Date('2026-07-22T01:42:44.186Z'),
      })
    ).rejects.toMatchObject({
      status: 404,
      statusCode: 404,
      code: 'FUND_SCOPE_NOT_FOUND',
      ref: { kind: 'vehicle', id: 99 },
    });
  });

  it('retries 40001 in a repeatable-read transaction and yields one insert plus exact replay', async () => {
    const fakeDb = new FakeSnapshotDb();
    fakeDb.insertSerializationFailuresRemaining = 1;
    const input = {
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-parallel-retry',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    };

    const [left, right] = await Promise.all([
      buildFinancialFactsSnapshot(input),
      buildFinancialFactsSnapshot(input),
    ]);

    expect(left).toEqual(right);
    expect(fakeDb.snapshotRows).toHaveLength(1);
    expect(fakeDb.insertedSnapshotCount).toBe(1);
    expect(fakeDb.transactionAttempts).toBe(3);
    expect(fakeDb.snapshotInsertAttempts).toHaveLength(3);
    const requestHash = fakeDb.snapshotInsertAttempts[0]?.['requestHash'];
    expect(requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      fakeDb.snapshotInsertAttempts.map((attempt) => ({
        knowledgeCutoff: attempt['knowledgeCutoff'],
        requestHash: attempt['requestHash'],
        snapshotInputHash: attempt['snapshotInputHash'],
      }))
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        knowledgeCutoff: new Date('2026-07-22T01:42:44.186Z'),
        requestHash,
        snapshotInputHash: left.snapshotInputHash,
      }))
    );
    expect(fakeDb.transactionConfigs).toEqual([
      { isolationLevel: 'repeatable read', accessMode: 'read write' },
      { isolationLevel: 'repeatable read', accessMode: 'read write' },
      { isolationLevel: 'repeatable read', accessMode: 'read write' },
    ]);
  });

  it('keeps identity unique, creates a new immutable row for a new cutoff, and hashes reordered source keys stably', async () => {
    const firstDb = new FakeSnapshotDb();
    const input = {
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-identity',
      database: firstDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    };
    const first = await buildFinancialFactsSnapshot(input);
    const replay = await buildFinancialFactsSnapshot({
      ...input,
      now: new Date('2026-07-23T01:42:44.186Z'),
    });
    const changedCutoff = await buildFinancialFactsSnapshot({
      ...input,
      idempotencyKey: 'snapshot-new-cutoff',
      now: new Date('2026-07-23T01:42:44.186Z'),
    });

    expect(replay).toEqual(first);
    expect(firstDb.snapshotRows).toHaveLength(2);
    expect(changedCutoff.snapshotInputHash).not.toBe(first.snapshotInputHash);
    expect(changedCutoff.knowledgeCutoff).not.toBe(first.knowledgeCutoff);

    const leftDb = new FakeSnapshotDb();
    const rightDb = new FakeSnapshotDb();
    leftDb.cashRows.push({
      id: 1,
      fundId: 1,
      vehicleId: null,
      companyId: null,
      eventType: 'lp_capital_call',
      amount: '10.000000',
      currency: 'USD',
      eventDate: new Date('2026-06-30T00:00:00.000Z'),
      perspective: 'lp_net',
      status: 'approved',
      supersedesEventId: null,
      reversalOfEventId: null,
    });
    rightDb.cashRows.push({
      reversalOfEventId: null,
      supersedesEventId: null,
      status: 'approved',
      perspective: 'lp_net',
      eventDate: new Date('2026-06-30T00:00:00.000Z'),
      currency: 'USD',
      amount: '10.000000',
      eventType: 'lp_capital_call',
      companyId: null,
      vehicleId: null,
      fundId: 1,
      id: 1,
    });
    const stableInput = {
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-key-order',
      now: new Date('2026-07-22T01:42:44.186Z'),
    };
    const left = await buildFinancialFactsSnapshot({
      ...stableInput,
      database: leftDb.asDatabase(),
    });
    const right = await buildFinancialFactsSnapshot({
      ...stableInput,
      database: rightDb.asDatabase(),
    });

    expect(right.snapshotInputHash).toBe(left.snapshotInputHash);
  });

  it('rejects replay from a stored row with an invalid policy and payload schema tuple', async () => {
    const fakeDb = new FakeSnapshotDb();
    await buildFinancialFactsSnapshot({
      fundId: 1,
      asOfDate: '2026-06-30',
      actorId: 7,
      idempotencyKey: 'snapshot-invalid-tuple',
      database: fakeDb.asDatabase(),
      now: new Date('2026-07-22T01:42:44.186Z'),
    });
    fakeDb.snapshotRows[0]!['policyVersion'] = 'financial-facts-policy/1.0.1';
    fakeDb.snapshotRows[0]!['payloadSchemaId'] = 'financial-facts-payload/2';

    await expect(
      buildFinancialFactsSnapshot({
        fundId: 1,
        asOfDate: '2026-06-30',
        actorId: 7,
        idempotencyKey: 'snapshot-invalid-tuple',
        database: fakeDb.asDatabase(),
        now: new Date('2026-07-22T01:42:44.186Z'),
      })
    ).rejects.toThrow();
  });
});
