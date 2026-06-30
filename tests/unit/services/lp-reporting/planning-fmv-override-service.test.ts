import { describe, expect, it } from 'vitest';

import type { db } from '../../../../server/db';
import {
  createPlanningFmvOverride,
  type CreatePlanningFmvOverrideInput,
} from '../../../../server/services/lp-reporting/planning-fmv-override-service';
import { planningFmvOverrideRequests, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import { portfolioCompanies } from '@shared/schema/portfolio';

type PlanningFmvDatabase = typeof db;

interface FakePlanningFmvRequest {
  id: number;
  fundId: number;
  companyId: number;
  valuationMarkId: number | null;
  idempotencyKey: string;
  requestHash: string;
  sourceHash: string;
  status: 'pending' | 'completed' | 'failed';
  responseBody: unknown | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdBy: number | null;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
}

interface FakeCompany {
  id: number;
  fundId: number;
}

class FakePlanningFmvDb {
  readonly companies: FakeCompany[] = [];
  readonly requests: FakePlanningFmvRequest[] = [];
  readonly insertedMarks: unknown[] = [];
  private nextRequestId = 700;

  asDatabase(): PlanningFmvDatabase {
    return this as unknown as PlanningFmvDatabase;
  }

  transaction<T>(operation: (transaction: PlanningFmvDatabase) => Promise<T>): Promise<T> {
    return operation(this.asDatabase());
  }

  select(_projection?: unknown) {
    return {
      from: (table: unknown) => ({
        where: (_condition: unknown) => ({
          limit: (count: number) => Promise.resolve(this.rowsFor(table).slice(0, count)),
          orderBy: (..._order: unknown[]) => Promise.resolve(this.rowsFor(table)),
        }),
      }),
    };
  }

  insert(table: unknown) {
    return {
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            if (table !== planningFmvOverrideRequests) {
              return Promise.resolve([]);
            }

            const request: FakePlanningFmvRequest = {
              id: this.nextRequestId++,
              fundId: row['fundId'] as number,
              companyId: row['companyId'] as number,
              valuationMarkId: null,
              idempotencyKey: row['idempotencyKey'] as string,
              requestHash: row['requestHash'] as string,
              sourceHash: row['sourceHash'] as string,
              status: 'pending',
              responseBody: null,
              failureCode: null,
              failureMessage: null,
              createdBy: row['createdBy'] as number | null,
              createdAt: new Date('2026-06-30T00:00:00Z'),
              completedAt: null,
              updatedAt: new Date('2026-06-30T00:00:00Z'),
            };
            this.requests.push(request);
            return Promise.resolve([request]);
          },
        }),
        returning: () => {
          if (table === valuationMarks) {
            this.insertedMarks.push(row);
          }
          return Promise.resolve([]);
        },
      }),
    };
  }

  update(table: unknown) {
    return {
      set: (patch: Partial<FakePlanningFmvRequest>) => ({
        where: (_condition: unknown) => {
          if (table === planningFmvOverrideRequests) {
            const request = this.requests.at(-1);
            if (request) {
              Object.assign(request, patch);
            }
          }
          return Promise.resolve();
        },
      }),
    };
  }

  private rowsFor(table: unknown): Array<Record<string, unknown>> {
    if (table === portfolioCompanies) {
      return this.companies as unknown as Array<Record<string, unknown>>;
    }
    return [];
  }
}

function createInput(
  overrides: Partial<CreatePlanningFmvOverrideInput> = {}
): CreatePlanningFmvOverrideInput {
  return {
    fundId: 1,
    idempotencyKey: 'planning-fmv-service-test-1',
    actor: { userId: 7 },
    body: {
      companyId: 42,
      markDate: '2026-06-30',
      fairValue: '12500000.000000',
      currency: 'USD',
      confidenceLevel: 'medium',
      reason: 'Approved Planning FMV',
      source: {
        allocationVersion: 3,
        plannedReservesCents: 5000000,
        allocationReason: 'Follow-on plan',
      },
    },
    ...overrides,
  };
}

describe('createPlanningFmvOverride', () => {
  it('rejects cross-fund companies before inserting a valuation mark', async () => {
    const fakeDb = new FakePlanningFmvDb();
    fakeDb.companies.push({ id: 42, fundId: 99 });

    await expect(
      createPlanningFmvOverride(createInput(), { database: fakeDb.asDatabase() })
    ).rejects.toMatchObject({
      status: 404,
      code: 'planning_fmv_company_not_found',
    });

    expect(fakeDb.insertedMarks).toHaveLength(0);
    expect(fakeDb.requests[0]).toMatchObject({
      status: 'failed',
      failureCode: 'planning_fmv_company_not_found',
    });
  });
});
