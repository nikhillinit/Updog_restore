/**
 * Tests for ReviewStep finalize failure + retry behavior.
 *
 * Validates:
 * - Finalize POST returns non-2xx -> stays on ReviewStep with error, no navigation
 * - Retry replays the single finalize request and succeeds
 * - ReviewStep reuses the bootstrap draft fund identity when present
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=7', mockSetLocation],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));

const mockSetCurrentFund = vi.fn();
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    setCurrentFund: mockSetCurrentFund,
  }),
}));

const mockFundState = {
  fundName: 'Test Fund',
  fundSize: 50_000_000,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  vintageYear: 2026,
  fundLife: 10,
  establishmentDate: '2026-01-15',
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
  waterfallType: 'american' as const,
  recyclingEnabled: false,
  isEvergreen: false,
  investmentPeriod: 5,
  gpCommitment: 2_500_000,
  lpClasses: [],
  lps: [],
  sectorProfiles: [],
  allocations: [],
  followOnChecks: { A: 1, B: 2, C: 3 },
  capitalStageAllocations: [],
  capitalPlanAllocations: [],
  pipelineProfiles: [],
  waterfallTiers: [],
  recyclingType: undefined,
  recyclingCap: undefined,
  recyclingPeriod: undefined,
  exitRecyclingRate: undefined,
  mgmtFeeRecyclingRate: undefined,
  allowFutureRecycling: undefined,
  feeProfiles: [],
  fundExpenses: [],
  hydrated: true,
  setHydrated: vi.fn(),
  draftFundId: null as number | null,
  setDraftFundId: vi.fn(),
  draftServerReady: false,
  setDraftServerReady: vi.fn(),
};

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (s: typeof mockFundState) => unknown) => selector(mockFundState),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

const mockFetch = vi.fn();

describe('ReviewStep finalize handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockSetLocation.mockReset();
    mockSetCurrentFund.mockReset();
    mockFundState.draftFundId = null;
    mockFundState.draftServerReady = false;
    mockFundState.setDraftFundId.mockReset();
    mockFundState.setDraftServerReady.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an error when finalize returns validation failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: 'Finalize request is invalid',
          code: 'FUND_FINALIZE_VALIDATION_ERROR',
          issues: [{ path: ['draft', 'fundName'], message: 'Required' }],
        }),
    });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText(/Finalize request is invalid/i)).toBeInTheDocument();
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('navigates to the concrete results route after successful finalization', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            fundId: 42,
            publishedConfigId: 100,
            publishedVersion: 1,
            runId: 10,
            correlationId: 'test-correlation-id',
            dispatchState: 'dispatched',
          },
        }),
    });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/funds/finalize',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockSetCurrentFund).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        name: 'Test Fund',
      })
    );
    expect(mockFundState.setDraftFundId).toHaveBeenCalledWith(42);
    expect(mockFundState.setDraftServerReady).toHaveBeenCalledWith(true);
  });

  it('retries finalization with the same single request path after an error', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Finalize queue error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              fundId: 42,
              publishedConfigId: 100,
              publishedVersion: 1,
              runId: 10,
              correlationId: 'test-correlation-id',
              dispatchState: 'dispatched',
            },
          }),
      });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText(/Finalize queue error/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of mockFetch.mock.calls) {
      expect(url).toBe('/api/funds/finalize');
      expect((init as RequestInit).method).toBe('POST');
    }
  });

  it('reuses the bootstrap fund identity in the finalize request body', async () => {
    mockFundState.draftFundId = 84;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            fundId: 84,
            publishedConfigId: 101,
            publishedVersion: 2,
            runId: 11,
            correlationId: 'test-correlation-id',
            dispatchState: 'dispatched',
          },
        }),
    });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/84');
    });

    const [, requestInit] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body)) as { fundId?: number };
    expect(body.fundId).toBe(84);
  });
});
