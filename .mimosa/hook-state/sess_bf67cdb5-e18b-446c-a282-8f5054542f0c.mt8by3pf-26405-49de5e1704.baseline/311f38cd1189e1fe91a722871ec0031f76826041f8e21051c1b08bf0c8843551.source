/**
 * LP Reporting -- Ledger page integration test.
 *
 * Asserts:
 *   - Page renders header + form + empty preview by default.
 *   - On successful dry-run the preview table populates.
 *   - On 401 the error envelope renders above the form.
 *   - When fundId is null, a notice is shown and the submit is disabled.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const fundContextMock = vi.hoisted(() => ({
  fundId: 7 as number | null,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: fundContextMock.fundId,
    currentFund: null,
    setCurrentFund: () => {},
    isLoading: false,
    needsSetup: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
    isDemoMode: false,
  }),
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LpReportingLedgerPage from '@/pages/lp-reporting/ledger';
import type { ImportDryRunResponse } from '@shared/contracts/lp-reporting';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LpReportingLedgerPage />
    </QueryClientProvider>
  );
}

function makeSuccessResponse(): ImportDryRunResponse {
  return {
    importId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceType: 'csv',
    previewHash: 'a'.repeat(64),
    parsedRows: 1,
    validRows: 1,
    invalidRows: 0,
    duplicateRows: 0,
    warnings: [],
    errors: [],
    reconciliation: {
      calledCapitalImported: '1000000.000000',
      distributionsImported: '0.000000',
      latestNavImported: '0.000000',
      explanations: [],
    },
    preview: [
      {
        rowIndex: 1,
        eventType: 'lp_capital_call',
        amount: '1000000.000000',
        eventDate: '2026-03-31',
        duplicate: false,
        excluded: false,
      },
    ],
  };
}

describe('LpReportingLedgerPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header, form, and empty preview state by default', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /^ledger$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/event date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByTestId('ledger-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('ledger-error-envelope')).toBeNull();
  });

  it('populates the preview table after a successful dry-run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSuccessResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), {
      target: { value: '1000000.000000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ledger-table')).toBeInTheDocument();
    });
    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
    expect(screen.getByText('lp_capital_call')).toBeInTheDocument();
    expect(screen.queryByTestId('ledger-error-envelope')).toBeNull();
  });

  it('renders the 401 error envelope when the dry-run is unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ledger-error-envelope')).toBeInTheDocument();
    });
    const envelope = screen.getByTestId('ledger-error-envelope');
    expect(envelope).toHaveAttribute('data-error-status', '401');
    expect(envelope.textContent).toMatch(/sign-in required/i);
  });

  it('renders the 429 envelope when rate-limited', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'TOO_MANY_REQUESTS', message: 'slow down' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.change(screen.getByLabelText(/event date/i), { target: { value: '2026-03-31' } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: /preview event/i }));

    await waitFor(() => {
      expect(screen.getByTestId('ledger-error-envelope')).toBeInTheDocument();
    });
    expect(screen.getByTestId('ledger-error-envelope')).toHaveAttribute('data-error-status', '429');
    expect(screen.getByTestId('ledger-error-envelope').textContent).toMatch(/rate limit/i);
  });

  it('shows a "select a fund" notice and disables submit when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview event/i })).toBeDisabled();
  });
});
