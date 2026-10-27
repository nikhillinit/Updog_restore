import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { z as z3 } from 'zod/v3';
import {
  analyzeCashFlowsSchema,
  liquidityForecastSchema,
  optimizeCallsSchema,
  stressTestSchema,
} from '../../../server/routes/liquidity';

const require = createRequire(import.meta.url);
const { version } = require('zod/package.json') as { version: string };

describe('bounded arrays use the production Zod parser', () => {
  it('rejects oversized arrays before parsing their elements', () => {
    let visits = 0;
    const schema = z
      .array(
        z.preprocess((value) => {
          visits++;
          return value;
        }, z.number())
      )
      .max(2);
    const result = schema.safeParse(Array(500).fill(1));

    expect(result.success, `zod ${version}`).toBe(false);
    expect(visits, `zod ${version} element visits`).toBe(0);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]).toMatchObject({ code: 'too_big', path: [], maximum: 2 });
    }
  });

  it('documents the bundled v3 negative control', () => {
    let visits = 0;
    const schema = z3
      .array(
        z3.preprocess((value) => {
          visits++;
          return value;
        }, z3.number())
      )
      .max(2);

    expect(schema.safeParse(Array(500).fill(1)).success).toBe(false);
    expect(visits).toBe(500);
  });
});

describe('liquidity request schemas', () => {
  const currentPosition = {
    fundId: '1',
    asOfDate: new Date('2026-01-01T00:00:00Z'),
    bankAccounts: [],
    totalCash: 100,
    totalCommitted: 1000,
    totalDeployed: 0,
    availableLiquidity: 100,
    pendingInflows: 0,
    pendingOutflows: 0,
    netPending: 0,
    dryPowder: 100,
    reserveRequirement: 0,
    availableInvestment: 100,
  };
  const base = { fundId: '1', fundSize: 1000, currentPosition };

  it.each([2, 61, 3.5])('rejects forecast horizon %s', (months) => {
    const result = liquidityForecastSchema.safeParse({ ...base, months });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['months']);
  });

  it.each([3, 6, 12, 24, 60])('accepts forecast horizon %s', (months) => {
    expect(liquidityForecastSchema.parse({ ...base, months }).months).toBe(months);
  });

  it('keeps the default horizon and empty optional constraints', () => {
    expect(liquidityForecastSchema.parse(base)).toMatchObject({
      months: 12,
      recurringExpenses: [],
    });
    expect(stressTestSchema.parse({ ...base, stressFactors: {} }).stressFactors).toEqual({});
    expect(
      optimizeCallsSchema.parse({ ...base, plannedInvestments: [], constraints: {} }).constraints
    ).toEqual({});
  });

  it('retains the existing unbounded transaction and planned-investment inputs', () => {
    const transaction = {
      id: '00000000-0000-0000-0000-000000000001',
      fundId: '1',
      type: 'investment',
      amount: -1,
      plannedDate: new Date('2026-01-01T00:00:00Z'),
      description: 'Planned investment',
      createdBy: 'user',
    };
    expect(
      analyzeCashFlowsSchema.parse({ ...base, transactions: Array(500).fill(transaction) })
        .transactions
    ).toHaveLength(500);
    const investment = {
      id: '1',
      description: 'Investment',
      amount: 1,
      targetDate: '2026-01-01',
      priority: 1,
    };
    expect(
      optimizeCallsSchema.parse({ ...base, plannedInvestments: Array(500).fill(investment) })
        .plannedInvestments
    ).toHaveLength(500);
  });
});
