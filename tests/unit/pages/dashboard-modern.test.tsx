import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModernDashboard from '@/pages/dashboard-modern';

const mockUseFundContext = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

vi.mock('@/components/ui/POVLogo', () => ({
  POVBrandHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock('@/components/dashboard/CashflowDashboard', () => ({
  default: ({ fundId }: { fundId: string }) => <div>Cashflow Dashboard {fundId}</div>,
}));

vi.mock('@/components/metrics/TargetMetricsSnapshot', () => ({
  TargetMetricsSnapshot: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/sharing/ShareConfigModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('ModernDashboard', () => {
  beforeEach(() => {
    mockUseFundContext.mockReturnValue({
      currentFund: { id: 42, name: 'Fund Forty Two', size: 50_000_000 },
      isLoading: false,
    });
  });

  it('defers overview analytics instead of showing sample KPIs and charts', () => {
    render(<ModernDashboard />);

    expect(screen.getByText('Target-Aware Snapshot')).toBeInTheDocument();
    expect(screen.getByText(/overview remains deferred/i)).toBeInTheDocument();
    expect(
      screen.getByText(/this dashboard no longer presents hardcoded portfolio value, irr, moic, or sector-allocation visuals as live data/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('28.5%')).not.toBeInTheDocument();
    expect(screen.queryByText(/Portfolio Value Trend/i)).not.toBeInTheDocument();
  });

  it('defers the performance tab instead of showing benchmark sample metrics', async () => {
    const user = userEvent.setup();
    render(<ModernDashboard />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    expect(screen.getByText(/performance analytics remain deferred/i)).toBeInTheDocument();
    expect(
      screen.getByText(/benchmark, dpi\/tvpi, and attribution panels stay hidden/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Top Quartile/i)).not.toBeInTheDocument();
  });

  it('keeps the cashflow tab live', async () => {
    const user = userEvent.setup();
    render(<ModernDashboard />);

    await user.click(screen.getByRole('tab', { name: /cashflow/i }));

    expect(screen.getByText('Cashflow Dashboard 42')).toBeInTheDocument();
  });
});
