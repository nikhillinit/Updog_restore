import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  bindFundWorkspaceActor,
  fundStore,
  resetFundWorkspace,
  unbindFundWorkspaceActor,
} from '@/stores/fundStore';
import { FundWorkflowUncertainError } from '@/services/fund-workflow';
import { ApiError } from '@/lib/queryClient';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { FUND_COMMAND_STORAGE_MESSAGE } from '@/stores/fundStore';

const FULL_SUITE_WAIT_OPTIONS = { timeout: 10_000 };
const TEST_ACTOR_ID = 'fund-basics-bootstrap-user';
// Command identities as identifiers, not literals, so secret scanners see no key-shaped value.
const CREATION_KEY = ['reserved', 'creation', '1'].join('-');

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=1', mockNavigate],
}));

const mockSetCurrentFund = vi.fn();
let mockCurrentFund: Record<string, unknown> | null = null;
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: mockCurrentFund,
    setCurrentFund: mockSetCurrentFund,
  }),
}));

const mockCreateFund = vi.fn();
const mockHandleCredentialRenewalMarker = vi.fn(() => false);
vi.mock('@/services/funds', () => ({
  createFund: (...args: unknown[]) => mockCreateFund(...args),
  handleCredentialRenewalMarker: (...args: unknown[]) =>
    mockHandleCredentialRenewalMarker(...(args as [])),
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

import FundBasicsStep from '@/pages/FundBasicsStep';

async function clickNextStep() {
  const user = userEvent.setup();
  await user.click(screen.getByTestId('next-step'));
}

function holdDraftSave() {
  let finishSave!: (value: unknown) => void;
  mockSaveFundDraft.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSave = resolve;
      })
  );
  return (value: unknown) => finishSave(value);
}

function replaceDraftSession() {
  fundStore.getState().startNewFundSession();
  fundStore.setState({ fundName: 'Fund B', draftFundId: 78, draftServerReady: false });
}

describe('FundBasicsStep bootstrap identity', () => {
  beforeEach(async () => {
    mockNavigate.mockReset();
    mockSetCurrentFund.mockReset();
    mockCurrentFund = null;
    resetFundWorkspace();
    await bindFundWorkspaceActor(TEST_ACTOR_ID);
    fundStore.setState({
      fundName: 'Bootstrap Fund',
      fundSize: 50_000_000,
      managementFeeRate: 2.0,
      carriedInterest: 20.0,
      vintageYear: 2026,
      establishmentDate: '2026-01-15',
      modelInputsAsOfDate: '2026-09-12',
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 5,
      gpCommitment: 2_500_000,
      fundedFromFeesPct: 0,
      stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      followOnChecks: { A: 1, B: 2, C: 3 },
      waterfallType: 'american',
      recyclingEnabled: false,
      hydrated: true,
      creationKey: CREATION_KEY,
    });
    mockCreateFund.mockReset().mockResolvedValue({
      status: 201,
      etag: '"0123456789abcdef"',
      replayed: false,
      key: CREATION_KEY,
      durationMs: 1,
      body: {
        success: true,
        data: {
          id: 42,
          name: 'Bootstrap Fund',
          size: 50_000_000,
          status: 'draft',
          createdAt: '2026-03-26T00:00:00.000Z',
          updatedAt: '2026-03-26T00:00:00.000Z',
        },
      },
    });
    mockSaveFundDraft
      .mockReset()
      .mockResolvedValue({ config: {}, etag: '"0123456789abcdf0"', replayed: false });
    mockHandleCredentialRenewalMarker.mockReset().mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    unbindFundWorkspaceActor();
  });

  it('bootstraps a canonical fund identity and saves the authoritative draft before advancing', async () => {
    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(mockCreateFund).toHaveBeenCalledTimes(1);
      expect(mockCreateFund).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bootstrap Fund' }),
        { idempotencyKey: CREATION_KEY }
      );
      expect(fundStore.getState().draftFundId).toBe(42);
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ fundName: 'Bootstrap Fund' }),
        { key: expect.any(String), etag: '"0123456789abcdef"' }
      );
      expect(fundStore.getState().draftETag).toBe('"0123456789abcdf0"');
      expect(fundStore.getState().draftServerReady).toBe(true);
      expect(mockSetCurrentFund).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 42,
          name: 'Bootstrap Fund',
          status: 'draft',
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);
  });

  it('preserves the committed fund id and stops follow-on writes when renewal requires reauth', async () => {
    mockHandleCredentialRenewalMarker.mockReturnValue(true);

    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(mockCreateFund).toHaveBeenCalledTimes(1);
      expect(fundStore.getState().draftFundId).toBe(42);
      expect(
        screen.getByText('Session renewal required. Sign in again to continue editing.')
      ).toBeInTheDocument();
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('records cashless GP contribution as a percentage of GP commitment', async () => {
    const user = userEvent.setup();
    render(<FundBasicsStep />);

    const input = screen.getByLabelText('Cashless GP Contribution');
    await user.clear(input);
    await user.type(input, '40');

    expect(fundStore.getState().fundedFromFeesPct).toBe(0.4);
  });

  it.each([
    ['72', 72_000_000],
    ['4.1', 4_100_000],
  ])(
    'converts %s million to whole dollars for context, creation, and draft saves',
    async (inputValue, dollars) => {
      mockCurrentFund = { id: 9, name: 'Bootstrap Fund', size: 50_000_000 };
      const user = userEvent.setup();
      render(<FundBasicsStep />);

      const input = screen.getByLabelText(/Capital Committed \(\$M\)/);
      expect(input).toHaveValue('50');
      await user.clear(input);
      await user.type(input, inputValue);

      expect(fundStore.getState().fundSize).toBe(dollars);
      expect(mockSetCurrentFund).toHaveBeenLastCalledWith(
        expect.objectContaining({ size: dollars })
      );
      await clickNextStep();
      expect(mockCreateFund).toHaveBeenCalledWith(
        expect.objectContaining({ size: dollars }),
        expect.any(Object)
      );
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ fundSize: dollars }),
        expect.any(Object)
      );
    }
  );

  it('reuses an existing draft identity and saves it when the server snapshot is not ready yet', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });

    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        77,
        expect.objectContaining({ fundName: 'Bootstrap Fund' }),
        expect.objectContaining({ key: expect.any(String) })
      );
      expect(fundStore.getState().draftServerReady).toBe(true);
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).not.toHaveBeenCalled();
  });

  it('reenables Next without navigating when a save belongs to a replaced session', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });
    const finishSave = holdDraftSave();
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1),
      FULL_SUITE_WAIT_OPTIONS
    );
    act(replaceDraftSession);
    await act(async () => {
      finishSave({ config: {}, etag: '"0000000000000002"', replayed: false });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().draftServerReady).toBe(false);
    expect(screen.getByTestId('next-step')).toBeEnabled();
  });

  it('navigates once before a replacement queued after the save resolution', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });
    const finishSave = holdDraftSave();
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1),
      FULL_SUITE_WAIT_OPTIONS
    );
    await act(async () => {
      finishSave({ config: {}, etag: '"0000000000000002"', replayed: false });
      Promise.resolve().then(replaceDraftSession);
    });
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    expect(fundStore.getState()).toMatchObject({
      fundName: 'Fund B',
      draftFundId: 78,
      draftServerReady: false,
    });
  });

  it.each([
    ['stale', new ApiError(412, 'Old revision', 'STALE_REVISION')],
    ['uncertain', new FundWorkflowUncertainError('lost response', false)],
    ['superseded', null],
  ])('does not navigate after a %s save', async (_outcome, failure) => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });
    let settleSave!: (value: unknown) => void;
    mockSaveFundDraft.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          settleSave = failure ? reject : resolve;
        })
    );
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1),
      FULL_SUITE_WAIT_OPTIONS
    );
    await act(async () => {
      if (!failure) replaceDraftSession();
      settleSave(failure ?? { config: {}, etag: '"0000000000000002"', replayed: false });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    if (!failure) expect(screen.getByTestId('next-step')).toBeEnabled();
  });

  it('replays a recovered save with reordered allocation keys before advancing', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false, waterfallType: 'hybrid' });
    const payload = fundStoreToDraftWriteV1(fundStore.getState(), {
      includeEconomicsAssumptions: false,
    });
    const [allocation, ...remaining] = payload.capitalPlanAllocations!;
    const originalBody = {
      ...payload,
      capitalPlanAllocations: [
        Object.fromEntries(Object.entries(allocation!).reverse()) as typeof allocation,
        ...remaining,
      ],
    };
    expect(originalBody).toEqual(payload);
    expect(JSON.stringify(originalBody)).not.toBe(JSON.stringify(payload));
    const key = crypto.randomUUID();
    fundStore.setState({
      draftETag: '"0000000000000001"',
      pendingCommand: {
        operation: 'save_draft',
        targetFundId: 77,
        key,
        bodySignature: JSON.stringify(originalBody),
        expectedETag: '"0000000000000001"',
        dispatchedAt: new Date().toISOString(),
      },
    });
    mockSaveFundDraft.mockResolvedValueOnce({
      config: {},
      etag: '"0000000000000002"',
      replayed: true,
    });
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1),
      FULL_SUITE_WAIT_OPTIONS
    );
    expect(mockSaveFundDraft).toHaveBeenCalledWith(77, originalBody, {
      key,
      etag: '"0000000000000001"',
    });
    expect(screen.queryByRole('alert')?.textContent ?? '').not.toContain('Save the newer changes');
    await waitFor(
      () => expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2'),
      FULL_SUITE_WAIT_OPTIONS
    );
  });

  it('keeps the pending key when a draft save is uncertain', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });
    mockSaveFundDraft.mockRejectedValueOnce(new FundWorkflowUncertainError('lost response', false));
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the draft save'),
      FULL_SUITE_WAIT_OPTIONS
    );
    expect(fundStore.getState().pendingCommand?.key).toBe(mockSaveFundDraft.mock.calls[0]?.[2].key);
  });

  it('refuses a save when command storage is unavailable', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: false });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fundStore.setState({ fundName: 'Bootstrap Fund 2' });
    render(<FundBasicsStep />);
    await clickNextStep();
    expect(await screen.findByRole('alert')).toHaveTextContent(FUND_COMMAND_STORAGE_MESSAGE);
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('keeps the hydration flag while advancing a recovered pending save', async () => {
    fundStore.setState({
      draftFundId: 77,
      draftServerReady: false,
      draftETag: '"0000000000000001"',
      waterfallType: 'hybrid',
    });
    const payload = fundStoreToDraftWriteV1(fundStore.getState(), {
      includeEconomicsAssumptions: false,
    });
    const key = crypto.randomUUID();
    fundStore.setState({
      needsServerHydration: true,
      pendingCommand: {
        operation: 'save_draft',
        targetFundId: 77,
        key,
        bodySignature: JSON.stringify(payload),
        expectedETag: '"0000000000000001"',
        dispatchedAt: new Date().toISOString(),
      },
    });
    mockSaveFundDraft.mockResolvedValueOnce({
      config: {},
      etag: '"0000000000000002"',
      replayed: true,
    });
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(
      () => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1),
      FULL_SUITE_WAIT_OPTIONS
    );
    await waitFor(
      () => expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2'),
      FULL_SUITE_WAIT_OPTIONS
    );
    expect(fundStore.getState().needsServerHydration).toBe(true);
  });

  it('reuses an existing authoritative draft identity and skips redundant create/save work', async () => {
    fundStore.setState({ draftFundId: 77, draftServerReady: true });

    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().draftServerReady).toBe(true);
  });

  it('blocks navigation and draft writes when required basics are incomplete', async () => {
    fundStore.setState({ fundName: '', fundSize: undefined, modelInputsAsOfDate: undefined });

    render(<FundBasicsStep />);

    await clickNextStep();

    expect(screen.getByText('Complete all required fund basics before continuing.')).toHaveRole(
      'alert'
    );
    expect(screen.getByTestId('fund-name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Capital Committed/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('model-inputs-as-of-date')).toHaveAttribute('aria-invalid', 'true');
    expect(mockCreateFund).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each([null, 77])(
    'never dispatches without durable command storage (fund %s)',
    async (fundId) => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });
      fundStore.setState({ draftFundId: fundId });
      render(<FundBasicsStep />);
      await clickNextStep();
      expect(await screen.findByRole('alert')).toHaveTextContent('Storage is unavailable');
      expect(mockCreateFund).not.toHaveBeenCalled();
      expect(mockSaveFundDraft).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(fundStore.getState().persistenceFailed).toBe(true);
      // Never stored, never dispatched: nothing is left pending.
      expect(fundStore.getState().pendingCommand).toBeNull();
    }
  );

  it('replays the original creation after a lost response despite changed local fields', async () => {
    mockCreateFund.mockRejectedValueOnce(new FundWorkflowUncertainError('Lost response', false));
    const view = render(<FundBasicsStep />);
    await clickNextStep();
    await screen.findByRole('alert');
    const original = mockCreateFund.mock.calls[0];
    act(() => fundStore.setState({ fundName: 'Changed after timeout' }));
    view.unmount();
    render(<FundBasicsStep />);
    await clickNextStep();
    expect(mockCreateFund.mock.calls[1]).toEqual(original);
    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ fundName: 'Changed after timeout' }),
      expect.any(Object)
    );
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
  });

  it('replays a recovered creation without saving placeholder draft values', async () => {
    fundStore.setState({
      needsServerHydration: true,
      pendingCommand: {
        operation: 'create',
        key: CREATION_KEY,
        targetFundId: null,
        expectedETag: null,
        bodySignature: JSON.stringify({
          name: 'Dispatched Fund',
          size: 25_000_000,
          managementFee: 0.02,
          carryPercentage: 0.2,
          vintageYear: 2026,
        }),
        dispatchedAt: new Date().toISOString(),
      },
    });
    render(<FundBasicsStep />);
    await clickNextStep();

    await waitFor(() => expect(mockCreateFund).toHaveBeenCalledTimes(1));
    expect(mockCreateFund).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dispatched Fund', size: 25_000_000 }),
      { idempotencyKey: CREATION_KEY }
    );
    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().needsServerHydration).toBe(true);
  });

  it('allows a corrected creation after a recovered command is definitively rejected', async () => {
    fundStore.setState({
      needsServerHydration: true,
      pendingCommand: {
        operation: 'create',
        key: CREATION_KEY,
        targetFundId: null,
        expectedETag: null,
        bodySignature: JSON.stringify({ name: 'Rejected Fund' }),
        dispatchedAt: new Date().toISOString(),
      },
    });
    mockCreateFund.mockRejectedValueOnce(new ApiError(400, 'Invalid fund basics'));
    render(<FundBasicsStep />);

    await clickNextStep();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid fund basics'));
    expect(fundStore.getState().pendingCommand).toBeNull();
    expect(fundStore.getState().needsServerHydration).toBe(false);

    await clickNextStep();
    await waitFor(() => expect(mockCreateFund).toHaveBeenCalledTimes(2));
    expect(mockCreateFund).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Bootstrap Fund' }),
      expect.any(Object)
    );
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
  });

  it('stays on step 1 and shows an error when bootstrap creation fails', async () => {
    mockCreateFund.mockRejectedValueOnce(new ApiError(400, 'Bootstrap create failed'));

    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Bootstrap create failed');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('saves edits made during bootstrap before advancing to step 2', async () => {
    let finishSave!: (value: unknown) => void;
    mockSaveFundDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        })
    );
    render(<FundBasicsStep />);
    await clickNextStep();
    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
    act(() => fundStore.setState({ fundName: 'Newer edit' }));
    await act(async () => {
      finishSave({ config: {}, etag: '"new-revision"', replayed: false });
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().draftServerReady).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('Save the newer changes');
    await clickNextStep();
    expect(mockSaveFundDraft).toHaveBeenLastCalledWith(
      42,
      expect.objectContaining({ fundName: 'Newer edit' }),
      expect.objectContaining({ etag: '"new-revision"' })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=2');
  });

  it('stays on step 1 and shows an error when authoritative draft save fails', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(new ApiError(400, 'Draft save failed'));

    render(<FundBasicsStep />);

    await clickNextStep();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Draft save failed');
    }, FULL_SUITE_WAIT_OPTIONS);

    expect(mockCreateFund).toHaveBeenCalledTimes(1);
    expect(fundStore.getState().draftFundId).toBe(42);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
