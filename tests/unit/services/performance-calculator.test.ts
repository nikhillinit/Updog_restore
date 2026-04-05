import { beforeEach, describe, expect, it, vi } from 'vitest';
import { xirrNewtonBisection, type CashFlow } from '@shared/lib/finance/xirr';
import { PerformanceCalculator } from '../../../server/services/performance-calculator';

const selectMock = vi.hoisted(() => vi.fn());
const getFundMock = vi.hoisted(() => vi.fn());

vi.mock('../../../server/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getFund: getFundMock,
  },
}));

describe('PerformanceCalculator', () => {
  let calculator: PerformanceCalculator;

  beforeEach(() => {
    calculator = new PerformanceCalculator();
    selectMock.mockReset();
    getFundMock.mockReset();
  });

  it('marks leading missing timeseries points as unavailable instead of calculated', async () => {
    selectMock.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () =>
            Promise.resolve([
              {
                metricDate: new Date('2024-02-01T00:00:00Z'),
                asOfDate: new Date('2024-02-01T00:00:00Z'),
                totalValue: '100',
                irr: '0.10',
                tvpi: '1.20',
                dpi: '0.05',
                multiple: '1.20',
              },
            ]),
        }),
      }),
    });

    const points = await calculator.calculateTimeseries(
      1,
      '2024-01-01',
      '2024-03-31',
      'monthly'
    );

    expect(points.map((point) => point._source)).toEqual([
      'unavailable',
      'database',
      'interpolated',
    ]);
    expect(points[0]?.actual).toEqual({ asOfDate: '2024-01-01' });
  });

  it('uses canonical XIRR for breakdown and portfolio IRR', async () => {
    getFundMock.mockResolvedValue({ id: 1, createdAt: new Date('2020-01-01T00:00:00Z') });

    selectMock
      .mockReturnValueOnce({
        from: () =>
          ({
            where: () =>
              Promise.resolve([
                {
                  id: 1,
                  name: 'Alpha',
                  sector: 'SaaS',
                  stage: 'Series A',
                  status: 'active',
                  currentValuation: '150',
                  investmentAmount: '100',
                  investmentDate: new Date('2020-01-01T00:00:00Z'),
                  createdAt: new Date('2020-01-01T00:00:00Z'),
                },
              ]),
          }) as const,
      })
      .mockReturnValueOnce({
        from: () =>
          ({
            where: () =>
              Promise.resolve([
                {
                  companyId: 1,
                  amount: '25',
                  distributionDate: new Date('2021-01-01T00:00:00Z'),
                },
              ]),
          }) as const,
      });

    const result = await calculator.calculateBreakdown(1, '2024-01-01', 'company', false);

    const expectedCashflows: CashFlow[] = [
      { date: new Date('2020-01-01T00:00:00Z'), amount: -100 },
      { date: new Date('2021-01-01T00:00:00Z'), amount: 25 },
      { date: new Date('2024-01-01T00:00:00Z'), amount: 150 },
    ];
    const expectedIrr = xirrNewtonBisection(expectedCashflows).irr;

    expect(expectedIrr).not.toBeNull();
    expect(result.breakdown[0]?.irr).not.toBeNull();
    expect(result.breakdown[0]?.irr).toBeCloseTo(expectedIrr!, 8);
    expect(result.totals.portfolioIRR).toBeCloseTo(expectedIrr!, 8);
  });
});
