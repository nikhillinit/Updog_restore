import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AllocationsTab } from '@/components/portfolio/tabs/AllocationsTab';

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function installEmptyAllocationResponse() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = url.includes('/allocation-scenarios')
      ? { scenarios: [] }
      : {
          companies: [],
          metadata: {
            total_planned_cents: 0,
            total_deployed_cents: 0,
            companies_count: 0,
            last_updated_at: null,
          },
        };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function installErroredAllocationResponse() {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(
      JSON.stringify({
        message: 'Database operation failed: relation "reserve_allocations" does not exist',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  });
}

describe('AllocationsTab empty state', () => {
  beforeEach(() => {
    installEmptyAllocationResponse();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a direct add-company action when reserve planning has no companies', async () => {
    renderWithQuery(<AllocationsTab />);

    expect(await screen.findByTestId('reserve-planning-empty-state')).toHaveTextContent(
      /no portfolio companies found/i
    );
    expect(screen.getByRole('button', { name: /^add company$/i })).toBeEnabled();
  });

  it('opens the portfolio company dialog from the reserve planning empty state', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(await screen.findByTestId('reserve-planning-add-company-button'));

    expect(screen.getByTestId('portfolio-add-company-dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /add portfolio company/i })).toBeInTheDocument();
  });

  it('shows safe copy when reserve allocation loading fails', async () => {
    vi.restoreAllMocks();
    installErroredAllocationResponse();

    renderWithQuery(<AllocationsTab />);

    expect(await screen.findByText(/could not load reserve allocations/i)).toBeInTheDocument();
    expect(screen.queryByText(/relation "reserve_allocations"/i)).not.toBeInTheDocument();
  });
});
