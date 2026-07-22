import { describe, expect, it } from 'vitest';

import type { db } from '../../../server/db';
import {
  CurrentPlanVersionServiceError,
  getCurrentPlanVersions,
  mintCurrentPlanVersion,
} from '../../../server/services/current-plan-version-service';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import { currentPlanVersions } from '../../../shared/schema/current-plans';
import { financialFactsSnapshots } from '../../../shared/schema/financial-facts-snapshots';
import type { fundConfigs } from '../../../shared/schema/fund';

type CurrentPlanDatabase = typeof db;
type CurrentPlanRow = typeof currentPlanVersions.$inferSelect;
type FactsRow = typeof financialFactsSnapshots.$inferSelect;
type FundConfigRow = typeof fundConfigs.$inferSelect;

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

class FakeCurrentPlanDb {
  publishedConfig: FundConfigRow | null = publishedConfigRow();
  readonly factsRows: FactsRow[] = [factsRow()];
  readonly currentPlanRows: CurrentPlanRow[] = [];
  factsOwnershipAllowed = true;
  private nextPlanId = 1;
  private lastInsertedPlanId: number | null = null;

  readonly query = {
    fundConfigs: {
      findFirst: async (_options: unknown) => this.publishedConfig,
    },
  };

  asDatabase(): CurrentPlanDatabase {
    return this as unknown as CurrentPlanDatabase;
  }

  transaction<T>(operation: (transaction: CurrentPlanDatabase) => Promise<T>): Promise<T> {
    return operation(this.asDatabase());
  }

  select(fields?: Record<string, unknown>) {
    return {
      from: (table: unknown) => {
        if (table === financialFactsSnapshots) {
          if (fields !== undefined) {
            const ownedRows = this.factsOwnershipAllowed
              ? this.factsRows.map((row) => ({ id: row.id }))
              : [];
            return queryRows(ownedRows);
          }
          return queryRows(this.factsRows);
        }
        if (table === currentPlanVersions) {
          return queryRows(
            [...this.currentPlanRows].sort((left, right) => right.version - left.version)
          );
        }
        return queryRows([]);
      },
    };
  }

  insert(table: unknown) {
    return {
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (_options: unknown) => ({
          returning: async () => {
            if (table !== currentPlanVersions) return [];
            const conflict = this.currentPlanRows.some(
              (row) =>
                row.fundId === values['fundId'] && row.idempotencyKey === values['idempotencyKey']
            );
            if (conflict) return [];

            const inserted = {
              id: this.nextPlanId++,
              createdAt: new Date(`2026-07-22T02:00:0${this.currentPlanRows.length}.000Z`),
              ...values,
            } as CurrentPlanRow;
            this.currentPlanRows.push(inserted);
            this.lastInsertedPlanId = inserted.id;
            return [inserted];
          },
        }),
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (values: Partial<CurrentPlanRow>) => ({
        where: (_condition: unknown) => ({
          returning: async () => {
            if (table !== currentPlanVersions) return [];
            const target =
              values.supersededByVersionId === null
                ? this.currentPlanRows.find((row) => row.id === this.lastInsertedPlanId)
                : this.currentPlanRows.find((row) => row.supersededByVersionId === null);
            if (!target) return [];
            Object.assign(target, values);
            return [target];
          },
        }),
      }),
    };
  }
}

describe('current plan version service', () => {
  it('supersedes the prior plan and leaves exactly one head', async () => {
    const fakeDb = new FakeCurrentPlanDb();

    const first = await mintCurrentPlanVersion({
      fundId: 1,
      idempotencyKey: 'plan-one',
      actorId: 7,
      database: fakeDb.asDatabase(),
    });
    const second = await mintCurrentPlanVersion({
      fundId: 1,
      idempotencyKey: 'plan-two',
      actorId: 7,
      database: fakeDb.asDatabase(),
    });
    const versions = await getCurrentPlanVersions({ fundId: 1, database: fakeDb.asDatabase() });

    expect(second).toMatchObject({
      version: 2,
      supersedesVersionId: first.id,
      supersededByVersionId: null,
    });
    expect(versions).toEqual([
      second,
      expect.objectContaining({ id: first.id, supersededByVersionId: second.id }),
    ]);
    expect(fakeDb.currentPlanRows.filter((row) => row.supersededByVersionId === null)).toHaveLength(
      1
    );
  });

  it('replays the stored row through runIdempotentCommand', async () => {
    const fakeDb = new FakeCurrentPlanDb();
    const input = {
      fundId: 1,
      idempotencyKey: 'plan-replay',
      actorId: 7,
      database: fakeDb.asDatabase(),
    };

    const created = await mintCurrentPlanVersion(input);
    const replayed = await mintCurrentPlanVersion(input);

    expect(replayed).toEqual(created);
    expect(fakeDb.currentPlanRows).toHaveLength(1);
  });

  it('rejects a facts snapshot that assertOwnedByFund cannot find in the fund', async () => {
    const fakeDb = new FakeCurrentPlanDb();
    fakeDb.factsOwnershipAllowed = false;

    await expect(
      mintCurrentPlanVersion({
        fundId: 1,
        idempotencyKey: 'plan-cross-fund-facts',
        database: fakeDb.asDatabase(),
      })
    ).rejects.toMatchObject({
      status: 404,
      code: 'FUND_SCOPE_NOT_FOUND',
      ref: { kind: 'facts_snapshot', id: 31 },
    });
    expect(fakeDb.currentPlanRows).toHaveLength(0);
  });

  it('maps an incomplete transform result to a typed service error', async () => {
    const fakeDb = new FakeCurrentPlanDb();
    const incompleteConfig = completeConfig();
    delete incompleteConfig.fundSize;
    fakeDb.publishedConfig = publishedConfigRow(incompleteConfig);

    const error = await mintCurrentPlanVersion({
      fundId: 1,
      idempotencyKey: 'plan-incomplete',
      database: fakeDb.asDatabase(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(CurrentPlanVersionServiceError);
    expect(error).toMatchObject({
      status: 422,
      code: 'PLAN_DERIVATION_INCOMPLETE',
      missingFields: ['fundSize'],
    });
    expect(fakeDb.currentPlanRows).toHaveLength(0);
  });

  it('returns typed errors when a published config or facts snapshot is unavailable', async () => {
    const noConfigDb = new FakeCurrentPlanDb();
    noConfigDb.publishedConfig = null;
    await expect(
      mintCurrentPlanVersion({
        fundId: 1,
        idempotencyKey: 'plan-no-config',
        database: noConfigDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: 'NO_PUBLISHED_CONFIG', status: 409 });

    const noFactsDb = new FakeCurrentPlanDb();
    noFactsDb.factsRows.length = 0;
    await expect(
      mintCurrentPlanVersion({
        fundId: 1,
        idempotencyKey: 'plan-no-facts',
        database: noFactsDb.asDatabase(),
      })
    ).rejects.toMatchObject({ code: 'NO_FACTS_SNAPSHOT', status: 422 });
  });
});

function publishedConfigRow(config: FundDraftWriteV1 = completeConfig()): FundConfigRow {
  return {
    id: 17,
    fundId: 1,
    version: 3,
    config,
    isDraft: false,
    isPublished: true,
    publishedAt: new Date('2026-07-21T12:00:00.000Z'),
    createdAt: new Date('2026-07-21T12:00:00.000Z'),
    updatedAt: new Date('2026-07-21T12:00:00.000Z'),
  };
}

function completeConfig(): FundDraftWriteV1 {
  return {
    fundName: 'Fund I',
    fundSize: 100_000_000,
    fundLife: 10,
    capitalPlanAllocations: [
      {
        id: 'seed',
        name: 'Seed',
        entryRound: 'Seed',
        capitalAllocationPct: 1,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 1_000_000,
        followOnStrategy: 'amount',
        followOnAmount: 5_000_000,
        followOnParticipationPct: 0.25,
        investmentHorizonMonths: 24,
      },
    ],
    economicsAssumptions: {
      version: 'v1',
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'management-fee',
            name: 'Management fee',
            rate: 0.02,
            basis: 'committed_capital',
            startYear: 1,
            endYear: 10,
          },
        ],
      },
    },
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
    sourceFactsInputHash: 'a'.repeat(64),
    snapshotInputHash: 'b'.repeat(64),
    payload: {
      companyActuals: {
        fundId: 1,
        asOfDate: '2026-07-21',
        facts: [],
        inputHash: 'c'.repeat(64),
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
    requestHash: 'd'.repeat(64),
    createdAt: new Date('2026-07-22T02:00:00.000Z'),
  };
}
