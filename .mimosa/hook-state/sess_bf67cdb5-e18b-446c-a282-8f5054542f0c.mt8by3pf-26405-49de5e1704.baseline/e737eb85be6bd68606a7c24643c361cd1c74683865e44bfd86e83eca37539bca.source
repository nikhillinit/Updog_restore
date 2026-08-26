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

describe('Performance page', () => {
  it('renders the performance dashboard without duplicating the global truth-line metrics', () => {
    render(<Performance />);

    expect(screen.getByText('Performance Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Target Snapshot')).not.toBeInTheDocument();
  });
});
