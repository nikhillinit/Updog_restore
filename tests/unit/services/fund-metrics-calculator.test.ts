import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { xirrNewtonBisection, type CashFlow } from '@shared/lib/finance/xirr';

const storageMocks = vi.hoisted(() => ({
  getFund: vi.fn(),
  getPortfolioCompanies: vi.fn(),
  getInvestments: vi.fn(),
}));

const dbSelectMock = vi.hoisted(() => vi.fn());

vi.mock('../../../server/storage', () => ({
  storage: storageMocks,
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: dbSelectMock,
  },
}));

import { calculateFundMetrics } from '../../../server/services/fund-metrics-calculator';

function makeSelectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe('calculateFundMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses canonical shared XIRR for persisted fund metrics', async () => {
    storageMocks.getFund.mockResolvedValue({
      id: 1,
      size: '1000',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    storageMocks.getPortfolioCompanies.mockResolvedValue([
      {
        status: 'active',
        currentValuation: '120',
      },
    ]);
    storageMocks.getInvestments.mockResolvedValue([
      {
        investmentDate: new Date('2024-01-01T00:00:00.000Z'),
        amount: 100,
      },
    ]);
    dbSelectMock.mockReturnValueOnce(
      makeSelectChain([
        {
          amount: '30',
          distributionDate: new Date('2024-06-01T00:00:00.000Z'),
        },
      ])
    );

    const metrics = await calculateFundMetrics(1);

    const expectedCashflows: CashFlow[] = [
      { date: new Date('2024-01-01T00:00:00.000Z'), amount: -100 },
      { date: new Date('2024-06-01T00:00:00.000Z'), amount: 30 },
      { date: new Date('2025-01-01T00:00:00.000Z'), amount: 120 },
    ];
    const result = xirrNewtonBisection(expectedCashflows);

    expect(metrics.irr).not.toBeNull();
    expect(metrics.irr).toBeCloseTo(result.irr ?? 0, 6);
  });

  it('returns null IRR when there is no positive return-side cash flow', async () => {
    storageMocks.getFund.mockResolvedValue({
      id: 1,
      size: '1000',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
    });
    storageMocks.getPortfolioCompanies.mockResolvedValue([
      {
        status: 'active',
        currentValuation: '0',
      },
    ]);
    storageMocks.getInvestments.mockResolvedValue([
      {
        investmentDate: new Date('2024-01-01T00:00:00.000Z'),
        amount: 100,
      },
    ]);
    dbSelectMock.mockReturnValueOnce(makeSelectChain([]));

    const metrics = await calculateFundMetrics(1);

    expect(metrics.irr).toBeNull();
  });
});
