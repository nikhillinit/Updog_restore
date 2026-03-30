/**
 * Tests for ReviewStep single-submit refactor via finalize endpoint
 *
 * Validates:
 * - Renders review step with fund data summary
 * - Submit button calls finalizeFund with correct payload shape
 * - Shows loading state during submission
 * - Navigates to results page on success
 * - Shows error message on failure
 * - Button is disabled during submission
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
  fundName: 'Finalize Test Fund',
  fundSize: 75_000_000,
  managementFeeRate: 2.5,
  carriedInterest: 20.0,
  vintageYear: 2026,
  fundLife: 10,
  establishmentDate: '2026-03-01',
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
  waterfallType: 'american' as const,
  recyclingEnabled: false,
  isEvergreen: false,
  investmentPeriod: 5,
  gpCommitment: 3_750_000,
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

// Mock finalizeFund -- use a mutable reference so tests can override
const mockFinalizeFund = vi.fn();

vi.mock('@/services/funds', () => ({
  finalizeFund: (...args: unknown[]) => mockFinalizeFund(...args),
  // Keep legacy exports so the module resolves cleanly
  createFund: vi.fn(),
  normalizeCreateFundResponse: vi.fn(),
}));

// Mock adapters -- only fundStoreToFinalizeV1 is used in the refactored component
const mockFundStoreToFinalizeV1 = vi.fn();

vi.mock('@/adapters/fund-store-adapters', () => ({
  fundStoreToFinalizeV1: (...args: unknown[]) => mockFundStoreToFinalizeV1(...args),
  // Keep legacy exports
  fundStoreToCreateV1: vi.fn(),
  fundStoreToDraftWriteV1: vi.fn(),
}));

// Mock formatting
vi.mock('@/lib/formatting', () => ({
  formatUSD: (v: number) => `$${v.toLocaleString()}`,
}));

describe('ReviewStep single-submit via finalize', () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    mockSetCurrentFund.mockReset();
    mockFundState.draftFundId = null;

    // Default: finalizeFund succeeds
    mockFinalizeFund.mockReset().mockResolvedValue({
      success: true,
      data: {
        fundId: 99,
        configVersion: 1,
        correlationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        published: true,
      },
    });

    // Default: adapter returns a valid payload
    mockFundStoreToFinalizeV1.mockReset().mockReturnValue({
      name: 'Finalize Test Fund',
      size: 75_000_000,
      managementFee: 0.025,
      carryPercentage: 0.2,
      vintageYear: 2026,
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      waterfallType: 'american',
      recyclingEnabled: false,
      followOnChecks: { A: 1, B: 2, C: 3 },
      establishmentDate: '2026-03-01',
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 3_750_000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the review step with fund data summary', async () => {
    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    expect(screen.getByTestId('review-step')).toBeInTheDocument();
    expect(screen.getByText('Fund Basics')).toBeInTheDocument();
    expect(screen.getByText('Economics')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Finalize Test Fund')).toBeInTheDocument();
  });

  it('calls finalizeFund with correct payload on submit', async () => {
    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockFundStoreToFinalizeV1).toHaveBeenCalledTimes(1);
      expect(mockFundStoreToFinalizeV1).toHaveBeenCalledWith(mockFundState);
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockFinalizeFund).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Finalize Test Fund',
        size: 75_000_000,
        managementFee: 0.025,
        carryPercentage: 0.2,
        vintageYear: 2026,
      })
    );
  });

  it('shows loading text during submission', async () => {
    // Make finalizeFund hang so we can observe loading state
    let resolveFinalize!: (v: unknown) => void;
    mockFinalizeFund.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveFinalize = resolve;
      })
    );

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // Should show loading text
    await waitFor(() => {
      expect(screen.getByText(/Creating Fund/i)).toBeInTheDocument();
    });

    // Resolve to prevent hanging
    resolveFinalize({
      success: true,
      data: { fundId: 99, configVersion: 1, correlationId: 'test', published: true },
    });
  });

  it('navigates to results page on success', async () => {
    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/99');
    });

    expect(mockSetCurrentFund).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 99,
        name: 'Finalize Test Fund',
      })
    );
  });

  it('shows error message on failure', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new Error('Validation failed: fund name'));

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText('Fund Creation Failed')).toBeInTheDocument();
      expect(screen.getByText(/Validation failed: fund name/)).toBeInTheDocument();
    });

    // Should NOT navigate
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('disables button during submission', async () => {
    let resolveFinalize!: (v: unknown) => void;
    mockFinalizeFund.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveFinalize = resolve;
      })
    );

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Resolve to prevent hanging
    resolveFinalize({
      success: true,
      data: { fundId: 99, configVersion: 1, correlationId: 'test', published: true },
    });
  });

  it('shows Retry text after error and allows resubmission', async () => {
    mockFinalizeFund.mockRejectedValueOnce(new Error('Server error')).mockResolvedValueOnce({
      success: true,
      data: { fundId: 99, configVersion: 1, correlationId: 'test', published: true },
    });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText('Fund Creation Failed')).toBeInTheDocument();
    });

    // Button should show Retry
    expect(screen.getByText('Retry')).toBeInTheDocument();

    // Click retry
    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/99');
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });
});
