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
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/queryClient';
import {
  fundStore,
  resetFundWorkspace,
  bindFundWorkspaceActor,
  unbindFundWorkspaceActor,
  FUND_COMMAND_STORAGE_MESSAGE,
} from '@/stores/fundStore';

const FULL_SUITE_WAIT_OPTIONS = { timeout: 10_000 };
const { mockUseFlag } = vi.hoisted(() => ({
  mockUseFlag: vi.fn(),
}));

// Mock dependencies before importing component
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=7', mockSetLocation],
}));

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
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

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: (...args: unknown[]) => mockUseFlag(...args),
}));

// Mock finalizeFund
const mockFinalizeFund = vi.fn();
const mockFundStoreToDraftWriteV1 = vi.fn();

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
    modelInputsAsOfDate: '2026-06-30',
  }),
  fundStoreToCreateV1: vi.fn(),
  fundStoreToDraftWriteV1: (...args: unknown[]) => mockFundStoreToDraftWriteV1(...args),
}));

import ReviewStep from '@/pages/ReviewStep';

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
  beforeEach(async () => {
    mockSetLocation.mockReset();
    mockSetCurrentFund.mockReset();
    mockUseFlag.mockReset().mockReturnValue(true);
    resetFundWorkspace();
    await bindFundWorkspaceActor('actor-1', 'admin');
    fundStore.setState({
      fundName: 'Test Fund',
      fundSize: 50_000_000,
      managementFeeRate: 2,
      carriedInterest: 20,
      vintageYear: 2026,
      fundLife: 10,
      establishmentDate: '2026-01-15',
      modelInputsAsOfDate: '2026-06-30',
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      waterfallType: 'american',
      recyclingEnabled: false,
      isEvergreen: false,
      investmentPeriod: 5,
      gpCommitment: 2_500_000,
      followOnChecks: { A: 1, B: 2, C: 3 },
    });
    mockFinalizeFund.mockReset().mockResolvedValue(successResponse);
    mockFundStoreToDraftWriteV1.mockReset().mockReturnValue({
      fundName: 'Test Fund',
      fundSize: 50_000_000,
      managementFeeRate: 2,
      carriedInterest: 20,
      vintageYear: 2026,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 2_500_000,
      economicsAssumptions: { version: 'v1' },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    unbindFundWorkspaceActor();
  });

  it('shows error when finalize returns validation error', async () => {
    mockFinalizeFund
      .mockReset()
      .mockRejectedValue(new ApiError(400, 'Draft configuration is invalid', 'VALIDATION_FAILED'));

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Draft configuration is invalid/i)).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('shows an uncertain outcome when finalize returns an ordinary 500', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue(new ApiError(500, 'Finalize failed'));

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId('publish-uncertain-alert')).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('does not dispatch or clear pending state when command preparation fails', async () => {
    const pending = {
      operation: 'finalize' as const,
      key: 'persisted-key',
      targetFundId: null,
      expectedETag: null,
      bodySignature: JSON.stringify({ name: 'Persisted Fund' }),
    };
    fundStore.getState().beginCommand(pending);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    render(<ReviewStep />);
    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByText(FUND_COMMAND_STORAGE_MESSAGE)).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);
    expect(mockFinalizeFund).not.toHaveBeenCalled();
    expect(fundStore.getState().persistenceFailed).toBe(true);
    expect(fundStore.getState().pendingCommand).toMatchObject(pending);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('navigates to results route after successful finalize', async () => {
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockFinalizeFund).toHaveBeenCalledTimes(1);
    expect(mockSetCurrentFund).not.toHaveBeenCalled();
  });

  it('retries finalize after failure and navigates on success', async () => {
    mockFinalizeFund
      .mockRejectedValueOnce(new ApiError(400, 'Finalize rejected', 'VALIDATION_FAILED'))
      .mockResolvedValueOnce(successResponse);

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // First attempt: fails
    await waitFor(() => {
      expect(screen.getByText('Fund Creation and Publish Failed')).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    // Retry
    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });

  it('shows error when publish queue fails via finalize', async () => {
    mockFinalizeFund
      .mockReset()
      .mockRejectedValue(new ApiError(400, 'Publish queue error', 'PUBLISH_REJECTED'));

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Publish queue error/i)).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('retries after publish failure and navigates on success', async () => {
    mockFinalizeFund
      .mockRejectedValueOnce(new ApiError(400, 'Publish queue error', 'PUBLISH_REJECTED'))
      .mockResolvedValueOnce(successResponse);

    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Publish queue error/i)).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/42');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockFinalizeFund).toHaveBeenCalledTimes(2);
  });

  it('treats non-Error thrown values as uncertain', async () => {
    mockFinalizeFund.mockReset().mockRejectedValue('raw string error');

    render(<ReviewStep />);

    await userEvent.click(screen.getByTestId('create-fund-button'));

    await waitFor(() => {
      expect(screen.getByTestId('publish-uncertain-alert')).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);
  });
});
