import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverviewTab } from '../../../../client/src/components/portfolio/tabs/OverviewTab';
import { TestQueryClientProvider } from '../../../utils/test-query-client';

const mockSetLocation = vi.fn();
const mockUsePortfolioOverview = vi.fn();
const mockApiRequest = vi.fn();
const mockToast = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-fund-data', () => ({
  usePortfolioOverview: (...args: unknown[]) => mockUsePortfolioOverview(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/portfolio?tab=companies', mockSetLocation],
  useSearch: () => 'tab=companies&asOf=2025-03',
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

type ServerCompany = {
  id: number;
  name: string;
  sector: string;
  stage: string;
  status: string;
  invested: string;
  currentValue: string;
  moic: string;
};

const liveMeta = {
  mode: 'live' as const,
  requestedAsOf: null,
  resolvedAsOf: null,
  source: 'live' as const,
  historicalAvailable: false,
};

function makeOverview(
  companies: ServerCompany[],
  meta: Record<string, unknown> = liveMeta,
  metricsOverrides: Record<string, unknown> = {}
) {
  const data = {
    fundId: 1,
    generatedAt: '2026-06-24T00:00:00.000Z',
    currency: 'USD',
    provenance: { isFinanciallyActionable: true },
    sourceRecordCounts: { companies: companies.length },
    metrics: {
      totalInvested: '5000000',
      totalValue: '12500000',
      averageMOIC: '2.5',
      returnPct: '150',
      totalCompanies: companies.length,
      activeCompanies: companies.length,
      exitedCompanies: 0,
      ...metricsOverrides,
    },
    companies,
    meta,
  };

  return {
    data,
    meta,
    isLoading: false,
    isUnavailable: false,
    isHistoricalEmpty: meta['mode'] === 'historical' && !meta['historicalAvailable'],
  };
}

const techCorp: ServerCompany = {
  id: 1,
  name: 'TechCorp',
  sector: 'Fintech',
  stage: 'Series B',
  status: 'Growing',
  invested: '5000000',
  currentValue: '12500000',
  moic: '2.5',
};

function renderOverviewTab() {
  return render(
    <TestQueryClientProvider>
      <OverviewTab />
    </TestQueryClientProvider>
  );
}

describe('OverviewTab', () => {
  beforeAll(() => {
    if (!Element.prototype.hasPointerCapture) {
      Object.defineProperty(Element.prototype, 'hasPointerCapture', {
        value: () => false,
        configurable: true,
      });
    }
    if (!Element.prototype.setPointerCapture) {
      Object.defineProperty(Element.prototype, 'setPointerCapture', {
        value: () => undefined,
        configurable: true,
      });
    }
    if (!Element.prototype.releasePointerCapture) {
      Object.defineProperty(Element.prototype, 'releasePointerCapture', {
        value: () => undefined,
        configurable: true,
      });
    }
    if (!Element.prototype.scrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: () => undefined,
        configurable: true,
      });
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders live companies and server-computed KPIs from the overview hook', () => {
    mockUsePortfolioOverview.mockReturnValue(makeOverview([techCorp]));

    renderOverviewTab();

    expect(screen.getAllByText('TechCorp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Current Value').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Average MOIC').length).toBeGreaterThan(0);
    const detailButtons = screen.getAllByRole('button', { name: /view techcorp details/i });
    expect(detailButtons.length).toBeGreaterThan(0);
    for (const button of detailButtons) {
      expect(button).not.toBeDisabled();
    }
  });

  it('renders the server-provided MOIC verbatim and performs no client-side division', () => {
    // currentValue/invested would be 2.5x, but the server reports 9.99x. The UI
    // must display the server value, proving it does not recompute MOIC.
    mockUsePortfolioOverview.mockReturnValue(
      makeOverview([{ ...techCorp, moic: '9.99' }], liveMeta, { averageMOIC: '9.99' })
    );

    renderOverviewTab();

    expect(screen.getAllByText('9.99x').length).toBeGreaterThan(0);
    expect(screen.queryByText('2.50x')).toBeNull();
  });

  it('fails closed when the trusted overview is unavailable', () => {
    mockUsePortfolioOverview.mockReturnValue({
      data: null,
      meta: liveMeta,
      isLoading: false,
      isUnavailable: true,
      isHistoricalEmpty: false,
    });

    renderOverviewTab();

    expect(screen.getByText('Portfolio metrics unavailable')).toBeTruthy();
    // No KPI values or company rows are rendered in the fail-closed state.
    expect(screen.queryByText('TechCorp')).toBeNull();
    expect(screen.queryByText('Average MOIC')).toBeNull();
  });

  it('navigates to the mounted company summary route from live detail controls', () => {
    mockUsePortfolioOverview.mockReturnValue(makeOverview([techCorp]));

    renderOverviewTab();

    fireEvent.click(screen.getAllByRole('button', { name: /view techcorp details/i })[0]!);

    expect(mockSetLocation).toHaveBeenCalledWith('/portfolio/company/1');
  });

  it('shows historical-mode notice and resets URL state back to today', () => {
    mockUsePortfolioOverview.mockReturnValue(
      makeOverview([{ ...techCorp, currentValue: '9800000', moic: '1.96' }], {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03-31T23:59:59.999Z',
        source: 'snapshot',
        historicalAvailable: true,
      })
    );

    renderOverviewTab();

    expect(screen.getByText('Historical mode')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /reset to today/i })[0]!);

    expect(mockSetLocation).toHaveBeenCalledWith('/portfolio?tab=companies', { replace: true });
  });

  it('renders deterministic no-snapshot historical empty state', () => {
    mockUsePortfolioOverview.mockReturnValue(
      makeOverview([], {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03',
        source: 'snapshot',
        historicalAvailable: false,
        emptyReason: 'no_snapshot',
      })
    );

    renderOverviewTab();

    expect(screen.getByText('No Historical Snapshot')).toBeTruthy();
    expect(screen.getByText(/there is no historical portfolio snapshot available/i)).toBeTruthy();
  });

  it('submits a live add-company request with canonical taxonomy and normalized money input', async () => {
    const user = userEvent.setup();
    mockApiRequest.mockResolvedValue({
      id: 99,
      fundId: 1,
      name: 'Northwind AI',
      sector: 'AI / ML',
      stage: 'Seed',
    });
    mockUsePortfolioOverview.mockReturnValue(makeOverview([], liveMeta, { totalCompanies: 0 }));

    renderOverviewTab();

    fireEvent.click(screen.getByRole('button', { name: /^add company$/i }));
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: 'Northwind AI' },
    });
    await user.click(screen.getByLabelText(/sector/i));
    await user.click(screen.getByRole('option', { name: 'AI / ML' }));
    fireEvent.change(screen.getByLabelText(/initial investment/i), {
      target: { value: '1,500,000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/portfolio-companies', {
        fundId: 1,
        name: 'Northwind AI',
        sector: 'AI / ML',
        stage: 'Seed',
        currentStage: 'Seed',
        investmentAmount: '1500000',
      })
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Company added',
      })
    );
  });

  it('keeps company creation disabled in historical mode', () => {
    mockUsePortfolioOverview.mockReturnValue(
      makeOverview([{ ...techCorp, currentValue: '9800000', moic: '1.96' }], {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03-31T23:59:59.999Z',
        source: 'snapshot',
        historicalAvailable: true,
      })
    );

    renderOverviewTab();

    expect(screen.getByRole('button', { name: /^add company$/i })).toBeDisabled();
    const unavailableDetails = screen.getAllByRole('button', {
      name: /details unavailable while viewing historical data/i,
    });
    for (const button of unavailableDetails) {
      expect(button).toBeDisabled();
    }
  });
});
