import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storageMock, dbMock } = vi.hoisted(() => ({
  storageMock: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getInvestments: vi.fn(),
  },
  dbMock: {
    select: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/db', () => ({
  db: dbMock,
}));

vi.mock('../../../server/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

import { ActualMetricsCalculator } from '../../../server/services/actual-metrics-calculator';

function distributionQuery(result: Promise<unknown>) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue(result),
  };
}

describe('ActualMetricsCalculator actual fact plumbing', () => {
  let calculator: ActualMetricsCalculator;

  beforeEach(() => {
    vi.clearAllMocks();
    calculator = new ActualMetricsCalculator();

    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Metrics Fund',
      size: '50000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2022,
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 10,
        fundId: 1,
        name: 'LiveCo',
        sector: 'AI',
        stage: 'Series A',
        status: 'active',
        investmentAmount: '10000000',
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
        currentValuation: '30000000',
      },
    ]);
    storageMock.getInvestments.mockResolvedValue([
      {
        id: 100,
        fundId: 1,
        companyId: 10,
        investmentDate: new Date('2022-01-01T00:00:00.000Z'),
        amount: '10000000',
        round: 'Series A',
      },
    ]);
  });

  it('calculates DPI and IRR from dated investments, distributions, and current NAV', async () => {
    dbMock.select.mockReturnValue(
      distributionQuery(
        Promise.resolve([
          {
            date: new Date('2024-01-01T00:00:00.000Z'),
            amount: '5000000',
          },
        ])
      )
    );

    const metrics = await calculator.calculate(1);

    expect(metrics.totalDistributions).toBe(5_000_000);
    expect(metrics.dpi).toBeCloseTo(0.5, 6);
    expect(metrics.availability?.dpi).toMatchObject({
      status: 'available',
      source: 'distributions',
    });
    expect(metrics.irr).toEqual(expect.any(Number));
    expect(metrics.availability?.irr).toMatchObject({
      status: 'available',
      source: 'cashflows',
    });
  });

  it('keeps DPI unavailable when no distribution facts exist', async () => {
    dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

    const metrics = await calculator.calculate(1);

    expect(metrics.totalDistributions).toBe(0);
    expect(metrics.dpi).toBeNull();
    expect(metrics.availability?.dpi).toMatchObject({
      status: 'unavailable',
      reason: 'no_distributions_recorded',
      message: 'No distributions recorded',
    });
  });

  it('keeps IRR unavailable when dated investment history is missing', async () => {
    storageMock.getInvestments.mockResolvedValue([]);
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 10,
        fundId: 1,
        name: 'LiveCo',
        sector: 'AI',
        stage: 'Series A',
        status: 'active',
        investmentAmount: '10000000',
        investmentDate: null,
        currentValuation: '30000000',
      },
    ]);
    dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

    const metrics = await calculator.calculate(1);

    expect(metrics.irr).toBeNull();
    expect(metrics.availability?.irr).toMatchObject({
      status: 'unavailable',
      reason: 'insufficient_dated_cashflows',
    });
  });

  it('does not calculate DPI from current NAV when distributions are absent', async () => {
    dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

    const metrics = await calculator.calculate(1);

    expect(metrics.currentNAV).toBe(30_000_000);
    expect(metrics.totalValue).toBe(30_000_000);
    expect(metrics.dpi).toBeNull();
  });

  it('derives live position FMV from ownership and preserves null-ownership legacy NAV', async () => {
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 10,
        fundId: 1,
        name: 'Owned Position',
        sector: 'Consumer',
        stage: 'Series A',
        status: 'active',
        investmentAmount: '500000.00',
        currentValuation: '50000000.00',
        ownershipCurrentPct: '0.0208',
      },
      {
        id: 11,
        fundId: 1,
        name: 'Legacy Position',
        sector: 'SaaS',
        stage: 'Seed',
        status: 'active',
        investmentAmount: '1000000.00',
        currentValuation: '3000000.00',
        ownershipCurrentPct: null,
      },
    ]);
    dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

    const metrics = await calculator.calculate(1);

    expect(metrics.currentNAV).toBe(4_040_000);
    expect(metrics.totalValue).toBe(4_040_000);
  });

  it('uses establishment date before vintage-year fallback for fund age', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-17T00:00:00.000Z'));
    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Metrics Fund',
      size: '50000000',
      managementFee: '0.02',
      carryPercentage: '0.2',
      vintageYear: 2022,
      establishmentDate: '2022-07-15',
    });
    dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

    try {
      const metrics = await calculator.calculate(1);

      expect(metrics.fundAgeMonths).toBe(46);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('storage-only fund resolution (no funds-table fallback)', () => {
    it('resolves the fund from storage without a direct funds-table query', async () => {
      dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

      const metrics = await calculator.calculate(1);

      expect(metrics.totalCommitted).toBe(50_000_000);
      // A second db.select would indicate the removed funds-table fallback returned.
      expect(dbMock.select).toHaveBeenCalledTimes(1);
    });

    it('throws fund-not-found without falling back to a direct funds-table query', async () => {
      storageMock.getFund.mockResolvedValue(undefined);
      dbMock.select.mockReturnValue(distributionQuery(Promise.resolve([])));

      await expect(calculator.calculate(99)).rejects.toThrow('Fund 99 not found');
      // A second db.select would indicate the removed funds-table fallback returned.
      expect(dbMock.select).toHaveBeenCalledTimes(1);
    });
  });
});
