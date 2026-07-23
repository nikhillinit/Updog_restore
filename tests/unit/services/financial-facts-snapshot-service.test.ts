import { describe, expect, it } from 'vitest';

import type { db } from '../../../server/db';
import { buildFinancialFactsSnapshot } from '../../../server/services/financial-facts-snapshot-service';
import { funds } from '../../../shared/schema/fund';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
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

function queryRows<T>(rows: T[]) {
  return {
    limit: (count: number) => Promise.resolve(rows.slice(0, count)),
    orderBy: (..._order: unknown[]) => Promise.resolve(rows),
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
  readonly snapshotRows: Array<Record<string, unknown>> = [];
  ownershipRows: Array<Record<string, unknown>> | null = null;

  asDatabase(): SnapshotDatabase {
    return this as unknown as SnapshotDatabase;
  }

  select(projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => {
          if (table === vehicles) {
            return {
              limit: (count: number) =>
                Promise.resolve((this.ownershipRows ?? this.vehicleRows).slice(0, count)),
              orderBy: (..._order: unknown[]) => Promise.resolve(this.vehicleRows),
            };
          }
          return queryRows(this.rowsFor(table, projection));
        },
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: () => {
            if (table !== financialFactsSnapshots) return Promise.resolve([]);
            const conflict = this.snapshotRows.some(
              (row) =>
                row['fundId'] === values['fundId'] &&
                (row['idempotencyKey'] === values['idempotencyKey'] ||
                  row['snapshotInputHash'] === values['snapshotInputHash'])
            );
            if (conflict) return Promise.resolve([]);
            const inserted = { id: this.snapshotRows.length + 1, ...values };
            this.snapshotRows.push(inserted);
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
    if (table === financialFactsSnapshots) return this.snapshotRows;
    return [];
  }
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
    expect(serializeCorpusValue(snapshot)).toEqual(
      loadCorpusExpected('expected-facts/financial-facts-snapshot.json')
    );
    expect(serializeCorpusValue(snapshot.payload.cashFlowSeries)).toEqual(
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
    ).rejects.toMatchObject({ status: 422, code: 'VEHICLE_SCOPE_UNSUPPORTED' });

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
});
