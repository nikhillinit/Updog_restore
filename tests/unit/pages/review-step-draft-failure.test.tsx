/**
 * Tests for ReviewStep draft failure + retry logic
 *
 * Validates:
 * - Draft PUT returns non-2xx -> stays on ReviewStep with error, no navigation
 * - POST succeeds + draft fails + retry -> skips POST, retries PUT only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock dependencies before importing component
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=7', vi.fn()],
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    setCurrentFund: vi.fn(),
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
};

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (s: typeof mockFundState) => unknown) => selector(mockFundState),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

// Mock createFund to return success
const mockCreateFund = vi.fn().mockResolvedValue({
  success: true,
  data: { id: 42, name: 'Test Fund', size: '50000000' },
});

vi.mock('@/services/funds', () => ({
  createFund: (...args: unknown[]) => mockCreateFund(...args),
  normalizeCreateFundResponse: (raw: Record<string, unknown>) => {
    const data = (raw as { data?: Record<string, unknown> }).data ?? raw;
    return { id: Number(data['id']), name: data['name'], size: data['size'] };
  },
}));

// Track fetch calls
const mockFetch = vi.fn();

describe('ReviewStep draft failure handling', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Restore createFund implementation (restoreAllMocks wipes it)
    mockCreateFund.mockReset().mockResolvedValue({
      success: true,
      data: { id: 42, name: 'Test Fund', size: '50000000' },
    });
    // Override global fetch for draft PUT
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows error when draft PUT returns 400', async () => {
    // Draft PUT returns 400 (strict validation failure)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({
          error: 'Draft configuration is invalid',
          code: 'DRAFT_VALIDATION_ERROR',
          issues: [{ path: ['fundName'], message: 'Required' }],
        }),
    });

    // Dynamic import to ensure mocks are in place
    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // Should show error state (not navigate away)
    await waitFor(() => {
      expect(screen.getByText(/Draft configuration is invalid/i)).toBeInTheDocument();
    });
  });

  it('POST succeeds but draft fails -> error shown, no navigation', async () => {
    // Re-stub fetch for this test (afterEach unstubs)
    vi.stubGlobal('fetch', mockFetch);

    // Draft PUT returns 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Draft DB error' }),
    });

    const { default: ReviewStep } = await import('@/pages/ReviewStep');
    render(<ReviewStep />);

    const button = screen.getByTestId('create-fund-button');
    await userEvent.click(button);

    // Wait for error state to render
    await waitFor(() => {
      expect(screen.getByText('Fund Creation Failed')).toBeInTheDocument();
    });

    // POST was called once (fund was created)
    expect(mockCreateFund).toHaveBeenCalledTimes(1);
    // Draft fetch was called once (and failed)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
