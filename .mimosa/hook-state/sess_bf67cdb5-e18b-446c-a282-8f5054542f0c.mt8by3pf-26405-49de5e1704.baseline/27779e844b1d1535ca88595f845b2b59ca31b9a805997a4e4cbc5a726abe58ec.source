import { and, eq } from 'drizzle-orm';
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';

import { fundConfigs, funds } from '@shared/schema';
import { lpMetricRuns } from '@shared/schema/lp-reporting-evidence';

const require = createRequire(import.meta.url);
const databaseMockModule = require('../../helpers/database-mock.cjs') as {
  databaseMock: {
    insert: (table: unknown) => {
      values: (value: unknown) => {
        returning: () => Promise<Array<Record<string, unknown>>>;
      };
    };
    update: (table: unknown) => {
      set: (value: unknown) => {
        where: (clause: unknown) => {
          returning: () => Promise<Array<Record<string, unknown>>>;
        };
      };
    };
    select: () => {
      from: (table: unknown) => {
        where: (clause: unknown) => {
          limit: (value: number) => Promise<Array<Record<string, unknown>>>;
        };
      };
    };
  };
  __reset: () => void;
};

describe('database-mock.cjs Drizzle clause matching', () => {
  beforeEach(() => {
    databaseMockModule.__reset();
  });

  it('can read back inserted funds by eq(id, value)', async () => {
    const [inserted] = await databaseMockModule.databaseMock
      .insert(funds)
      .values({
        name: 'Mock Fund',
        size: '100000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
      })
      .returning();

    expect(inserted).toBeDefined();

    const [selected] = await databaseMockModule.databaseMock
      .select()
      .from(funds)
      .where(eq(funds.id, inserted.id as number))
      .limit(1);

    expect(selected).toBeDefined();
    expect(selected?.id).toBe(inserted.id);
    expect(selected?.name).toBe('Mock Fund');
  });

  it('adds createdAt and updatedAt defaults to inserted rows', async () => {
    const [inserted] = await databaseMockModule.databaseMock
      .insert(funds)
      .values({
        name: 'Timestamped Mock Fund',
        size: '100000000',
        managementFee: '0.02',
        carryPercentage: '0.2',
        vintageYear: 2026,
      })
      .returning();

    expect(typeof inserted?.createdAt).toBe('string');
    expect(typeof inserted?.updatedAt).toBe('string');
  });

  it('applies lp_metric_runs version defaults before optimistic-lock updates', async () => {
    const [inserted] = await databaseMockModule.databaseMock
      .insert(lpMetricRuns)
      .values({
        fundId: 1,
        asOfDate: '2026-03-31',
        runType: 'quarterly_report',
        perspective: 'lp_net',
        status: 'draft',
        inputsHash: 'a'.repeat(64),
        sourceEventIds: [],
        sourceMarkIds: [],
        sourceEvidenceIds: [],
        resultsJson: {},
        diagnosticsJson: {},
        methodologyVersion: 'lp-reporting-methodology-v1',
        calculationVersion: 'lp-reporting-metrics-engine-1.0.0',
      })
      .returning();

    const [updated] = await databaseMockModule.databaseMock
      .update(lpMetricRuns)
      .set({ status: 'approved', version: 2 })
      .where(
        and(
          eq(lpMetricRuns.fundId, 1),
          eq(lpMetricRuns.id, inserted?.id as number),
          eq(lpMetricRuns.status, 'draft'),
          eq(lpMetricRuns.version, 1)
        )
      )
      .returning();

    expect(inserted?.version).toBe(1);
    expect(updated?.status).toBe('approved');
    expect(updated?.version).toBe(2);
  });

  it('can read back inserted draft configs by and(eq(fundId), eq(isDraft))', async () => {
    const [draft] = await databaseMockModule.databaseMock
      .insert(fundConfigs)
      .values({
        fundId: 42,
        version: 1,
        config: { fundName: 'Draft Fund' },
        isDraft: true,
        isPublished: false,
      })
      .returning();

    expect(draft).toBeDefined();

    const [selected] = await databaseMockModule.databaseMock
      .select()
      .from(fundConfigs)
      .where(and(eq(fundConfigs.fundId, 42), eq(fundConfigs.isDraft, true)))
      .limit(1);

    expect(selected).toBeDefined();
    expect(selected?.fundId).toBe(42);
    expect(selected?.isDraft).toBe(true);
  });

  it('supports db.query.table.findFirst for finalize/publish flows', async () => {
    await databaseMockModule.databaseMock
      .insert(fundConfigs)
      .values({
        fundId: 77,
        version: 1,
        config: { fundName: 'Query Draft' },
        isDraft: true,
        isPublished: false,
      })
      .returning();

    const selected = await databaseMockModule.databaseMock.query.fundConfigs.findFirst({
      where: and(eq(fundConfigs.fundId, 77), eq(fundConfigs.isDraft, true)),
    });

    expect(selected).toBeDefined();
    expect(selected?.fundId).toBe(77);
    expect(selected?.isDraft).toBe(true);
  });

  it('returns execute results with a rows array for background workers', async () => {
    const result = await databaseMockModule.databaseMock.execute('select 1');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveProperty('rows');
    expect(result.rows).toEqual([]);
    expect(result).toHaveProperty('rowCount', 0);
  });
});
