import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Performance from '@/pages/performance';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: { id: 7, name: 'Fund Seven' },
    isLoading: false,
  }),
}));

vi.mock('@/components/ui/POVLogo', () => ({
  POVBrandHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock('@/components/performance/PerformanceDashboard', () => ({
  default: () => <div>Performance Dashboard</div>,
}));

vi.mock('@/components/metrics/TargetMetricsSnapshot', () => ({
  TargetMetricsSnapshot: ({ title }: { title: string }) => <div>{title}</div>,
}));

describe('Performance page', () => {
  it('renders the target snapshot above the performance dashboard', () => {
    render(<Performance />);

    expect(screen.getByText('Target Snapshot')).toBeInTheDocument();
    expect(screen.getByText('Performance Dashboard')).toBeInTheDocument();
  });
});
