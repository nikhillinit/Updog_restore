import { describe, expect, it } from 'vitest';

import type { db } from '../../../server/db';
import {
  CURRENT_FORECAST_V2_CALC_VERSION,
  CurrentForecastV2ServiceError,
  getOrCreateCurrentForecastV2WithReceipt,
  runCurrentForecastV2,
  runCurrentForecastV2WithReceipt,
} from '../../../server/services/current-forecast-v2-service';
import { NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE } from '../../../server/lib/transaction-support';
import { currentPlanVersions } from '../../../shared/schema/current-plans';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
import { fundSnapshots } from '../../../shared/schema/fund';

type CurrentForecastDatabase = typeof db;
type CurrentPlanRow = typeof currentPlanVersions.$inferSelect;
type FactsRow = typeof financialFactsSnapshots.$inferSelect;
type FundSnapshotInsert = typeof fundSnapshots.$inferInsert;

function queryRows<T>(rows: readonly T[]) {
  const values = [...rows];
  const query = {
    where: (_condition: unknown) => query,
    orderBy: (..._order: unknown[]) => query,
    limit: (count: number) => Promise.resolve(values.slice(0, count)),
    then: <TResult1 = T[], TResult2 = never>(
      onfulfilled?: ((value: T[]) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) => Promise.resolve(values).then(onfulfilled, onrejected),
  };
  return query;
}

class FakeCurrentForecastDb {
  readonly planRows: CurrentPlanRow[] = [currentPlanRow()];
  readonly factsRows: FactsRow[] = [factsRow()];
  readonly insertedSnapshots: FundSnapshotInsert[] = [];
  readonly snapshotRows: Array<{ id: number; payload: unknown }> = [];
  readonly advisoryLocks: unknown[] = [];
  private transactionQueue: Promise<void> = Promise.resolve();
  planOwnershipAllowed = true;
  factsOwnershipAllowed = true;
  returnEmptyInsert = false;
  transactionError: Error | null = null;

  asDatabase(): CurrentForecastDatabase {
    return this as unknown as CurrentForecastDatabase;
  }

  select(fields?: Record<string, unknown>) {
    return {
      from: (table: unknown) => {
        const ownershipLookup = fields !== undefined;
        if (table === currentPlanVersions) {
          const rows = ownershipLookup
            ? this.planOwnershipAllowed
              ? this.planRows.map((row) => ({ id: row.id }))
              : []
            : this.planRows;
          return queryRows(rows);
        }
        if (table === financialFactsSnapshots) {
          const rows = ownershipLookup
            ? this.factsOwnershipAllowed
              ? this.factsRows.map((row) => ({ id: row.id }))
              : []
            : this.factsRows;
          return queryRows(rows);
        }
        if (table === fundSnapshots) return queryRows(this.snapshotRows);
        return queryRows([]);
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (values: FundSnapshotInsert) => ({
        returning: async () => {
          if (table !== fundSnapshots) return [];
          this.insertedSnapshots.push(values);
          if (this.returnEmptyInsert) return [];
          const id = this.insertedSnapshots.length;
          this.snapshotRows.push({ id, payload: values.payload });
          return [{ id }];
        },
      }),
    };
  }

  async execute(query: unknown): Promise<void> {
    this.advisoryLocks.push(query);
  }

  async transaction<T>(callback: (transaction: this) => Promise<T>): Promise<T> {
    if (this.transactionError !== null) throw this.transactionError;
    const previous = this.transactionQueue;
    let release!: () => void;
    this.transactionQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(this);
    } finally {
      release();
    }
  }
}

describe('current forecast v2 service', () => {
  it('persists CURRENT_FORECAST_V2 as a payload-only snapshot', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    const clock = '2026-07-22T18:24:32.051Z';

    const result = await runCurrentForecastV2({
      fundId: 1,
      clock,
      database: fakeDb.asDatabase(),
    });

    expect(fakeDb.insertedSnapshots).toHaveLength(1);
    expect(fakeDb.insertedSnapshots[0]).toMatchObject({
      fundId: 1,
      type: 'CURRENT_FORECAST_V2',
      payload: result,
      state: null,
      scenarioSetId: null,
      snapshotTime: new Date(clock),
      calcVersion: CURRENT_FORECAST_V2_CALC_VERSION,
      correlationId: expect.any(String),
    });
  });

  it('serializes concurrent exact-basis baseline callers and reuses the receipt', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    const input = {
      fundId: 1,
      clock: '2026-07-22T18:24:32.051Z',
      database: fakeDb.asDatabase(),
    };

    const [first, second] = await Promise.all([
      getOrCreateCurrentForecastV2WithReceipt(input),
      getOrCreateCurrentForecastV2WithReceipt(input),
    ]);

    expect(first.fundSnapshotId).toBe(1);
    expect(second.fundSnapshotId).toBe(1);
    expect(fakeDb.insertedSnapshots).toHaveLength(1);
    expect(fakeDb.advisoryLocks).toHaveLength(2);
  });

  it('falls back to autocommit when neon-http does not support transactions', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.transactionError = new Error(NEON_HTTP_TRANSACTION_UNSUPPORTED_MESSAGE);

    const receipt = await getOrCreateCurrentForecastV2WithReceipt({
      fundId: 1,
      clock: '2026-07-22T18:24:32.051Z',
      database: fakeDb.asDatabase(),
    });

    expect(receipt.fundSnapshotId).toBe(1);
    expect(fakeDb.insertedSnapshots).toHaveLength(1);
    expect(fakeDb.advisoryLocks).toHaveLength(0);
  });

  it('exposes an internal receipt seam without changing the public forecast result', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    const input = {
      fundId: 1,
      clock: '2026-07-22T18:24:32.051Z',
      database: fakeDb.asDatabase(),
    };

    const publicResult = await runCurrentForecastV2(input);
    fakeDb.insertedSnapshots.length = 0;
    const receipt = await runCurrentForecastV2WithReceipt(input);

    expect(receipt.result).toEqual(publicResult);
    expect(receipt.fundSnapshotId).toBe(1);
    expect(Object.keys(publicResult)).not.toContain('fundSnapshotId');
  });

  it('rejects blocked forecast evaluations before writing a fund snapshot', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.factsRows[0] = factsRow({
      policyVersion: 'financial-facts-policy/1.1.0',
      payloadSchemaId: 'financial-facts-payload/2',
      payload: {
        ...(factsRow().payload as Record<string, unknown>),
        positionRefs: [],
        positionComponentRefs: [],
        ownershipRefs: [],
        valuationRefs: [],
        observationRefs: [],
      },
      consumerEvaluations: [
        {
          consumer: 'forecast',
          status: 'blocked',
          reasons: ['position_valuation_incomplete'],
          details: [{ code: 'position_valuation_incomplete', companyIdentityId: 42 }],
        },
      ],
    });

    await expect(
      runCurrentForecastV2({
        fundId: 1,
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 422,
      code: 'FACTS_FORECAST_EVALUATION_BLOCKED',
    });
    expect(fakeDb.insertedSnapshots).toHaveLength(0);
  });

  it('runs from a payload 3 facts snapshot', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    const legacy = factsRow();
    fakeDb.factsRows[0] = factsRow({
      policyVersion: 'financial-facts-policy/1.2.0',
      payloadSchemaId: 'financial-facts-payload/3',
      payload: {
        ...(legacy.payload as Record<string, unknown>),
        positionRefs: [],
        positionComponentRefs: [],
        ownershipRefs: [],
        valuationRefs: [],
        observationRefs: [],
        openingAccountingState: null,
      },
    });

    await expect(
      runCurrentForecastV2({
        fundId: 1,
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).resolves.toMatchObject({ contractVersion: 'current-forecast-v2' });
  });

  it('runs from a payload 4 facts snapshot and round-trips its tuple', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    const legacy = factsRow();
    fakeDb.factsRows[0] = factsRow({
      policyVersion: 'financial-facts-policy/1.3.0',
      payloadSchemaId: 'financial-facts-payload/4',
      payload: {
        ...(legacy.payload as Record<string, unknown>),
        positionRefs: [],
        positionComponentRefs: [],
        ownershipRefs: [],
        valuationRefs: [],
        observationRefs: [],
        openingAccountingState: resolvedOpeningAccountingState(),
      } as FactsRow['payload'],
    });

    await expect(
      runCurrentForecastV2({
        fundId: 1,
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).resolves.toMatchObject({ contractVersion: 'current-forecast-v2' });
    expect(fakeDb.insertedSnapshots).toHaveLength(1);
  });

  it('rejects facts rows whose stored policy and payload schema tuple is invalid', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.factsRows[0] = factsRow({
      policyVersion: 'financial-facts-policy/1.0.1',
      payloadSchemaId: 'financial-facts-payload/2',
    });

    await expect(
      runCurrentForecastV2({
        fundId: 1,
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).rejects.toThrow();
    expect(fakeDb.insertedSnapshots).toHaveLength(0);
  });

  it('rejects a forecast snapshot insert that does not return a persisted id', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.returnEmptyInsert = true;

    await expect(
      runCurrentForecastV2WithReceipt({
        fundId: 1,
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 500,
      code: 'FORECAST_SNAPSHOT_WRITE_FAILED',
    });
  });

  it('rejects a cross-fund plan through assertOwnedByFund', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.planOwnershipAllowed = false;

    await expect(
      runCurrentForecastV2({
        fundId: 1,
        currentPlanVersionId: '41',
        clock: '2026-07-22T18:24:32.051Z',
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'FUND_SCOPE_NOT_FOUND',
      ref: { kind: 'current_plan_version', id: '41' },
    });
    expect(fakeDb.insertedSnapshots).toHaveLength(0);
  });

  it('maps an engine basis mismatch to a typed service error', async () => {
    const fakeDb = new FakeCurrentForecastDb();
    fakeDb.planRows[0] = currentPlanRow({ fundId: 2 });

    const error = await runCurrentForecastV2({
      fundId: 1,
      currentPlanVersionId: '41',
      clock: '2026-07-22T18:24:32.051Z',
      database: fakeDb.asDatabase(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CurrentForecastV2ServiceError);
    expect(error).toMatchObject({
      status: 409,
      code: 'CURRENT_FORECAST_BASIS_MISMATCH',
      basisMismatchCode: 'FUND_ID_MISMATCH',
    });
    expect(fakeDb.insertedSnapshots).toHaveLength(0);
  });
});

function currentPlanRow(overrides: Partial<CurrentPlanRow> = {}): CurrentPlanRow {
  return {
    id: 41,
    fundId: 1,
    version: 1,
    sourceConfigId: 17,
    sourceConfigVersion: 3,
    sourceFactsSnapshotId: 31,
    deployableCapitalUsd: '9000000.000000',
    planTransformationVersion: 'fund-config-to-current-plan/1.0.0',
    allocations: [
      {
        allocationId: 'seed-allocation',
        name: 'Seed',
        stageFocus: 'Seed',
        initialCapitalUsd: '6000000.000000',
        followOnCapitalUsd: '3000000.000000',
        avgInitialCheckUsd: '1000000.000000',
        pacingQuarters: 8,
        followOnStrategy: 'maintain_ownership',
        followOnParticipationPct: '0.500000000000',
      },
    ],
    pacingAssumptions: {
      contractVersion: 'current-plan-pacing-v1',
      deploymentQuarters: 2,
      quarterlyDeploymentPcts: ['0.500000000000', '0.500000000000'],
      followOnReservePct: '0.333333333333',
      annualFeeDragPct: '0.020000000000',
    },
    cohortAssumptions: {
      contractVersion: 'current-plan-cohort-v1',
      averageInitialCheckUsd: '1000000.000000',
      stageDistribution: [{ stage: 'Seed', pct: '1.000000000000' }],
      graduationMatrix: [
        {
          fromStage: 'Seed',
          toStage: 'Series A',
          rate: '0.750000000000',
          quartersToGraduate: 4,
        },
      ],
      exitAssumptions: [
        {
          stage: 'Seed',
          exitMultiple: '3.000000000000',
          quartersToExit: 20,
          failureRate: '0.250000000000',
        },
      ],
    },
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: 'a'.repeat(64),
    supersedesVersionId: null,
    supersededByVersionId: null,
    idempotencyKey: 'plan-41',
    requestHash: 'b'.repeat(64),
    createdAt: new Date('2026-07-22T02:00:00.000Z'),
    ...overrides,
  };
}

/**
 * A stored, already-resolved v1.1 embedded ref exactly as a persisted payload 4
 * row would carry it: the derived lpUnreturnedContributedCapitalUsd is present
 * and equals the frozen recomputation (20 paid-in minus 4 ROC).
 */
function resolvedOpeningAccountingState() {
  return {
    sourceArtifactId: 41,
    sourceArtifactSha256: 'd'.repeat(64),
    sourceArtifactCreatedAt: '2026-07-20T23:00:00.000Z',
    attestedByActorId: 7,
    observation: {
      contractVersion: 'fund-accounting-state-observation/1.1.0',
      cutoverInstant: '2026-07-20T23:59:59.000Z',
      currency: 'USD',
      cashBalanceUsd: '10.000000',
      cumulativeLpPaidInUsd: '20.000000',
      cumulativeGpPaidInUsd: '3.000000',
      gpUnreturnedContributedCapitalUsd: '2.000000',
      lpDistributionsReturnOfCapitalUsd: '4.000000',
      lpDistributionsProfitUsd: '5.000000',
      actualLpDistributionsCumulativeUsd: '9.000000',
      gpInvestmentDistributionsPaidUsd: '1.000000',
      gpCarryPaidUsd: '2.000000',
      accruedPreferredReturnUsd: '3.000000',
      accruedPreferredReturnThroughInstant: '2026-07-20T23:59:59.000Z',
      recallableDistributionsCumulativeUsd: '6.000000',
      recallableDistributionsOutstandingUsd: '2.000000',
      recycledProceedsCumulativeUsd: '4.000000',
      realizedProceedsCumulativeUsd: '8.000000',
      methodologyVersion: 'manual-opening-state/1.0.0',
      lpUnreturnedContributedCapitalUsd: '16.000000',
    },
  };
}

function factsRow(overrides: Partial<FactsRow> = {}): FactsRow {
  return {
    id: 31,
    fundId: 1,
    policyVersion: 'financial-facts-policy/1.0.0',
    payloadSchemaId: 'financial-facts-payload/1',
    asOfDate: '2026-07-21',
    knowledgeCutoff: new Date('2026-07-22T02:00:00.000Z'),
    vehicleScope: 'fund_all',
    vehicleIds: [11],
    selectionSetHash: '0'.repeat(64),
    sourceFactsInputHash: 'c'.repeat(64),
    snapshotInputHash: 'd'.repeat(64),
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-21',
        facts: [],
        inputHash: 'e'.repeat(64),
      },
      sourceObservationIds: [],
      workingValueSelectionIds: [],
      participationTermRefs: [],
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
    },
    consumerEvaluations: [],
    actorId: 7,
    idempotencyKey: 'facts-31',
    requestHash: 'f'.repeat(64),
    createdAt: new Date('2026-07-22T02:00:00.000Z'),
    ...overrides,
  };
}
