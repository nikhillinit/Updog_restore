import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  actualMetricsV2ETag,
  projectActualMetricsV2,
  unavailableActualMetricsV2,
} from '../../../server/services/actual-metrics-v2-projector';
import {
  FinancialFactsPayloadV5Schema,
  FinancialFactsSnapshotV5Schema,
  type FinancialFactsPayloadV5,
} from '@shared/contracts/financial-facts-snapshot-v1.contract';
import { ActualMetricsV2Schema } from '@shared/contracts/lp-reporting/actuals-pilot.contract';
import { financialFactsPayloadV5, financialFactsSnapshotV5 } from '../fixtures/financial-facts-payload5';

type ParsedFactsRow = Parameters<typeof projectActualMetricsV2>[0];

function availableMoney(value: string) {
  return {
    value,
    availability: 'available' as const,
    reasonCodes: [],
    sourceRefs: ['fixture:actual-metrics-v2'],
  };
}

function factsRow(payload: FinancialFactsPayloadV5 = financialFactsPayloadV5(), id = 31): ParsedFactsRow {
  const snapshot = FinancialFactsSnapshotV5Schema.parse(
    financialFactsSnapshotV5({ payload })
  );
  return { ...snapshot, id };
}

function actionablePayload(): FinancialFactsPayloadV5 {
  const payload = financialFactsPayloadV5();
  return FinancialFactsPayloadV5Schema.parse({
    ...payload,
    capitalActuals: {
      ...payload.capitalActuals,
      committedCapital: availableMoney('1000000.000000'),
      paidInCapital: availableMoney('250000.000000'),
      deployedCapital: availableMoney('100000.000000'),
      managementFeesPaid: availableMoney('10000.000000'),
      otherExpensesPaid: availableMoney('5000.000000'),
      realizedFundProceeds: availableMoney('80000.000000'),
      distributionsToPartners: availableMoney('30000.000000'),
    },
  });
}

describe('actual metrics v2 projector', () => {
  it('projects the blocked payload-5 FIN-V001 shape and keeps gaps field-local', () => {
    const metrics = projectActualMetricsV2(factsRow());

    expect(ActualMetricsV2Schema.parse(metrics)).toEqual(metrics);
    expect(metrics).toMatchObject({
      contractVersion: 'actual-metrics/2.0.0',
      snapshotStatus: 'resolved',
      fundId: 1,
      asOfDate: '2026-07-21',
      knowledgeCutoff: '2026-07-22T02:00:00.000Z',
      financialFactsSnapshotId: 31,
      snapshotInputHash: 'b'.repeat(64),
      capital: {
        paidIn: {
          value: '50000000.000000',
          availability: 'available',
        },
        deployed: {
          value: '40000000.000000',
          availability: 'available',
        },
        calledIssued: {
          value: null,
          availability: 'unavailable',
          reasonCodes: ['CALL_NOTICE_NOT_IMPORTED'],
        },
        outstandingCalls: {
          value: null,
          availability: 'unavailable',
          reasonCodes: ['CALL_NOTICE_NOT_IMPORTED'],
        },
      },
      value: {
        portfolioFmv: {
          value: '55000000.000000',
          availability: 'available',
        },
        nav: {
          value: null,
          availability: 'unavailable',
          reasonCodes: ['NAV_UNAVAILABLE'],
        },
      },
      valuation: {
        valuationDate: '2026-07-21',
        rosterCount: 1,
        markedCount: 1,
        companies: [
          {
            companyId: 11,
            companyLabel: 'Alpha',
            positionFairValue: {
              value: '55000000.000000',
              availability: 'available',
              sourceRefs: ['a'.repeat(64)],
            },
          },
        ],
      },
      actionability: {
        scope: 'actuals_reporting',
        status: 'blocked',
        reasonCodes: ['SOURCE_NOT_SUPPLIED'],
      },
    });
  });

  it('projects the actionable FIN-V002 shape with proceeds and distributions separate', () => {
    const metrics = projectActualMetricsV2(factsRow(actionablePayload(), 32));

    expect(metrics.actionability).toEqual({
      scope: 'actuals_reporting',
      status: 'actionable',
      reasonCodes: [],
    });
    expect(metrics.value.realizedFundProceeds).toMatchObject({
      value: '80000.000000',
      availability: 'available',
    });
    expect(metrics.value.distributionsToPartners).toMatchObject({
      value: '30000.000000',
      availability: 'available',
    });
    expect(metrics.capital.committed.value).toBe('1000000.000000');
    expect(metrics.capital.paidIn.value).toBe('250000.000000');
    expect(metrics.financialFactsSnapshotId).toBe(32);
  });

  it('returns the unavailable variant and the contract ETag', () => {
    expect(unavailableActualMetricsV2(1)).toEqual({
      contractVersion: 'actual-metrics/2.0.0',
      snapshotStatus: 'unavailable',
      fundId: 1,
      asOfDate: null,
      knowledgeCutoff: null,
      financialFactsSnapshotId: null,
      snapshotInputHash: null,
      reasonCodes: ['FACTS_NOT_FOUND'],
    });
    expect(actualMetricsV2ETag(31, 'b'.repeat(64))).toBe(
      `"actual-metrics:31:${'b'.repeat(64)}:actual-metrics-2.0.0"`
    );
  });

  it('does not import a database module', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'server/services/actual-metrics-v2-projector.ts'),
      'utf8'
    );

    expect(source).not.toContain('drizzle-orm');
    expect(source).not.toMatch(/from\s+['"][^'"]*(?:\/db|database)[^'"]*['"]/);
  });
});
