import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetMetricsSnapshot } from '@/components/metrics/TargetMetricsSnapshot';

const mockUseFundMetrics = vi.fn();

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: () => mockUseFundMetrics(),
}));

function mockMetrics({
  actualCompanies,
  targetCompanies,
  staleOnTrack,
}: {
  actualCompanies: number;
  targetCompanies: number;
  staleOnTrack: boolean;
}) {
  mockUseFundMetrics.mockReturnValue({
    data: {
      actual: {
        totalDeployed: 18_000_000,
        tvpi: 1.4,
        totalCompanies: actualCompanies,
      },
      target: {
        targetTVPI: 2.5,
        targetCompanyCount: targetCompanies,
      },
      variance: {
        deploymentVariance: {
          actual: 18_000_000,
          target: 20_000_000,
          status: 'on-track',
        },
        portfolioVariance: {
          onTrack: staleOnTrack,
        },
      },
    },
    isLoading: false,
    error: null,
  });
}

describe('TargetMetricsSnapshot', () => {
  it('renders truthful actual-vs-target cards from unified metrics', () => {
    mockMetrics({
      actualCompanies: 12,
      targetCompanies: 25,
      staleOnTrack: false,
    });

    render(
      <TargetMetricsSnapshot
        title="Target-Aware Snapshot"
        subtitle="Truthful live metrics sourced from the unified metrics layer."
      />
    );

    expect(screen.getByText('Target-Aware Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Deployment vs Plan')).toBeInTheDocument();
    expect(screen.getByText('TVPI vs Target')).toBeInTheDocument();
    expect(screen.getByText('Companies vs Target')).toBeInTheDocument();
  });

  it('marks 3 of 20 companies behind even if variance metadata is stale', () => {
    mockMetrics({
      actualCompanies: 3,
      targetCompanies: 20,
      staleOnTrack: true,
    });

    render(
      <TargetMetricsSnapshot
        title="Target-Aware Snapshot"
        subtitle="Truthful live metrics sourced from the unified metrics layer."
      />
    );

    expect(screen.getByText('Behind Plan')).toBeInTheDocument();
  });

  it('marks 18 of 20 companies on track by the 90 percent completion threshold', () => {
    mockMetrics({
      actualCompanies: 18,
      targetCompanies: 20,
      staleOnTrack: false,
    });

    render(
      <TargetMetricsSnapshot
        title="Target-Aware Snapshot"
        subtitle="Truthful live metrics sourced from the unified metrics layer."
      />
    );

    expect(screen.getAllByText('On Track').length).toBeGreaterThanOrEqual(1);
  });

  it('uses neutral pending states for a new fund without actual activity', () => {
    mockUseFundMetrics.mockReturnValue({
      data: {
        actual: {
          totalDeployed: 0,
          totalCalled: 0,
          tvpi: 0,
          totalCompanies: 0,
        },
        target: {
          targetTVPI: 2.5,
          targetCompanyCount: 20,
        },
        variance: {
          deploymentVariance: {
            actual: 0,
            target: 10_000_000,
            status: 'behind',
          },
        },
      },
      isLoading: false,
      error: null,
    });

    render(
      <TargetMetricsSnapshot
        title="Target-Aware Snapshot"
        subtitle="Truthful live metrics sourced from the unified metrics layer."
      />
    );

    expect(screen.getByText('Awaiting deployment')).toBeInTheDocument();
    expect(screen.getByText('Awaiting paid-in capital')).toBeInTheDocument();
    expect(screen.getByText('Awaiting companies')).toBeInTheDocument();
    expect(screen.queryByText('Behind Plan')).not.toBeInTheDocument();
    expect(screen.queryByText('Below Target')).not.toBeInTheDocument();
  });

  it('shows a truthful warning instead of crashing when target snapshots are unavailable', () => {
    mockUseFundMetrics.mockReturnValue({
      data: {
        actual: {
          totalDeployed: 18_000_000,
          tvpi: 1.4,
          totalCompanies: 3,
        },
        target: null,
        variance: null,
      },
      isLoading: false,
      error: null,
    });

    render(
      <TargetMetricsSnapshot
        title="Target-Aware Snapshot"
        subtitle="Truthful live metrics sourced from the unified metrics layer."
      />
    );

    expect(screen.getByText(/baseline pending.*published target snapshot/i)).toBeInTheDocument();
  });
});
