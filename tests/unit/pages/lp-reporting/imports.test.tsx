/**
 * LP Reporting -- Imports page integration test.
 *
 * Asserts:
 *   - Page renders with header, both tabs visible, default tab "Ledger import".
 *   - Switching tabs reveals the valuation-marks uploader.
 *   - Commit is hidden before dry-run and visible after a valid preview.
 *   - Ledger upload routes to /imports/ledger/dry-run.
 *   - Valuation-marks upload routes to /imports/valuation-marks/dry-run.
 *   - 401 on the ledger uploader renders the error envelope.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import LpReportingImportsPage from '@/pages/lp-reporting/imports';
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
      <LpReportingImportsPage />
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

function makeCsvFile(name = 'sample.csv'): File {
  const content =
    'event_type,amount,currency,event_date,perspective,description\n' +
    'lp_capital_call,1000000.000000,USD,2026-03-31,fund_gross,Q1\n';
  return new File([content], name, { type: 'text/csv' });
}

describe('LpReportingImportsPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header and both tab triggers, defaulting to Ledger import', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /^imports$/i })).toBeInTheDocument();
    expect(screen.getByTestId('imports-tab-trigger-ledger')).toBeInTheDocument();
    expect(screen.getByTestId('imports-tab-trigger-valuation-marks')).toBeInTheDocument();

    // Default tab is ledger -- the ledger uploader is visible.
    expect(screen.getByTestId('csv-uploader-ledger')).toBeInTheDocument();
  });

  it('hides Commit until a dry-run preview is available', () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /commit/i })).toBeNull();
  });

  it('switches to the Valuation marks tab and reveals the marks uploader', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByTestId('imports-tab-trigger-valuation-marks'));

    await waitFor(() => {
      expect(screen.getByTestId('csv-uploader-valuation-marks')).toBeInTheDocument();
    });
  });

  it('routes a ledger CSV upload to /imports/ledger/dry-run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSuccessResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    const input = screen.getByTestId('csv-uploader-input-ledger') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile()] } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/funds/7/imports/ledger/dry-run');
    // The matched bucket should now show the success row.
    await waitFor(() => {
      expect(screen.getByTestId('import-preview-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('imports-ledger-commit-button')).toBeEnabled();
  });

  it('routes a valuation-marks CSV upload to /imports/valuation-marks/dry-run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSuccessResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByTestId('imports-tab-trigger-valuation-marks'));

    await waitFor(() => {
      expect(screen.getByTestId('csv-uploader-input-valuation-marks')).toBeInTheDocument();
    });

    const input = screen.getByTestId('csv-uploader-input-valuation-marks') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile('marks.csv')] } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    expect(fetchSpy.mock.calls[0]![0]).toBe('/api/funds/7/imports/valuation-marks/dry-run');
  });

  it('renders the 401 envelope on the ledger uploader when unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    const input = screen.getByTestId('csv-uploader-input-ledger') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeCsvFile()] } });

    await waitFor(() => {
      expect(screen.getByTestId('imports-ledger-error-envelope')).toBeInTheDocument();
    });

    const envelope = screen.getByTestId('imports-ledger-error-envelope');
    expect(envelope).toHaveAttribute('data-error-status', '401');
    expect(envelope.textContent).toMatch(/sign-in required/i);
  });

  it('renders the "select a fund" notice when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByTestId('csv-uploader-button-ledger')).toBeDisabled();
  });
});
