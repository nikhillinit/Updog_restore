/**
 * Tests for ReviewStep finalize failure + retry logic
 *
 * Validates:
 * - Finalize returns non-2xx -> stays on ReviewStep with error, no navigation
 * - Retry after failure -> calls finalizeFund again, navigates on success
 * - Non-Error thrown -> uses fallback message
 *
 * History: Originally tested the 3-step create/draft/publish flow.
 * Refactored to test the single-submit finalize endpoint (Phase 3).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock dependencies before importing component
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

// Mock finalizeFund
const mockFinalizeFund = vi.fn();

vi.mock('@/services/funds', () => ({
  finalizeFund: (...args: unknown[]) => mockFinalizeFund(...args),
  createFund: vi.fn(),
  normalizeCreateFundResponse: vi.fn(),
}));

// Mock adapter
vi.mock('@/adapters/fund-store-adapters', () => ({
  fundStoreToFinalizeV1: () => ({
    name: 'Test Fund',
    size: 50_000_000,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2026,
  }),
  fundStoreToCreateV1: vi.fn(),
  fundStoreToDraftWriteV1: vi.fn(),
}));

const successResponse = {
  success: true as const,
  data: {
    fundId: 42,
    configVersion: 1,
    correlationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    published: true,
  },
};

describe('ReviewStep finalize failure handling', () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    mockSetCurrentFund.mockReset();
    mockFundState.draftFundId = null;
    mockFinalizeFund.mockReset().mockResolvedValue(successResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows error when finalize returns validation error', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new Error('Draft configuration is invalid'));

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Draft configuration is invalid/i)).toBeInTheDocument();
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('shows error when finalize returns server error, no navigation', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new Error('Finalize failed (HTTP 500)'));

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText('Fund Creation Failed')).toBeInTheDocument();
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('navigates to results route after successful finalize', async () => {
    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentFund).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        name: 'Test Fund',
      })
    );
  });

  it('retries finalize after failure and navigates on success', async () => {
    mockFinalizeFund
      .mockRejectedValueOnce(new Error('Finalize failed (HTTP 500)'))
      .mockResolvedValueOnce(successResponse);

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // First attempt: fails
    await waitFor(() => {
      expect(screen.getByText('Fund Creation Failed')).toBeInTheDocument();
    });

    // Retry
    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });

  it('shows error when publish queue fails via finalize', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new Error('Publish queue error'));

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Publish queue error/i)).toBeInTheDocument();
    });

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('retries after publish failure and navigates on success', async () => {
    mockFinalizeFund
      .mockRejectedValueOnce(new Error('Publish queue error'))
      .mockResolvedValueOnce(successResponse);

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Publish queue error/i)).toBeInTheDocument();
    });

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });

  it('uses fallback message for non-Error thrown values', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue('raw string error');

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText('Failed to create fund')).toBeInTheDocument();
    });
  });
});
