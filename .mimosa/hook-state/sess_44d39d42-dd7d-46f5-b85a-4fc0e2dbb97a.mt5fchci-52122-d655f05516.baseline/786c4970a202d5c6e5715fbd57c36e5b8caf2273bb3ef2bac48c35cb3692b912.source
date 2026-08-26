import { beforeEach, describe, expect, it, vi } from 'vitest';

const { storageMock } = vi.hoisted(() => ({
  storageMock: {
    getFund: vi.fn(),
    getPortfolioCompanies: vi.fn(),
    getInvestments: vi.fn(),
  },
}));

vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([]),
    })),
  },
}));

import { ActualMetricsCalculator } from '../../../server/services/actual-metrics-calculator';

describe('ActualMetricsCalculator live company status semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getFund.mockResolvedValue({
      id: 1,
      name: 'Test Fund I',
      size: '100000000',
      vintageYear: 2025,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    });
    storageMock.getPortfolioCompanies.mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        name: 'TechCorp',
        sector: 'Fintech',
        stage: 'Series B',
        investmentAmount: '5000000',
        currentValuation: '12500000',
        status: 'Growing',
        createdAt: new Date('2025-02-01T00:00:00.000Z'),
      },
      {
        id: 2,
        fundId: 1,
        name: 'HealthAI',
        sector: 'Healthcare',
        stage: 'Series A',
        investmentAmount: '3200000',
        currentValuation: '8100000',
        status: 'Growing',
        createdAt: new Date('2025-03-01T00:00:00.000Z'),
      },
      {
        id: 3,
        fundId: 1,
        name: 'DataFlow',
        sector: 'SaaS',
        stage: 'Series C',
        investmentAmount: '8500000',
        currentValuation: '25500000',
        status: 'Scaling',
        createdAt: new Date('2025-04-01T00:00:00.000Z'),
      },
    ]);
    storageMock.getInvestments.mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        companyId: 1,
        investmentDate: new Date('2025-02-01T00:00:00.000Z'),
        amount: '5000000',
        round: 'Series B',
      },
      {
        id: 2,
        fundId: 1,
        companyId: 2,
        investmentDate: new Date('2025-03-01T00:00:00.000Z'),
        amount: '3200000',
        round: 'Series A',
      },
      {
        id: 3,
        fundId: 1,
        companyId: 3,
        investmentDate: new Date('2025-04-01T00:00:00.000Z'),
        amount: '8500000',
        round: 'Series C',
      },
    ]);
  });

  it('counts non-exited operating statuses as live for NAV and active companies', async () => {
    const metrics = await new ActualMetricsCalculator().calculate(1);

    expect(metrics.totalDeployed).toBe(16_700_000);
    expect(metrics.currentNAV).toBe(46_100_000);
    expect(metrics.totalValue).toBe(46_100_000);
    expect(metrics.activeCompanies).toBe(3);
    expect(metrics.exitedCompanies).toBe(0);
    expect(metrics.writtenOffCompanies).toBe(0);
    expect(metrics.averageCheckSize).toBeCloseTo(5_566_666.67, 2);
    expect(metrics.dpi).toBeNull();
    expect(metrics.tvpi).toBeCloseTo(46_100_000 / 16_700_000, 6);
  });

  it('counts portfolio company investment amounts even when dated investment rows are absent', async () => {
    storageMock.getInvestments.mockResolvedValue([]);

    const metrics = await new ActualMetricsCalculator().calculate(1);

    expect(metrics.totalDeployed).toBe(16_700_000);
    expect(metrics.totalCalled).toBe(16_700_000);
    expect(metrics.currentNAV).toBe(46_100_000);
    expect(metrics.deploymentRate).toBeCloseTo(16.7, 2);
    expect(metrics.tvpi).toBeCloseTo(46_100_000 / 16_700_000, 6);
    expect(metrics.irr).toBeNull();
    expect(metrics.availability.irr.reason).toBe('insufficient_dated_cashflows');
  });

  it('supplements normalized investments with legacy company-only amounts', async () => {
    storageMock.getInvestments.mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        companyId: 1,
        investmentDate: new Date('2025-02-01T00:00:00.000Z'),
        amount: '5000000',
        round: 'Series B',
      },
    ]);

    const metrics = await new ActualMetricsCalculator().calculate(1);

    expect(metrics.totalDeployed).toBe(16_700_000);
    expect(metrics.totalCalled).toBe(16_700_000);
    expect(metrics.currentNAV).toBe(46_100_000);
    expect(metrics.tvpi).toBeCloseTo(46_100_000 / 16_700_000, 6);
  });

  it('does not supplement legacy company amounts when normalized investments are unlinked', async () => {
    storageMock.getInvestments.mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        companyId: null,
        investmentDate: new Date('2025-02-01T00:00:00.000Z'),
        amount: '5000000',
        round: 'Series B',
      },
      {
        id: 2,
        fundId: 1,
        investmentDate: new Date('2025-03-01T00:00:00.000Z'),
        amount: '3200000',
        round: 'Series A',
      },
    ]);

    const metrics = await new ActualMetricsCalculator().calculate(1);

    expect(metrics.totalDeployed).toBe(8_200_000);
    expect(metrics.totalCalled).toBe(8_200_000);
    expect(metrics.currentNAV).toBe(46_100_000);
    expect(metrics.tvpi).toBeCloseTo(46_100_000 / 8_200_000, 6);
  });
});
