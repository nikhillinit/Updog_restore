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
import * as economicsEngine from '@shared/lib/economics/economics-engine';

const { mockInvalidateQueries, mockUseFlag } = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockUseFlag: vi.fn(),
}));

// Mock dependencies before importing component
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=7', mockSetLocation],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

const mockSetCurrentFund = vi.fn();
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    setCurrentFund: mockSetCurrentFund,
  }),
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: (...args: unknown[]) => mockUseFlag(...args),
}));

const mockFundState = {
  fundName: 'Finalize Test Fund',
  fundSize: 75_000_000,
  managementFeeRate: 2.5,
  carriedInterest: 20.0,
  vintageYear: 2026,
  fundLife: 10,
  establishmentDate: '2026-03-01',
  modelInputsAsOfDate: '2026-06-30' as string | undefined,
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
  useFundTuple: (selector: (s: typeof mockFundState) => unknown) => selector(mockFundState),
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

// Mock adapters used by submit and economics dry-run paths
const mockFundStoreToFinalizeV1 = vi.fn();
const mockFundStoreToDraftWriteV1 = vi.fn();

vi.mock('@/adapters/fund-store-adapters', () => ({
  fundStoreToFinalizeV1: (...args: unknown[]) => mockFundStoreToFinalizeV1(...args),
  fundStoreToDraftWriteV1: (...args: unknown[]) => mockFundStoreToDraftWriteV1(...args),
  // Keep legacy exports
  fundStoreToCreateV1: vi.fn(),
}));

// Mock formatting
vi.mock('@/lib/formatting', () => ({
  formatUSD: (v: number) => `$${v.toLocaleString()}`,
}));

import ReviewStep from '@/pages/ReviewStep';

describe('ReviewStep single-submit via finalize', () => {
  beforeEach(() => {
    mockSetLocation.mockReset();
    mockSetCurrentFund.mockReset();
    mockInvalidateQueries.mockReset().mockResolvedValue(undefined);
    mockUseFlag.mockReset().mockReturnValue(true);
    mockFundState.draftFundId = 77;
    mockFundState.draftServerReady = true;
    mockFundState.modelInputsAsOfDate = '2026-06-30';

    // Default: finalizeFund succeeds
    mockFinalizeFund.mockReset().mockResolvedValue({
      success: true,
      data: {
        fundId: 77,
        configVersion: 1,
        correlationId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        published: true,
      },
    });

    // Default: adapter returns a valid payload
    mockFundStoreToFinalizeV1.mockReset().mockReturnValue({
      name: 'Finalize Test Fund',
      draftFundId: 77,
      size: 75_000_000,
      managementFee: 0.025,
      carryPercentage: 0.2,
      vintageYear: 2026,
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      waterfallType: 'american',
      recyclingEnabled: false,
      followOnChecks: { A: 1, B: 2, C: 3 },
      establishmentDate: '2026-03-01',
      modelInputsAsOfDate: '2026-06-30',
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 3_750_000,
    });
    mockFundStoreToDraftWriteV1.mockReset().mockReturnValue({
      fundName: 'Finalize Test Fund',
      fundSize: 75_000_000,
      managementFeeRate: 2.5,
      carriedInterest: 20,
      vintageYear: 2026,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 3_750_000,
      economicsAssumptions: { version: 'v1' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the review step with fund data summary', () => {
    mockUseFlag.mockReturnValue(false);

    render(<ReviewStep />);

    expect(screen.getByTestId('review-step')).toBeInTheDocument();
    expect(screen.getByText('Fund Basics')).toBeInTheDocument();
    expect(screen.getByText('Economics')).toBeInTheDocument();
    expect(screen.getByText('Strategy')).toBeInTheDocument();
    expect(screen.getByText('Finalize Test Fund')).toBeInTheDocument();
  });

  it('renders the owner date and blocks publication when it is absent', () => {
    mockFundState.modelInputsAsOfDate = undefined;

    render(<ReviewStep />);

    expect(screen.getByText('Model Inputs As-Of')).toBeInTheDocument();
    expect(screen.getByText('Required before publish')).toBeInTheDocument();
    expect(screen.getByTestId('create-fund-button')).toBeDisabled();
  });

  it('calls finalizeFund with correct payload on submit', async () => {
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockFundStoreToFinalizeV1).toHaveBeenCalledTimes(1);
      expect(mockFundStoreToFinalizeV1).toHaveBeenCalledWith(mockFundState, {
        includeEconomicsAssumptions: true,
      });
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockFinalizeFund).toHaveBeenCalledWith(
      expect.objectContaining({
        draftFundId: 77,
        name: 'Finalize Test Fund',
        size: 75_000_000,
        managementFee: 0.025,
        carryPercentage: 0.2,
        vintageYear: 2026,
      })
    );
  });

  it('blocks submit when the economics dry-run fails validation', async () => {
    mockFundStoreToDraftWriteV1.mockReturnValue({
      fundName: 'Finalize Test Fund',
      fundSize: 75_000_000,
      managementFeeRate: 2.5,
      carriedInterest: 20,
      vintageYear: 2026,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 3_750_000,
      feeProfiles: [
        {
          id: 'legacy-profile',
          name: 'Legacy profile',
          feeTiers: [
            {
              id: 'legacy-tier',
              name: 'Period called fee',
              percentage: 2,
              feeBasis: 'called_capital_period',
              startMonth: 1,
            },
          ],
        },
      ],
      economicsAssumptions: {
        version: 'v1',
        feeModel: { source: 'legacy_fee_profiles' },
      },
    });

    render(<ReviewStep />);

    expect(screen.getByText('Economics validation failed')).toBeInTheDocument();
    expect(screen.getByTestId('economics-blocking-alert')).toHaveTextContent(
      'Review the listed economics inputs before publishing the fund.'
    );
    expect(
      screen.getByRole('button', { name: 'Review distributions, fees, and recycling settings' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('create-fund-button')).toBeDisabled();
    expect(
      screen.getByText('Resolve the economics dry-run error before publishing.')
    ).toBeInTheDocument();
    expect(mockFinalizeFund).not.toHaveBeenCalled();
  });

  it('links economics invariant failures to cashflow settings', async () => {
    vi.spyOn(economicsEngine, 'runEconomicsModel').mockImplementation(() => {
      throw new economicsEngine.EconomicsInvariantError({
        passed: false,
        tolerance: 0.01,
        errors: [
          {
            year: 3,
            code: 'PERIOD_CASH_RECONCILIATION_FAILED',
            message: 'Period cash sources and uses do not reconcile.',
            delta: 125,
          },
        ],
      });
    });

    render(<ReviewStep />);

    expect(screen.getByText('Economics invariant failed')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Review cashflow and liquidity settings' })
    );

    expect(mockSetLocation).toHaveBeenCalledWith('/fund-setup?step=6');
  });

  it('skips economics dry-run blocking when the economics flag is disabled', async () => {
    mockUseFlag.mockReturnValue(false);
    mockFundStoreToDraftWriteV1.mockReturnValue({
      fundName: 'Finalize Test Fund',
      fundSize: 75_000_000,
      feeProfiles: [
        {
          id: 'legacy-profile',
          name: 'Legacy profile',
          feeTiers: [
            {
              id: 'legacy-tier',
              name: 'Period called fee',
              percentage: 2,
              feeBasis: 'called_capital_period',
              startMonth: 1,
            },
          ],
        },
      ],
      economicsAssumptions: {
        version: 'v1',
        feeModel: { source: 'legacy_fee_profiles' },
      },
    });

    render(<ReviewStep />);

    expect(screen.queryByTestId('economics-dry-run-card')).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    });

    expect(mockFundStoreToFinalizeV1).toHaveBeenCalledWith(mockFundState, {
      includeEconomicsAssumptions: false,
    });
  });

  it('shows loading text during submission', async () => {
    // Make finalizeFund hang so we can observe loading state
    let resolveFinalize!: (v: unknown) => void;
    mockFinalizeFund.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveFinalize = resolve;
      })
    );

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // Should show loading text
    await waitFor(() => {
      expect(
        screen.getByText(/Creating, Publishing, and Starting Calculations/i)
      ).toBeInTheDocument();
    });

    // Resolve to prevent hanging
    resolveFinalize({
      success: true,
      data: { fundId: 77, configVersion: 1, correlationId: 'test', published: true },
    });
  });

  it('navigates to results page on success', async () => {
    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/77');
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['/api/funds'] });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['funds'] });
    expect(mockSetCurrentFund).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        name: 'Finalize Test Fund',
      })
    );
  });

  it('shows error message on failure', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new Error('Validation failed: fund name'));

    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText('Fund Creation and Publish Failed')).toBeInTheDocument();
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

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
    });

    // Resolve to prevent hanging
    resolveFinalize({
      success: true,
      data: { fundId: 77, configVersion: 1, correlationId: 'test', published: true },
    });
  });

  it('does not submit twice while a finalize request is in flight', async () => {
    let resolveFinalize!: (v: unknown) => void;
    mockFinalizeFund.mockReset().mockReturnValue(
      new Promise((resolve) => {
        resolveFinalize = resolve;
      })
    );

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    });

    resolveFinalize({
      success: true,
      data: { fundId: 77, configVersion: 1, correlationId: 'test', published: true },
    });
  });

  it('shows Retry text after error and allows resubmission', async () => {
    mockFinalizeFund.mockRejectedValueOnce(new Error('Server error')).mockResolvedValueOnce({
      success: true,
      data: { fundId: 77, configVersion: 1, correlationId: 'test', published: true },
    });

    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText('Fund Creation and Publish Failed')).toBeInTheDocument();
    });

    // Button should show Retry
    expect(screen.getByText('Retry Publish')).toBeInTheDocument();

    // Click retry
    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/77');
    });

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });
});
