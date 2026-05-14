import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

type TimeseriesResponse = {
  timeseries: Array<{
    date: string;
    actual: {
      irr?: number | null;
      tvpi?: number | null;
      dpi?: number | null;
      totalValue?: number | null;
    };
    _source: 'database' | 'interpolated' | 'unavailable';
  }>;
  meta: {
    startDate: string;
    endDate: string;
    dataPoints: number;
    computeTimeMs: number;
  };
};

type BreakdownResponse = {
  totals: {
    companyCount: number;
    totalDeployed: number;
    averageMOIC: number;
    portfolioIRR: number | null;
  };
  breakdown: Array<{
    group: string;
    companyCount: number;
    totalDeployed: number;
    currentValue: number;
    moic: number;
    irr: number | null;
    percentOfPortfolio: number;
  }>;
};

const mockUsePerformanceTimeseries = vi.hoisted(() => vi.fn());
const mockUsePerformanceBreakdown = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/usePerformanceDashboard', () => ({
  usePerformanceTimeseries: mockUsePerformanceTimeseries,
  usePerformanceBreakdown: mockUsePerformanceBreakdown,
}));

vi.mock('@/components/charts/LazyResponsiveContainer', () => ({
  LazyResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}));

import PerformanceDashboard from '@/components/performance/PerformanceDashboard';

function makeTimeseriesData(
  sources: Array<'database' | 'interpolated' | 'unavailable'>
): TimeseriesResponse {
  return {
    timeseries: sources.map((source, index) => ({
      date: `2024-01-0${index + 1}`,
      actual: {
        irr: source === 'unavailable' ? null : 0.12,
        tvpi: source === 'unavailable' ? null : 1.5,
        dpi: source === 'unavailable' ? null : 0.2,
        totalValue: source === 'unavailable' ? null : 100,
      },
      _source: source,
    })),
    meta: {
      startDate: '2024-01-01',
      endDate: '2024-01-03',
      dataPoints: sources.length,
      computeTimeMs: 12,
    },
  };
}

function makeUnavailableTimeseriesData(): TimeseriesResponse {
  return {
    timeseries: [
      {
        date: '2024-01-01',
        actual: {},
        _source: 'unavailable',
      },
      {
        date: '2024-02-01',
        actual: {
          irr: null,
          tvpi: null,
          dpi: null,
          totalValue: null,
        },
        _source: 'unavailable',
      },
    ],
    meta: {
      startDate: '2024-01-01',
      endDate: '2024-02-01',
      dataPoints: 2,
      computeTimeMs: 12,
    },
  };
}

function makeBreakdownData(
  breakdown: BreakdownResponse['breakdown'] = [
    {
      group: 'SaaS',
      companyCount: 1,
      totalDeployed: 100,
      currentValue: 150,
      moic: 1.5,
      irr: 0.12,
      percentOfPortfolio: 100,
    },
  ]
): BreakdownResponse {
  return {
    totals: {
      companyCount: 1,
      totalDeployed: 100,
      averageMOIC: 1.5,
      portfolioIRR: 0.12,
    },
    breakdown,
  };
}

describe('PerformanceDashboard', () => {
  beforeEach(() => {
    mockUsePerformanceTimeseries.mockReset();
    mockUsePerformanceBreakdown.mockReset();

    mockUsePerformanceTimeseries.mockReturnValue({
      data: makeTimeseriesData(['database']),
      isLoading: false,
      refetch: vi.fn(),
    });

    mockUsePerformanceBreakdown.mockReturnValue({
      data: makeBreakdownData(),
      isLoading: false,
      refetch: vi.fn(),
    });
  });

  it('renders only the mounted supported tabs', () => {
    render(<PerformanceDashboard />);

    expect(screen.getByRole('tab', { name: 'Time Series' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Breakdown' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /comparison/i })).not.toBeInTheDocument();
  });

  it('renders source-quality messaging when derived points remain visible', () => {
    mockUsePerformanceTimeseries.mockReturnValue({
      data: makeTimeseriesData(['database', 'interpolated', 'unavailable']),
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PerformanceDashboard />);

    expect(screen.getByTestId('timeseries-source-note')).toBeInTheDocument();
    expect(
      screen.getByText(/interpolated between persisted metric snapshots/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/shown as unavailable rather than inferred from mutable current state/i)
    ).toBeInTheDocument();
  });

  it('uses truthful mounted copy for persisted performance data', () => {
    render(<PerformanceDashboard />);

    expect(
      screen.getByText(/track persisted irr, tvpi, and dpi metrics over time/i)
    ).toBeInTheDocument();
  });

  it('does not render a dead export button without an owned backend action', () => {
    render(<PerformanceDashboard />);

    expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
  });

  it('shows explicit empty states instead of blank charts when all timeseries metrics are unavailable', () => {
    mockUsePerformanceTimeseries.mockReturnValue({
      data: makeUnavailableTimeseriesData(),
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PerformanceDashboard />);

    expect(screen.getByText('IRR history pending')).toBeInTheDocument();
    expect(screen.getByText('Multiple history pending')).toBeInTheDocument();
    expect(screen.getAllByTestId('performance-chart-empty-state')).toHaveLength(2);
  });

  it('shows an explicit breakdown empty state when there are no portfolio rows', async () => {
    const user = userEvent.setup();
    mockUsePerformanceBreakdown.mockReturnValue({
      data: makeBreakdownData([]),
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<PerformanceDashboard />);
    await user.click(screen.getByRole('tab', { name: 'Breakdown' }));

    await waitFor(() => {
      expect(screen.getByText('Breakdown pending')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/add portfolio companies or import a demo profile/i)
    ).toBeInTheDocument();
  });
});
