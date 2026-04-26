import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnifiedFundMetrics } from '@shared/types/metrics';
import DynamicFundHeader from '@/components/layout/dynamic-fund-header';

const { mockUseFlag, mockUseFundContext, mockUseFundMetrics } = vi.hoisted(() => ({
  mockUseFlag: vi.fn(),
  mockUseFundContext: vi.fn(),
  mockUseFundMetrics: vi.fn(),
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: (...args: unknown[]) => mockUseFlag(...args),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: (...args: unknown[]) => mockUseFundMetrics(...args),
}));

const currentFund = {
  id: 5,
  name: 'Truth Fund I',
  size: 50_000_000,
  vintageYear: 2026,
  termYears: 10,
};

function makeMetrics(
  actualOverrides: Partial<UnifiedFundMetrics['actual']> = {}
): UnifiedFundMetrics {
  return {
    fundId: 5,
    fundName: 'Truth Fund I',
    actual: {
      asOfDate: '2026-04-25T12:00:00.000Z',
      totalCommitted: 50_000_000,
      totalCalled: 20_000_000,
      totalDeployed: 12_000_000,
      totalUncalled: 30_000_000,
      currentNAV: 40_000_000,
      totalDistributions: 6_000_000,
      totalValue: 46_000_000,
      irr: null,
      tvpi: 2.3,
      dpi: null,
      rvpi: 2,
      activeCompanies: 3,
      exitedCompanies: 1,
      writtenOffCompanies: 0,
      totalCompanies: 4,
      deploymentRate: 24,
      averageCheckSize: 4_000_000,
      ...actualOverrides,
    },
    projected: {
      asOfDate: '2026-04-25T12:00:00.000Z',
      projectionDate: '2026-04-25T12:00:00.000Z',
      projectedDeployment: [],
      projectedDistributions: [],
      projectedNAV: [],
      expectedTVPI: 2.5,
      expectedIRR: 0.2,
      expectedDPI: 1.5,
      totalReserveNeeds: 0,
      allocatedReserves: 0,
      unallocatedReserves: 0,
      reserveAllocationRate: 0,
      deploymentPace: 'on-track',
      quartersRemaining: 0,
      recommendedQuarterlyDeployment: 0,
    },
    target: {
      targetFundSize: 50_000_000,
      targetIRR: 0.2,
      targetTVPI: 2.5,
      targetDeploymentYears: 4,
      targetCompanyCount: 20,
      targetAverageCheckSize: 2_500_000,
    },
    variance: {
      deploymentVariance: {
        actual: 12_000_000,
        target: 10_000_000,
        variance: 2_000_000,
        percentDeviation: 20,
        status: 'ahead',
      },
      performanceVariance: {
        actualIRR: null,
        targetIRR: 0.2,
        variance: null,
        status: 'insufficient-data',
      },
      tvpiVariance: {
        actual: 2.3,
        projected: 2.5,
        target: 2.5,
        varianceVsProjected: -0.2,
        varianceVsTarget: -0.2,
      },
      paceVariance: {
        status: 'on-track',
        monthsDeviation: 0,
        periodElapsedPercent: 25,
        capitalDeployedPercent: 24,
      },
      portfolioVariance: {
        actualCompanies: 4,
        targetCompanies: 20,
        variance: -16,
        onTrack: false,
      },
    },
    lastUpdated: '2026-04-25T12:00:00.000Z',
  };
}

function metricLabel(name: string) {
  const matches = screen.getAllByText(name);
  return matches[matches.length - 1];
}

describe('DynamicFundHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFlag.mockReturnValue(false);
    mockUseFundContext.mockReturnValue({ currentFund });
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics(),
      isLoading: false,
      error: null,
    });
  });

  it('shows N/A for actual metrics when the metrics payload is unavailable', () => {
    mockUseFundMetrics.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('Total Invested').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('Current Value').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('Active').parentElement).toHaveTextContent('N/A');
    expect(screen.getAllByText('Metrics unavailable').length).toBeGreaterThanOrEqual(1);
  });

  it('renders genuine zeroes and populated actual metrics when actual data exists', () => {
    render(<DynamicFundHeader />);

    expect(metricLabel('Total Invested').parentElement).toHaveTextContent('$12M');
    expect(metricLabel('Current Value').parentElement).toHaveTextContent('$46M');
    expect(metricLabel('Net IRR').parentElement).toHaveTextContent('Needs history');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('2.30x');
    expect(metricLabel('DPI').parentElement).toHaveTextContent('No distributions');
    expect(metricLabel('Active').parentElement).toHaveTextContent('3');
    expect(screen.getByText('24% Deployed')).toBeInTheDocument();
  });

  it('renders calculated IRR and DPI when actual cash-flow metrics are available', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({
        irr: 0.183,
        dpi: 0.42,
        availability: {
          irr: { status: 'available', source: 'cashflows' },
          dpi: { status: 'available', source: 'distributions' },
        },
      }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('Net IRR').parentElement).toHaveTextContent('18.3%');
    expect(metricLabel('DPI').parentElement).toHaveTextContent('0.42x');
  });

  it('does not render TVPI as 0.00x when paid-in capital is unavailable', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({
        totalCalled: 0,
        totalValue: 0,
        tvpi: 0,
      }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('TVPI').parentElement).toHaveTextContent('N/A');
    expect(screen.queryByText('0.00x')).not.toBeInTheDocument();
  });

  it('keeps compact TVPI at N/A when paid-in capital is unavailable', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({
        totalCalled: 0,
        totalValue: 0,
        tvpi: 0,
      }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'TVPI' }));

    expect(screen.getByText('TVPI:').parentElement).toHaveTextContent('N/A');
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
  });

  it('keeps compact DPI truthful when distributions have not been recorded', () => {
    mockUseFlag.mockReturnValue(true);

    render(<DynamicFundHeader />);

    expect(screen.getByText('DPI:').parentElement).toHaveTextContent('No distributions');
  });
});
