import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fundStore } from '@/stores/fundStore';
import { ApiError } from '@/lib/queryClient';
import { FundWorkflowUncertainError } from '@/services/fund-workflow';

const SERVER_ETAG = '"0000000000000001"';
const NEXT_ETAG = '"0000000000000002"';

const mockLocation = { value: '/fund-setup?step=1' };
const mockSetLocation = vi.fn((next: string) => {
  mockLocation.value = next;
});
const mockMarkStepVisited = vi.fn();
const mockFetchFundDraft = vi.fn();
const mockSaveFundDraft = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation.value.split('?')[0] ?? mockLocation.value, mockSetLocation],
  useSearch: () => mockLocation.value.split('?')[1] ?? '',
}));

vi.mock('@/pages/FundBasicsStep', () => ({ default: () => 'Fund Basics Step' }));
vi.mock('@/pages/InvestmentRoundsStepV2', () => ({ default: () => 'Investment Rounds Step' }));
vi.mock('@/pages/CapitalStructureStep', () => ({ default: () => 'Capital Structure Step' }));
vi.mock('@/pages/InvestmentStrategyStep', () => ({ default: () => 'Investment Strategy Step' }));
vi.mock('@/pages/InvestmentStrategyStepNew', () => ({
  default: () => 'Investment Strategy New Step',
}));
vi.mock('@/pages/DistributionsStep', () => ({ default: () => 'Distributions Step' }));
vi.mock('@/pages/CashflowManagementStep', () => ({ default: () => 'Cashflow Management Step' }));
vi.mock('@/pages/ReviewStep', () => ({ default: () => 'Review Step' }));
vi.mock('@/pages/steps/StepNotFound', () => ({ default: () => 'Step Not Found' }));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/useWizardStepGuard', () => ({
  useWizardStepGuard: () => ({
    markStepVisited: mockMarkStepVisited,
    getRedirectUrl: () => null,
  }),
}));

vi.mock('@/lib/wizard-telemetry', () => ({
  emitWizard: vi.fn(),
}));

vi.mock('@/services/fund-drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fund-drafts')>()),
  fetchFundDraft: (...args: unknown[]) => mockFetchFundDraft(...args),
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

const stepTitles = [
  'FUND BASICS',
  'INVESTMENT ROUNDS',
  'CAPITAL ALLOCATION',
  'INVESTMENT STRATEGY',
  'DISTRIBUTIONS & WATERFALL',
  'CASHFLOW & LIQUIDITY',
  'REVIEW & CREATE',
];

function expectProgress(currentStep: number) {
  expect(screen.getByRole('heading', { name: 'Fund Construction Wizard' })).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: /^Step \d: / });
  expect(buttons).toHaveLength(7);

  buttons.forEach((button, index) => {
    const number = index + 1;
    expect(button).toHaveAccessibleName(`Step ${number}: ${stepTitles[index]}`);
    expect(button.parentElement).toHaveTextContent(stepTitles[index]!);
    expect(button).toHaveAttribute('type', 'button');
    if (number === 7) {
      expect(button).toBeDisabled();
    } else {
      expect(button).toBeEnabled();
    }

    if (number < currentStep) {
      expect(button).toHaveClass('bg-charcoal', 'text-white');
      expect(button.querySelector('svg.lucide-check')).toBeInTheDocument();
      expect(button).toHaveTextContent(/^$/);
    } else {
      expect(button.querySelector('svg')).not.toBeInTheDocument();
      expect(button).toHaveTextContent(String(number));
    }

    if (number === currentStep) {
      expect(button).toHaveClass('bg-charcoal', 'text-white', 'ring-4', 'ring-beige');
      expect(button).toHaveAttribute('aria-current', 'step');
    } else {
      expect(button).not.toHaveClass('ring-4');
      expect(button).not.toHaveAttribute('aria-current');
    }

    if (number > currentStep) {
      expect(button).toHaveClass('bg-white', 'border-2', 'border-beige', 'text-charcoal/60');
    }
  });

  // The fill has no semantic progress role; lock its rendered width directly.
  const fill = screen.getByTestId('fund-setup-wizard').querySelector<HTMLElement>('.duration-500');
  expect(fill).toHaveStyle({ width: `${(currentStep / 7) * 100}%` });
}

describe('FundSetup draft sync', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockLocation.value = '/fund-setup?step=1';
    mockSetLocation.mockReset();
    mockMarkStepVisited.mockReset();
    mockFetchFundDraft.mockReset();
    mockSaveFundDraft.mockReset();
    localStorage.clear();
    sessionStorage.clear();

    const initialState = fundStore.getInitialState();
    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          draftFundId: null,
          draftServerReady: false,
        },
        true
      );
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a fresh wizard without a draft-sync alert or draft service calls', async () => {
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(await screen.findByText('Fund Basics Step')).toBeInTheDocument();
    expect(fundStore.getState().creationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByTestId('draft-sync-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draft-sync-status')).not.toBeInTheDocument();
    expect(mockFetchFundDraft).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('labels the distributions step as the waterfall configuration step', async () => {
    mockLocation.value = '/fund-setup?step=5';

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(screen.getByText('Distributions Step')).toBeInTheDocument();
    expect(screen.getByText('DISTRIBUTIONS & WATERFALL')).toBeInTheDocument();
  });

  it('does not replace an unresolved creation when an explicit fund URL is opened', async () => {
    mockLocation.value = '/fund-setup?fundId=99';
    const pending = {
      operation: 'create' as const,
      targetFundId: null,
      key: crypto.randomUUID(),
      expectedETag: null,
      bodySignature: '{}',
      dispatchedAt: new Date().toISOString(),
    };
    act(() => fundStore.setState({ fundName: 'Pending creation', pendingCommand: pending }));
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    expect(await screen.findByTestId('draft-switch-blocked')).toHaveTextContent('Pending creation');
    expect(
      screen.queryByRole('button', { name: 'Discard local draft and open selected fund' })
    ).not.toBeInTheDocument();
    expect(fundStore.getState().pendingCommand).toEqual(pending);
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(mockFetchFundDraft).not.toHaveBeenCalled();
  });

  it('does not replace unnamed pre-create edits when an explicit fund URL is opened', async () => {
    mockLocation.value = '/fund-setup?fundId=99';
    act(() =>
      fundStore.setState({
        creationKey: null,
        fundName: undefined,
        fundSize: 25_000_000,
      })
    );

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(await screen.findByTestId('draft-switch-blocked')).toBeInTheDocument();
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(fundStore.getState().fundSize).toBe(25_000_000);
    expect(mockFetchFundDraft).not.toHaveBeenCalled();
  });

  it('keeps local edits on cancel and opens the selected fund only after discard confirmation', async () => {
    mockLocation.value = '/fund-setup?fundId=99';
    mockFetchFundDraft.mockResolvedValue({ config: { fundName: 'Fund 99' }, etag: SERVER_ETAG });
    act(() =>
      fundStore.setState({
        creationKey: crypto.randomUUID(),
        fundName: 'Local draft',
        fundSize: 25_000_000,
      })
    );

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    const discardButton = await screen.findByRole('button', {
      name: 'Discard local draft and open selected fund',
    });

    await userEvent.click(discardButton);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Unsaved changes to Local draft');
    await userEvent.click(screen.getByRole('button', { name: 'Keep local draft' }));

    expect(fundStore.getState().draftFundId).toBeNull();
    expect(fundStore.getState().fundName).toBe('Local draft');
    expect(fundStore.getState().fundSize).toBe(25_000_000);
    expect(screen.getByTestId('draft-switch-blocked')).toBeInTheDocument();

    await userEvent.click(discardButton);
    await userEvent.click(screen.getByRole('button', { name: 'Discard and open' }));

    await waitFor(() => expect(fundStore.getState().draftFundId).toBe(99));
    await waitFor(() => expect(mockFetchFundDraft).toHaveBeenCalledWith(99));
    expect(screen.queryByTestId('draft-switch-blocked')).not.toBeInTheDocument();
  });

  it('clears a blocked draft-switch warning after same-mount navigation to the bare wizard', async () => {
    mockLocation.value = '/fund-setup?fundId=99';
    act(() =>
      fundStore.setState({
        creationKey: crypto.randomUUID(),
        fundName: 'Local draft',
      })
    );

    const { default: FundSetup } = await import('@/pages/fund-setup');
    const { rerender } = render(<FundSetup />);
    expect(await screen.findByTestId('draft-switch-blocked')).toHaveTextContent('Local draft');

    mockLocation.value = '/fund-setup';
    rerender(<FundSetup />);

    await waitFor(() =>
      expect(screen.queryByTestId('draft-switch-blocked')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
  });

  it('switches a confirmed synced server draft to another explicit fund', async () => {
    mockLocation.value = '/fund-setup?fundId=99';
    mockFetchFundDraft.mockResolvedValue({ config: { fundName: 'Fund 99' }, etag: SERVER_ETAG });
    act(() =>
      fundStore.setState({
        draftFundId: 55,
        draftServerReady: true,
        draftSyncStatus: 'synced',
        fundName: 'Fund 55',
      })
    );

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() => expect(fundStore.getState().draftFundId).toBe(99));
    await waitFor(() => expect(mockFetchFundDraft).toHaveBeenCalledWith(99));
    expect(screen.queryByTestId('draft-switch-blocked')).not.toBeInTheDocument();
  });

  it('keeps all wizard editing steps closed while publication status is unresolved', async () => {
    mockLocation.value = '/fund-setup?step=1';
    act(() =>
      fundStore.setState({
        draftFundId: 55,
        draftServerReady: true,
        pendingCommand: {
          operation: 'finalize',
          targetFundId: 55,
          key: crypto.randomUUID(),
          expectedETag: SERVER_ETAG,
          bodySignature: '{}',
          dispatchedAt: new Date().toISOString(),
        },
      })
    );
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    expect(await screen.findByText('Review Step')).toBeInTheDocument();
    expect(screen.queryByText('Fund Basics Step')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /^Step \d: / }))
      expect(button).toBeDisabled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockSetLocation).toHaveBeenCalledWith('/fund-setup?step=7', { replace: true });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 99])('renders progress for routed step %i', async (step) => {
    mockLocation.value = `/fund-setup?step=${step}`;
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expectProgress(step === 99 ? 0 : step);
    if (step === 99) {
      expect(screen.getByText('Step Not Found')).toBeInTheDocument();
    }
  });

  it('updates progress on the same mount across backward, review, and invalid navigation', async () => {
    mockLocation.value = '/fund-setup?step=5';
    const { default: FundSetup } = await import('@/pages/fund-setup');
    const { rerender } = render(<FundSetup />);
    expectProgress(5);

    for (const step of [2, 7, 99]) {
      mockLocation.value = `/fund-setup?step=${step}`;
      rerender(<FundSetup />);
      expectProgress(step === 99 ? 0 : step);
    }
    expect(screen.getByText('Step Not Found')).toBeInTheDocument();
  });

  it.each([1, 2, 3, 4, 5, 6])('navigates an enabled circle to step %i', async (step) => {
    mockLocation.value = '/fund-setup?step=5';
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await userEvent.click(
      screen.getByRole('button', { name: `Step ${step}: ${stepTitles[step - 1]}` })
    );
    expect(mockSetLocation).toHaveBeenCalledExactlyOnceWith(`/fund-setup?step=${step}`);
  });

  it('does not navigate when the disabled review circle is clicked', async () => {
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    const review = screen.getByRole('button', { name: 'Step 7: REVIEW & CREATE' });

    expect(review).toBeDisabled();
    await userEvent.click(review);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('hydrates a recovered authoritative draft from the server before rendering the routed step', async () => {
    mockFetchFundDraft.mockResolvedValue({
      config: {
        fundName: 'Server Fund',
        fundSize: 123_000_000,
        managementFeeRate: 2,
        carriedInterest: 20,
        stages: [{ id: 'srv-stage', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
        sectorProfiles: [{ id: 'srv-sector', name: 'FinTech', targetPercentage: 100 }],
        allocations: [{ id: 'srv-alloc', category: 'New Investments', percentage: 100 }],
        followOnChecks: { A: 100, B: 200, C: 300 },
      },
      etag: SERVER_ETAG,
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Local Cache Fund',
        draftFundId: 88,
        draftServerReady: true,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(screen.getByTestId('draft-hydrating')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetchFundDraft).toHaveBeenCalledWith(88);
    });

    await waitFor(() => {
      expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
    });

    expect(fundStore.getState().fundName).toBe('Server Fund');
    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(fundStore.getState().draftETag).toBe(SERVER_ETAG);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Latest draft saved');
    // Hydration is not a save: no "saved at" time for a draft loaded from the server.
    expect(screen.getByTestId('draft-sync-status')).not.toHaveTextContent(/saved at/);
  });

  it('autosaves edits made after a same-tab reload restores a server-ready draft', async () => {
    mockFetchFundDraft.mockResolvedValue({
      config: { fundName: 'Restored Fund' },
      etag: SERVER_ETAG,
    });
    mockSaveFundDraft.mockResolvedValue({ config: {}, etag: NEXT_ETAG, replayed: false });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Restored Fund',
        draftFundId: 88,
        draftServerReady: true,
        draftETag: SERVER_ETAG,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() =>
      expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Latest draft saved')
    );
    expect(screen.getByTestId('draft-sync-status')).not.toHaveTextContent(/saved at/);
    await waitFor(() => expect(mockSaveFundDraft).not.toHaveBeenCalled());

    act(() => {
      fundStore.setState({ ...fundStore.getState(), fundName: 'Edited after reload' });
    });

    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Saving draft');
    await waitFor(() => {
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        88,
        expect.objectContaining({ fundName: 'Edited after reload' }),
        expect.objectContaining({ etag: SERVER_ETAG })
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('draft-sync-status')).toHaveTextContent(/Latest draft saved at /)
    );
    expect(fundStore.getState().draftETag).toBe(NEXT_ETAG);
  });

  it('holds local values and asks for a choice when the acknowledged revision is stale', async () => {
    mockFetchFundDraft.mockResolvedValue({
      config: { fundName: 'Server Fund', fundSize: 5 },
      etag: NEXT_ETAG,
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Local Edits',
        draftFundId: 88,
        draftServerReady: true,
        draftETag: SERVER_ETAG,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() => {
      expect(screen.getByTestId('draft-stale')).toBeInTheDocument();
    });
    expect(fundStore.getState().fundName).toBe('Local Edits');
    expect(mockSaveFundDraft).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Load server draft' }));

    await waitFor(() => {
      expect(fundStore.getState().fundName).toBe('Server Fund');
    });
    expect(fundStore.getState().draftETag).toBe(NEXT_ETAG);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Latest draft saved');
  });

  it('keeps local values and resubmits them over the current revision on request', async () => {
    mockFetchFundDraft.mockResolvedValue({
      config: { fundName: 'Server Fund' },
      etag: NEXT_ETAG,
    });
    mockSaveFundDraft.mockResolvedValue({
      config: {},
      etag: '"0000000000000003"',
      replayed: false,
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Local Edits',
        draftFundId: 88,
        draftServerReady: true,
        draftETag: SERVER_ETAG,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    await waitFor(() => expect(screen.getByTestId('draft-stale')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Keep my changes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Overwrite saved draft' }));

    await waitFor(() => {
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        88,
        expect.objectContaining({ fundName: 'Local Edits' }),
        expect.objectContaining({ etag: NEXT_ETAG })
      );
    });
    expect(fundStore.getState().draftETag).toBe('"0000000000000003"');
  });

  it('autosaves the routed wizard to the server after draft identity bootstrap', async () => {
    mockSaveFundDraft.mockResolvedValue({ config: {}, etag: NEXT_ETAG, replayed: false });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Initial Draft',
        draftFundId: 55,
        draftServerReady: false,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Changed Draft Name',
      });
    });

    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Saving draft');

    await waitFor(() => {
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ fundName: 'Changed Draft Name' }),
        expect.objectContaining({ key: expect.any(String), etag: null })
      );
    });

    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(fundStore.getState().draftETag).toBe(NEXT_ETAG);
    expect(fundStore.getState().pendingCommand).toBeNull();
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Latest draft saved');
  });

  it('keeps the command key across an uncertain save and replays it on retry', async () => {
    mockSaveFundDraft
      .mockRejectedValueOnce(new FundWorkflowUncertainError('Request timed out', true))
      .mockResolvedValueOnce({ config: {}, etag: NEXT_ETAG, replayed: true });

    act(() => {
      fundStore.setState({ ...fundStore.getState(), draftFundId: 55, draftServerReady: false });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    act(() => {
      fundStore.setState({ ...fundStore.getState(), fundName: 'Uncertain Draft' });
    });

    await waitFor(() => expect(screen.getByTestId('draft-uncertain')).toBeInTheDocument());
    const pending = fundStore.getState().pendingCommand;
    expect(pending?.operation).toBe('save_draft');

    await userEvent.click(screen.getByRole('button', { name: 'Check save status' }));

    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveFundDraft.mock.calls[1]?.[2]).toMatchObject({ key: pending?.key });
    await waitFor(() =>
      expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Latest draft saved')
    );
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it.each([
    new FundWorkflowUncertainError('lost response', false),
    new ApiError(409, 'Retry command', 'REQUEST_IN_PROGRESS'),
  ])(
    'holds edits behind an unresolved save and replays the original request: %s',
    async (failure) => {
      let rejectFirst!: (error: unknown) => void;
      mockSaveFundDraft
        .mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              rejectFirst = reject;
            })
        )
        .mockResolvedValue({ config: {}, etag: NEXT_ETAG, replayed: true });
      act(() =>
        fundStore.setState({ draftFundId: 55, draftETag: SERVER_ETAG, draftServerReady: false })
      );
      const { default: FundSetup } = await import('@/pages/fund-setup');
      const view = render(<FundSetup />);
      act(() => fundStore.setState({ fundName: 'Original request' }));
      await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
      const original = mockSaveFundDraft.mock.calls[0];
      act(() => fundStore.setState({ fundName: 'Edited while saving' }));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 650));
      });
      await act(async () => {
        rejectFirst(failure);
      });
      expect(mockSaveFundDraft).toHaveBeenCalledTimes(1);
      // A new mount must not fetch over, replace, or forget the uncertain request.
      view.unmount();
      act(() => fundStore.setState({ draftServerReady: true }));
      render(<FundSetup />);
      await userEvent.click(await screen.findByRole('button', { name: 'Check save status' }));
      await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(3));
      expect(mockSaveFundDraft.mock.calls[1]).toEqual(original);
      expect(mockSaveFundDraft.mock.calls[2]?.[1]).toMatchObject({
        fundName: 'Edited while saving',
      });
      expect(mockSaveFundDraft.mock.calls[2]?.[2]).toMatchObject({ etag: NEXT_ETAG });
      expect(mockSaveFundDraft.mock.calls[2]?.[2].key).not.toBe(original?.[2].key);
      expect(mockFetchFundDraft).not.toHaveBeenCalled();
      expect(fundStore.getState().pendingCommand).toBeNull();
    }
  );

  it('reports a stale revision on save without rebasing local values', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(
      new ApiError(412, 'Draft revision is stale', 'PRECONDITION_FAILED', undefined, undefined, {
        current: NEXT_ETAG,
      })
    );

    act(() => {
      fundStore.setState({ ...fundStore.getState(), draftFundId: 55, draftServerReady: false });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);
    act(() => {
      fundStore.setState({ ...fundStore.getState(), fundName: 'Conflicting Draft' });
    });

    await waitFor(() => expect(screen.getByTestId('draft-stale')).toBeInTheDocument());
    expect(fundStore.getState().fundName).toBe('Conflicting Draft');
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it.each(['Load server draft', 'Keep my changes'])(
    'ignores stale %s results after a session switch',
    async (action) => {
      let resolveRead!: (value: unknown) => void;
      mockFetchFundDraft.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve;
          })
      );
      act(() =>
        fundStore.setState({ draftFundId: 55, draftServerReady: false, fundName: 'Old session' })
      );
      const { default: FundSetup } = await import('@/pages/fund-setup');
      render(<FundSetup />);
      act(() => fundStore.getState().setDraftSyncStatus('stale'));
      await userEvent.click(screen.getByRole('button', { name: action }));
      if (action === 'Keep my changes') {
        await userEvent.click(await screen.findByRole('button', { name: 'Overwrite saved draft' }));
      }
      expect(mockFetchFundDraft).toHaveBeenCalledTimes(1);
      act(() =>
        fundStore.setState({ sessionId: 'replacement-session', fundName: 'New actor values' })
      );
      await act(async () => {
        resolveRead({ config: { fundName: 'Old actor server snapshot' }, etag: NEXT_ETAG });
      });
      expect(fundStore.getState().fundName).toBe('New actor values');
      expect(fundStore.getState().draftETag).toBeNull();
      expect(mockSaveFundDraft).not.toHaveBeenCalled();
    }
  );

  it('retries authoritative draft hydration when the initial server load fails', async () => {
    mockFetchFundDraft.mockRejectedValueOnce(new Error('Draft load failed')).mockResolvedValueOnce({
      config: {
        fundName: 'Recovered Fund',
        fundSize: 75_000_000,
        stages: [{ id: 'recovered-stage', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
        sectorProfiles: [{ id: 'recovered-sector', name: 'AI', targetPercentage: 100 }],
        allocations: [{ id: 'recovered-alloc', category: 'New Investments', percentage: 100 }],
        followOnChecks: { A: 10, B: 20, C: 30 },
      },
      etag: SERVER_ETAG,
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        draftFundId: 90,
        draftServerReady: true,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() => {
      expect(screen.getByTestId('draft-sync-error')).toHaveTextContent('Draft load failed');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry Sync' }));

    await waitFor(() => {
      expect(mockFetchFundDraft).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
    });

    expect(fundStore.getState().fundName).toBe('Recovered Fund');
  });

  it('stops on a fund with no active draft and offers its model instead of recreating one', async () => {
    mockFetchFundDraft.mockRejectedValueOnce(new ApiError(404, 'No draft found'));

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Local Cache Fund',
        draftFundId: 91,
        draftServerReady: true,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() => {
      expect(mockFetchFundDraft).toHaveBeenCalledWith(91);
    });

    await waitFor(() => {
      expect(screen.getByTestId('draft-missing')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('draft-hydrating')).not.toBeInTheDocument();
    expect(fundStore.getState().draftFundId).toBe(91);
    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(fundStore.getState().fundName).toBe('Local Cache Fund');
    expect(mockSaveFundDraft).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Open model' }));
    expect(mockSetLocation).toHaveBeenCalledWith('/fund-model-results/91');
  });
});
