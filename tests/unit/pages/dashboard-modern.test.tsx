import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModernDashboard from '@/pages/dashboard-modern';

const mockUseFundContext = vi.fn();
const mockUseFundMetrics = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mockUseFundContext(),
}));

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: () => mockUseFundMetrics(),
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

vi.mock('@/components/sharing/ShareConfigModal', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('ModernDashboard', () => {
  beforeEach(() => {
    mockUseFundContext.mockReturnValue({
      currentFund: { id: 42, name: 'Fund Forty Two', size: 50_000_000 },
      isLoading: false,
    });
    mockUseFundMetrics.mockReturnValue({
      data: {
        actual: {
          asOfDate: '2026-04-24T00:00:00.000Z',
          totalCommitted: 50_000_000,
          totalCalled: 20_000_000,
          totalDeployed: 12_500_000,
          totalUncalled: 30_000_000,
          currentNAV: 18_000_000,
          totalDistributions: 2_000_000,
          totalValue: 20_000_000,
          irr: 0.18,
          tvpi: 1.25,
          dpi: 0.1,
          rvpi: 0.9,
          activeCompanies: 12,
          exitedCompanies: 2,
          writtenOffCompanies: 1,
          totalCompanies: 15,
          deploymentRate: 25,
          averageCheckSize: 833_333,
        },
        variance: {
          performanceVariance: {
            actualIRR: 0.18,
            targetIRR: 0.2,
            variance: -0.02,
            status: 'below',
          },
        },
      },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders supported overview metrics instead of broad deferred copy', () => {
    render(<ModernDashboard />);

    expect(screen.queryByText('Target-Aware Snapshot')).not.toBeInTheDocument();
    expect(screen.getByText(/supported overview metrics/i)).toBeInTheDocument();
    expect(screen.getByText('Total committed')).toBeInTheDocument();
    expect(screen.getByText('$50.0M')).toBeInTheDocument();
    expect(screen.getByText('Active companies')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.queryByText(/overview remains deferred/i)).not.toBeInTheDocument();
    expect(screen.queryByText('28.5%')).not.toBeInTheDocument();
    expect(screen.queryByText(/Portfolio Value Trend/i)).not.toBeInTheDocument();
  });

  it('keeps only the real global action in the top bar (no dead placeholder controls)', () => {
    render(<ModernDashboard />);

    expect(screen.getByText('Share with LPs')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^filter$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
  });

  it('hides the context rail and trigger when the flag is off (default)', () => {
    render(<ModernDashboard />);
    expect(screen.queryByRole('complementary', { name: 'Context rail' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^context$/i })).not.toBeInTheDocument();
  });

  it('renders the inline context rail and the below-xl trigger when the flag is on', () => {
    window.localStorage.setItem('ff_enable_context_rail', '1');
    render(<ModernDashboard />);
    expect(screen.getByRole('complementary', { name: 'Context rail' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^context$/i })).toBeInTheDocument();
    // honest freshness item from the mocked asOfDate (2026-04-24)
    expect(screen.getByText('As of Apr 24, 2026')).toBeInTheDocument();
  });

  it('renders supported performance metrics while keeping unsupported claims unavailable', async () => {
    const user = userEvent.setup();
    render(<ModernDashboard />);

    await user.click(screen.getByRole('tab', { name: /performance/i }));

    expect(screen.getByText(/supported performance metrics/i)).toBeInTheDocument();
    expect(screen.getByText('IRR')).toBeInTheDocument();
    expect(screen.getByText('18.0%')).toBeInTheDocument();
    expect(screen.getByText('TVPI')).toBeInTheDocument();
    expect(screen.getByText('1.25x')).toBeInTheDocument();
    expect(screen.getByText(/benchmark and attribution unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/performance analytics remain deferred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Top Quartile/i)).not.toBeInTheDocument();
  });

  it('renders a backed metrics loading state', () => {
    mockUseFundMetrics.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<ModernDashboard />);

    expect(screen.getByText(/loading dashboard metrics/i)).toBeInTheDocument();
  });

  it('renders a backed metrics error state', () => {
    mockUseFundMetrics.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Metrics unavailable'),
    });

    render(<ModernDashboard />);

    expect(screen.getByText(/dashboard metrics are temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/metrics unavailable/i)).toBeInTheDocument();
  });

  it('keeps the cashflow tab live', async () => {
    const user = userEvent.setup();
    render(<ModernDashboard />);

    await user.click(screen.getByRole('tab', { name: /cashflow/i }));

    expect(screen.getByText('Cashflow Dashboard 42')).toBeInTheDocument();
  });
});
