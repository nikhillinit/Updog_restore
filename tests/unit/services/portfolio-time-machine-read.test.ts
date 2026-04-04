import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PortfolioCompany } from '@shared/schema';
import { NotFoundError } from '../../../server/errors';

const { mockGetPortfolioCompanies, mockGetStateAtTime } = vi.hoisted(() => ({
  mockGetPortfolioCompanies: vi.fn(),
  mockGetStateAtTime: vi.fn(),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getPortfolioCompanies: mockGetPortfolioCompanies,
  },
}));

vi.mock('../../../server/services/time-travel-analytics', () => ({
  TimeTravelAnalyticsService: vi.fn(() => ({
    getStateAtTime: mockGetStateAtTime,
  })),
}));

import { portfolioTimeMachineReadService } from '../../../server/services/portfolio-time-machine-read';

const liveCompanies: PortfolioCompany[] = [
  {
    id: 1,
    fundId: 7,
    name: 'TechCorp',
    sector: 'Fintech',
    stage: 'Series B',
    currentStage: 'Series C',
    investmentAmount: '5000000',
    investmentDate: new Date('2024-01-15T00:00:00.000Z'),
    currentValuation: '12500000',
    foundedYear: 2019,
    status: 'Growing',
    description: 'Leading fintech platform',
    dealTags: ['B2B'],
    createdAt: new Date('2024-01-15T00:00:00.000Z'),
    deployedReservesCents: 0,
    plannedReservesCents: 0,
    exitMoicBps: null,
    ownershipCurrentPct: '8.5000',
    allocationCapCents: null,
    allocationReason: null,
    allocationIteration: 0,
    lastAllocationAt: null,
    allocationVersion: 1,
  },
];

describe('PortfolioTimeMachineReadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPortfolioCompanies.mockResolvedValue(liveCompanies);
  });

  it('returns live companies unchanged when no asOf is provided', async () => {
    const result = await portfolioTimeMachineReadService.listCompanies(7);

    expect(result.meta).toMatchObject({
      mode: 'live',
      source: 'live',
      requestedAsOf: null,
    });
    expect(result.companies).toEqual(liveCompanies);
    expect(mockGetStateAtTime).not.toHaveBeenCalled();
  });

  it('merges historical snapshot values onto live company rows', async () => {
    mockGetStateAtTime.mockResolvedValue({
      timestamp: '2025-03-31T23:59:59.999Z',
      state: {
        companies: [
          {
            id: 1,
            name: 'TechCorp',
            sector: 'Fintech',
            stage: 'Series B',
            valuation: 9800000,
          },
        ],
      },
    });

    const result = await portfolioTimeMachineReadService.listCompanies(7, {
      asOf: new Date('2025-03-31T23:59:59.999Z'),
      requestedAsOf: '2025-03',
    });

    expect(result.meta).toMatchObject({
      mode: 'historical',
      source: 'snapshot',
      requestedAsOf: '2025-03',
      resolvedAsOf: '2025-03-31T23:59:59.999Z',
      historicalAvailable: true,
    });
    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]).toMatchObject({
      id: 1,
      name: 'TechCorp',
      currentValuation: '9800000',
      stage: 'Series B',
      investmentAmount: '5000000',
    });
  });

  it('returns deterministic empty historical state when no snapshot exists', async () => {
    mockGetStateAtTime.mockRejectedValue(
      new NotFoundError('No snapshot found for fund 7 before 2025-03-31T23:59:59.999Z')
    );

    const result = await portfolioTimeMachineReadService.listCompanies(7, {
      asOf: new Date('2025-03-31T23:59:59.999Z'),
      requestedAsOf: '2025-03',
    });

    expect(result.companies).toEqual([]);
    expect(result.meta).toMatchObject({
      mode: 'historical',
      requestedAsOf: '2025-03',
      historicalAvailable: false,
      emptyReason: 'no_snapshot',
    });
  });
});
