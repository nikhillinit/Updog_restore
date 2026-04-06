import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetMetricsSnapshot } from '@/components/metrics/TargetMetricsSnapshot';

const mockUseFundMetrics = vi.fn();

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: () => mockUseFundMetrics(),
}));

describe('TargetMetricsSnapshot', () => {
  it('renders truthful actual-vs-target cards from unified metrics', () => {
    mockUseFundMetrics.mockReturnValue({
      data: {
        actual: {
          totalDeployed: 18_000_000,
          tvpi: 1.4,
          totalCompanies: 12,
        },
        target: {
          targetTVPI: 2.5,
          targetCompanyCount: 25,
        },
        variance: {
          deploymentVariance: {
            actual: 18_000_000,
            target: 20_000_000,
            status: 'behind',
          },
          portfolioVariance: {
            onTrack: false,
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

    expect(screen.getByText('Target-Aware Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Deployment vs Plan')).toBeInTheDocument();
    expect(screen.getByText('TVPI vs Target')).toBeInTheDocument();
    expect(screen.getByText('Companies vs Target')).toBeInTheDocument();
  });
});
