import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const FULL_SUITE_WAIT_OPTIONS = { timeout: 10_000 };

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=1', mockNavigate],
}));

const mockSetCurrentFund = vi.fn();
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: null,
    setCurrentFund: mockSetCurrentFund,
  }),
}));

const mockUpdateFundBasics = vi.fn();
const mockSetDraftFundId = vi.fn((fundId: number | null) => {
  mockFundState.draftFundId = fundId;
});
const mockSetDraftServerReady = vi.fn((ready: boolean) => {
  mockFundState.draftServerReady = ready;
});

const mockFundState = {
  fundName: 'Bootstrap Fund',
  fundSize: 50_000_000,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  vintageYear: 2026,
  establishmentDate: '2026-01-15',
  isEvergreen: false,
  fundLife: 10,
  investmentPeriod: 5,
  gpCommitment: 2_500_000,
  lpClasses: [],
  lps: [],
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
  sectorProfiles: [],
  allocations: [],
  followOnChecks: { A: 1, B: 2, C: 3 },
  capitalStageAllocations: [],
  capitalPlanAllocations: [],
  pipelineProfiles: [],
  waterfallType: 'american' as const,
  waterfallTiers: [],
  recyclingEnabled: false,
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
  setDraftFundId: mockSetDraftFundId,
  draftServerReady: false,
  setDraftServerReady: mockSetDraftServerReady,
};

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (state: typeof mockFundState) => unknown) => selector(mockFundState),
  useFundAction: (
    selector: (actions: {
      updateFundBasics: typeof mockUpdateFundBasics;
      setDraftFundId: typeof mockSetDraftFundId;
      setDraftServerReady: typeof mockSetDraftServerReady;
    }) => unknown
  ) =>
    selector({
      updateFundBasics: mockUpdateFundBasics,
      setDraftFundId: mockSetDraftFundId,
      setDraftServerReady: mockSetDraftServerReady,
    }),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

const mockCreateFund = vi.fn();
vi.mock('@/services/funds', () => ({
  createFund: (...args: unknown[]) => mockCreateFund(...args),
  normalizeCreateFundResponse: (raw: Record<string, unknown>) => {
    const data = (raw as { data?: Record<string, unknown> }).data ?? raw;
    return {
      id: Number(data['id']),
      name: data['name'],
      size: data['size'],
      status: data['status'],
      createdAt: data['createdAt'],
      updatedAt: data['updatedAt'],
    };
  },
}));

const mockSaveFundDraft = vi.fn();
vi.mock('@/services/fund-drafts', () => ({
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

describe('FundBasicsStep bootstrap identity', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockSetCurrentFund.mockReset();
    mockUpdateFundBasics.mockReset();
    mockSetDraftFundId.mockClear();
    mockSetDraftServerReady.mockClear();
    mockFundState.fundName = 'Bootstrap Fund';
    mockFundState.fundSize = 50_000_000;
    mockFundState.managementFeeRate = 2.0;
    mockFundState.carriedInterest = 20.0;
    mockFundState.vintageYear = 2026;
    mockFundState.establishmentDate = '2026-01-15';
    mockFundState.fundLife = 10;
    mockFundState.investmentPeriod = 5;
    mockFundState.draftFundId = null;
    mockFundState.draftServerReady = false;
    mockCreateFund.mockReset().mockResolvedValue({
      success: true,
      data: {
        id: 42,
        name: 'Bootstrap Fund',
        size: 50_000_000,
        status: 'draft',
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z',
      },
    });
    mockSaveFundDraft.mockReset().mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bootstraps a canonical fund identity and saves the authoritative draft before advancing', async () => {
    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).toHaveBeenCalledTimes(1);
    expect(mockSetDraftFundId).toHaveBeenCalledWith(42);
    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ fundName: 'Bootstrap Fund' })
    );
    expect(mockSetDraftServerReady).toHaveBeenCalledWith(true);
    expect(mockSetCurrentFund).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 42,
        name: 'Bootstrap Fund',
        status: 'draft',
      })
    );
  });

  it('reuses an existing draft identity and saves it when the server snapshot is not ready yet', async () => {
    mockFundState.draftFundId = 77;
    mockFundState.draftServerReady = false;

    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      77,
      expect.objectContaining({ fundName: 'Bootstrap Fund' })
    );
    expect(mockSetDraftServerReady).toHaveBeenCalledWith(true);
  });

  it('reuses an existing authoritative draft identity and skips redundant create/save work', async () => {
    mockFundState.draftFundId = 77;
    mockFundState.draftServerReady = true;

    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockSetDraftServerReady).not.toHaveBeenCalled();
  });

  it('allows navigation without bootstrap when minimum basics are still incomplete', async () => {
    mockFundState.fundName = '';
    mockFundState.fundSize = undefined;

    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('stays on step 1 and shows an error when bootstrap creation fails', async () => {
    mockCreateFund.mockRejectedValueOnce(new Error('Bootstrap create failed'));

    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Bootstrap create failed');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSetDraftFundId).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('stays on step 1 and shows an error when authoritative draft save fails', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(new Error('Draft save failed'));

    const { default: FundBasicsStep } = await import('@/pages/FundBasicsStep');
    render(<FundBasicsStep />);

    await userEvent.click(screen.getByTestId('next-step'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Draft save failed');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).toHaveBeenCalledTimes(1);
    expect(mockSetDraftFundId).toHaveBeenCalledWith(42);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
