import React from 'react';
import { render, screen, within } from '@testing-library/react';
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

    expect(metricLabel('Deployed').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('NAV').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('Remaining').parentElement).toHaveTextContent('N/A');
    expect(screen.getAllByText('Metrics unavailable').length).toBeGreaterThanOrEqual(1);
  });

  it('suppresses stale metric values while legacy header metrics are loading', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics(),
      isLoading: true,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('Deployed').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('NAV').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('N/A');
    expect(screen.getAllByText('Metrics loading').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('$12M')).not.toBeInTheDocument();
    expect(screen.queryByText('2.30x')).not.toBeInTheDocument();
  });

  it('suppresses stale metric values when legacy header metrics error', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics(),
      isLoading: false,
      error: new Error('metrics unavailable'),
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('Deployed').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('NAV').parentElement).toHaveTextContent('N/A');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('N/A');
    expect(screen.getAllByText('Metrics unavailable').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Metrics source unavailable')).toBeInTheDocument();
    expect(screen.queryByText('$12M')).not.toBeInTheDocument();
    expect(screen.queryByText('2.30x')).not.toBeInTheDocument();
  });

  it('renders genuine zeroes and populated actual metrics when actual data exists', () => {
    render(<DynamicFundHeader />);

    expect(metricLabel('Deployed').parentElement).toHaveTextContent('24.0%');
    expect(metricLabel('NAV').parentElement).toHaveTextContent('$40M');
    expect(screen.getByText('$40M')).toHaveClass('tabular-nums');
    expect(metricLabel('Remaining').parentElement).toHaveTextContent('$38M');
    expect(metricLabel('Net IRR').parentElement).toHaveTextContent('Needs history');
    expect(metricLabel('TVPI').parentElement).toHaveTextContent('2.30x');
    expect(metricLabel('DPI').parentElement).toHaveTextContent('No distributions');
    expect(screen.queryByText('Avg Check')).not.toBeInTheDocument();
    expect(screen.getByText('24% Deployed')).toBeInTheDocument();
  });

  it('uses deployed capital, not accounting uncalled capital, for header remaining capital', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({
        totalCommitted: 50_000_000,
        totalCalled: 20_000_000,
        totalDeployed: 12_000_000,
        totalUncalled: 30_000_000,
      }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(metricLabel('Remaining').parentElement).toHaveTextContent('$38M');
    expect(metricLabel('Remaining').parentElement).not.toHaveTextContent('$30M');
  });

  it('renders a neutral awaiting-deployment state for a new fund with actual zero deployment', () => {
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({
        totalCalled: 0,
        totalDeployed: 0,
        totalUncalled: 50_000_000,
        currentNAV: 0,
        totalDistributions: 0,
        totalValue: 0,
        tvpi: 0,
        deploymentRate: 0,
        activeCompanies: 0,
        totalCompanies: 0,
        averageCheckSize: 0,
      }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    expect(screen.getByText('Awaiting deployment')).toBeInTheDocument();
    expect(metricLabel('Deployed').parentElement).toHaveTextContent('0.0%');
    expect(metricLabel('NAV').parentElement).toHaveTextContent('$0');
    expect(metricLabel('Remaining').parentElement).toHaveTextContent('$50M');
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

    const tvpiCard = screen.getByTestId('compact-kpi-tvpi');
    expect(tvpiCard).toHaveTextContent('TVPI');
    expect(tvpiCard).toHaveTextContent('N/A');
    expect(tvpiCard).toHaveAttribute(
      'title',
      'TVPI is unavailable until paid-in capital is available.'
    );
    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
  });

  it('keeps compact DPI truthful when distributions have not been recorded', () => {
    mockUseFlag.mockReturnValue(true);

    render(<DynamicFundHeader />);

    const panel = screen.getByTestId('compact-kpi-dpi');
    expect(panel).toHaveTextContent('No distributions');
    expect(panel).toHaveAttribute(
      'title',
      'DPI is unavailable because no distributions have been recorded.'
    );
    expect(screen.queryByText('DPI:')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'DPI' })).not.toBeInTheDocument();
  });

  it('uses the shared normalized current NAV for compact NAV', () => {
    mockUseFlag.mockReturnValue(true);

    render(<DynamicFundHeader />);

    const navCard = screen.getByTestId('compact-kpi-nav');
    expect(navCard).toHaveTextContent('NAV');
    expect(navCard).toHaveTextContent('$40.0M');
    expect(navCard).not.toHaveTextContent('$46.0M');
  });

  it('renders compact KPI items in the canonical truth-line order', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseFundMetrics.mockReturnValue({
      data: makeMetrics({ irr: 0.183, dpi: 0.42 }),
      isLoading: false,
      error: null,
    });

    render(<DynamicFundHeader />);

    const panel = screen.getByTestId('header-kpis');
    const cards = within(panel).getAllByTestId(/^compact-kpi-/);
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining('Deployed'),
      expect.stringContaining('Remaining'),
      expect.stringContaining('NAV'),
      expect.stringContaining('TVPI'),
      expect.stringContaining('DPI'),
      expect.stringContaining('Net IRR'),
    ]);
    expect(screen.getByTestId('compact-kpi-deployed')).toHaveTextContent('24.0%');
    expect(screen.getByTestId('compact-kpi-remaining')).toHaveTextContent('$38.0M');
    expect(screen.getByTestId('compact-kpi-tvpi')).toHaveTextContent('2.30x');
    expect(screen.getByTestId('compact-kpi-dpi')).toHaveTextContent('0.42x');
    expect(screen.getByTestId('compact-kpi-netIrr')).toHaveTextContent('18.3%');
  });

  it('explains compact KPI source failures without showing stale values', () => {
    mockUseFlag.mockReturnValue(true);
    mockUseFundMetrics.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('metrics unavailable'),
    });

    render(<DynamicFundHeader />);

    const panel = screen.getByTestId('compact-kpi-dpi');
    expect(panel).toHaveTextContent('Metrics unavailable');
    expect(panel).toHaveAttribute(
      'title',
      'Metrics unavailable because the live metrics source is unavailable.'
    );
    expect(screen.queryByText('$12M')).not.toBeInTheDocument();
  });
});
