import { describe, expect, it } from 'vitest';

import type { db } from '../../../server/db';
import {
  CurrentForecastV2ServiceError,
  runCurrentForecastV2,
} from '../../../server/services/current-forecast-v2-service';
import { ENGINE_VERSION } from '../../../shared/contracts/current-forecast-v2.contract';
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
  planOwnershipAllowed = true;
  factsOwnershipAllowed = true;

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
        return queryRows([]);
      },
    };
  }

  insert(table: unknown) {
    return {
      values: async (values: FundSnapshotInsert) => {
        if (table === fundSnapshots) this.insertedSnapshots.push(values);
      },
    };
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
      calcVersion: ENGINE_VERSION,
      correlationId: expect.any(String),
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

function factsRow(): FactsRow {
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
  };
}
