/**
 * LP Reporting -- Valuations page integration test.
 *
 * Asserts:
 *   - Page renders header + form + empty preview by default.
 *   - On successful dry-run the preview table populates.
 *   - A future-dated mark in the preview is visually distinguished.
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

import LpReportingValuationsPage from '@/pages/lp-reporting/valuations';
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
      <LpReportingValuationsPage />
    </QueryClientProvider>
  );
}

function makeSuccessResponse(): ImportDryRunResponse {
  // The "future" mark uses a date well past any plausible page as-of
  // date so the affordance assertion stays stable across calendar days.
  return {
    importId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    sourceType: 'csv',
    parsedRows: 2,
    validRows: 2,
    invalidRows: 0,
    duplicateRows: 0,
    warnings: [],
    errors: [],
    reconciliation: {
      calledCapitalImported: '0.000000',
      distributionsImported: '0.000000',
      latestNavImported: '1000000.000000',
      explanations: [],
    },
    preview: [
      {
        rowIndex: 1,
        markSource: 'gp_estimate',
        companyId: 42,
        fairValue: '1000000.000000',
        asOfDate: '2026-03-31',
        confidenceLevel: 'low',
        duplicate: false,
        excluded: false,
      },
      {
        rowIndex: 2,
        markSource: 'board_update',
        companyId: 43,
        fairValue: '2500000.000000',
        // Far future -- guaranteed > today's UTC date for the assertion.
        asOfDate: '2099-12-31',
        confidenceLevel: 'high',
        duplicate: false,
        excluded: false,
      },
    ],
  };
}

function fillMinimumFields() {
  fireEvent.change(screen.getByLabelText(/^mark date/i), {
    target: { value: '2026-03-31' },
  });
  fireEvent.change(screen.getByLabelText(/^as-of date/i), {
    target: { value: '2026-03-31' },
  });
  fireEvent.change(screen.getByLabelText(/^company id/i), {
    target: { value: '42' },
  });
  fireEvent.change(screen.getByLabelText(/^nav/i), {
    target: { value: '1000000.000000' },
  });
}

describe('LpReportingValuationsPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header, form, and empty preview state by default', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /^valuations$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^mark date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^nav/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confidence/i)).toBeInTheDocument();
    expect(screen.getByTestId('valuation-marks-table-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('valuations-error-envelope')).toBeNull();
  });

  it('populates the preview table after a successful dry-run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSuccessResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(screen.getByTestId('valuation-marks-table')).toBeInTheDocument();
    });
    expect(screen.getByText('$1,000,000.00')).toBeInTheDocument();
    expect(screen.getByText('$2,500,000.00')).toBeInTheDocument();
    expect(screen.queryByTestId('valuations-error-envelope')).toBeNull();
  });

  it('flags the future-dated mark in the preview rows', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeSuccessResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { container } = renderPage();

    fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(screen.getByTestId('valuation-marks-table')).toBeInTheDocument();
    });

    // Exactly one of the two preview rows is future-dated.
    expect(screen.getAllByTestId('future-dated-badge')).toHaveLength(1);
    const flagged = container.querySelectorAll('[data-future-dated="true"]');
    expect(flagged).toHaveLength(1);
    expect(flagged[0]?.getAttribute('aria-label')).toMatch(/excluded from current nav/i);

    // The high-confidence badge corresponds to the future-dated row.
    expect(screen.getByTestId('confidence-badge-high')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-badge-low')).toBeInTheDocument();
  });

  it('renders the 401 error envelope when the dry-run is unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fillMinimumFields();
    fireEvent.click(screen.getByRole('button', { name: /preview mark/i }));

    await waitFor(() => {
      expect(screen.getByTestId('valuations-error-envelope')).toBeInTheDocument();
    });
    const envelope = screen.getByTestId('valuations-error-envelope');
    expect(envelope).toHaveAttribute('data-error-status', '401');
    expect(envelope.textContent).toMatch(/sign-in required/i);
  });

  it('shows a "select a fund" notice and disables submit when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /preview mark/i })).toBeDisabled();
  });
});
