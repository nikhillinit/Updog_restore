import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fundStore, resetFundWorkspace, bindFundWorkspaceActor } from '@/stores/fundStore';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';

const mockNavigate = vi.fn();
const mockSearch = { value: '' };
vi.mock('wouter', () => ({
  useLocation: () => ['/dashboard', mockNavigate],
  useSearch: () => mockSearch.value,
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({ useFlag: () => false }));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const mockFetchFundDraft = vi.fn();
const mockSaveFundDraft = vi.fn();
vi.mock('@/services/fund-drafts', () => ({
  fetchFundDraft: (...args: unknown[]) => mockFetchFundDraft(...args),
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

import { FundWorkspace } from '@/components/workspace/FundWorkspace';

const FUNDS = [
  {
    id: 1,
    name: 'Example Fund I',
    size: 25_000_000,
    deployedCapital: 0,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2025,
    status: 'active',
    engineResults: null,
    createdAt: null,
    establishmentDate: null,
    isActive: true,
  },
  {
    id: 2,
    name: 'Example Fund II',
    size: 50_000_000,
    deployedCapital: 0,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2026,
    status: 'active',
    engineResults: null,
    createdAt: null,
    establishmentDate: null,
    isActive: true,
  },
];

function stateFor(fundId: number, overrides: Record<string, unknown> = {}) {
  const published = fundId === 1;
  return {
    fundId,
    configState: {
      latestVersion: 1,
      draftVersion: published ? null : 1,
      publishedVersion: published ? 1 : null,
      hasDraft: !published,
      hasPublished: published,
      publishedAt: published ? '2026-01-01T00:00:00.000Z' : null,
      draftUpdatedAt: published ? null : '2026-02-01T00:00:00.000Z',
      publishedUpdatedAt: null,
      ...overrides,
    },
    calculationState: {
      status: published ? 'ready' : 'not_requested',
      configVersion: published ? 1 : null,
      runId: null,
      correlationId: null,
      dispatchState: null,
      availableSnapshotTypes: [],
      expectedSnapshotTypes: [],
      lastCalculatedAt: null,
      lastError: null,
      legacyEvidence: false,
    },
    legacy: { engineResultsPresent: false },
  };
}

function renderWorkspace(
  selection: { kind: 'absent' } | { kind: 'valid'; id: number } | { kind: 'invalid' } = {
    kind: 'absent',
  }
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FundWorkspace selection={selection} />
    </QueryClientProvider>
  );
}

describe('FundWorkspace', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    mockNavigate.mockReset();
    mockSearch.value = '';
    mockFetchFundDraft.mockReset();
    mockSaveFundDraft.mockReset();
    mockApiRequest.mockReset().mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/funds') return FUNDS;
      const match = /\/api\/funds\/(\d+)\/state/.exec(url);
      if (match) return stateFor(Number(match[1]));
      throw new Error(`unexpected ${url}`);
    });
    await bindFundWorkspaceActor('u1', 'partner');
    resetFundWorkspace();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('lists funds with lifecycle truth from the state read and the matching actions', async () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Fund workspace' })).toBeInTheDocument();
    const rowOne = await screen.findByTestId('workspace-fund-1');
    await waitFor(() => expect(within(rowOne).getByText('Published')).toBeInTheDocument());
    expect(within(rowOne).getByText('Results ready')).toBeInTheDocument();
    expect(within(rowOne).getByRole('button', { name: 'Open model' })).toBeInTheDocument();
    expect(within(rowOne).queryByRole('button', { name: 'Resume Draft' })).not.toBeInTheDocument();

    const rowTwo = screen.getByTestId('workspace-fund-2');
    await waitFor(() => expect(within(rowTwo).getByText('Draft')).toBeInTheDocument());
    expect(within(rowTwo).getByText('Calculations not requested')).toBeInTheDocument();
    expect(within(rowTwo).queryByRole('button', { name: 'Open model' })).not.toBeInTheDocument();
    expect(within(rowTwo).queryByRole('button', { name: 'Analytics' })).not.toBeInTheDocument();

    await userEvent.click(within(rowTwo).getByRole('button', { name: 'Resume Draft' }));
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?fundId=2&step=1');

    await userEvent.click(within(rowOne).getByRole('button', { name: 'Open model' }));
    expect(mockNavigate).toHaveBeenCalledWith('/fund-model-results/1');

    await userEvent.click(within(rowOne).getByRole('button', { name: 'Analytics' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard?tab=overview&fundId=1');
  });

  it('labels a published fund with draft changes and never infers Archived or Active', async () => {
    mockApiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/funds') return [{ ...FUNDS[0], isActive: false, status: 'active' }];
      return stateFor(1, { hasDraft: true, draftVersion: 2 });
    });
    renderWorkspace();

    const row = await screen.findByTestId('workspace-fund-1');
    await waitFor(() =>
      expect(within(row).getByText('Published; draft changes available')).toBeInTheDocument()
    );
    expect(within(row).getByRole('button', { name: 'Open model' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Resume Draft' })).toBeInTheDocument();
    expect(screen.queryByText(/archived/i)).not.toBeInTheDocument();
  });

  it('preserves demo mode when opening fund analytics', async () => {
    mockSearch.value = 'demo=gp';
    renderWorkspace();

    const row = await screen.findByTestId('workspace-fund-1');
    await userEvent.click(within(row).getByRole('button', { name: 'Analytics' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard?tab=overview&fundId=1&demo=gp');
  });

  it('preserves demo mode when selecting a fund', async () => {
    const user = userEvent.setup();
    Object.defineProperties(HTMLElement.prototype, {
      hasPointerCapture: { configurable: true, value: () => false },
      setPointerCapture: { configurable: true, value: () => undefined },
      releasePointerCapture: { configurable: true, value: () => undefined },
      scrollIntoView: { configurable: true, value: () => undefined },
    });
    mockSearch.value = 'demo=gp';
    renderWorkspace();

    await user.click(await screen.findByRole('combobox', { name: 'Viewing fund' }));
    await user.click(await screen.findByRole('option', { name: 'Example Fund II' }));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard?fundId=2&demo=gp');
  });

  it('shows an honest unavailable status with a retry when the state read fails', async () => {
    const { ApiError } = await import('@/lib/queryClient');
    mockApiRequest.mockImplementation(async (_method: string, url: string) => {
      if (url === '/api/funds') return [FUNDS[0]];
      throw new ApiError(403, 'forbidden');
    });
    renderWorkspace();

    const row = await screen.findByTestId('workspace-fund-1');
    await waitFor(() =>
      expect(within(row).getByText('Status unavailable for your role')).toBeInTheDocument()
    );
    expect(within(row).getByRole('button', { name: 'Retry status' })).toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Open model' })).not.toBeInTheDocument();
  });

  it('hides write actions for a read-only role', async () => {
    await bindFundWorkspaceActor('u1', 'analyst');
    renderWorkspace();

    await screen.findByTestId('workspace-fund-2');
    expect(screen.queryByTestId('workspace-new-fund')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-read-only')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Resume Draft' })).not.toBeInTheDocument()
    );
  });

  it('flags an unavailable selection without substituting another fund', async () => {
    renderWorkspace({ kind: 'invalid' });
    expect(await screen.findByTestId('workspace-selection-unavailable')).toBeInTheDocument();
  });

  it('shows the empty state with New Fund for an empty account', async () => {
    mockApiRequest.mockImplementation(async () => []);
    renderWorkspace();

    expect(await screen.findByTestId('workspace-empty')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    expect(fundStore.getState().creationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=1');
  });

  it('offers Resume Draft for the local session and asks before starting another fund', async () => {
    fundStore.setState({
      fundName: 'Local Draft',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'saving',
    });
    renderWorkspace();

    expect(await screen.findByTestId('workspace-resume-draft')).toHaveTextContent('Local Draft');
    await userEvent.click(screen.getByTestId('workspace-new-fund'));

    const dialog = await screen.findByRole('dialog', { name: 'Start another fund?' });
    expect(dialog).toHaveTextContent(
      'Save changes to Local Draft before starting a separate fund.'
    );

    mockSaveFundDraft.mockRejectedValueOnce(new Error('Could not save changes'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not confirm the save')
    );
    expect(fundStore.getState().fundName).toBe('Local Draft');
    expect(mockNavigate).not.toHaveBeenCalled();

    mockSaveFundDraft.mockResolvedValueOnce({
      config: {},
      etag: '"0000000000000002"',
      replayed: false,
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=1'));
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(fundStore.getState().fundName).toBeUndefined();
  });

  it('preserves an unnamed pre-create wizard session when starting another fund', async () => {
    fundStore.setState({
      creationKey: null,
      fundName: undefined,
      fundSize: 25_000_000,
    });
    renderWorkspace();

    await userEvent.click(screen.getByTestId('workspace-new-fund'));

    expect(await screen.findByRole('dialog', { name: 'Start another fund?' })).toBeInTheDocument();
    expect(fundStore.getState().fundSize).toBe(25_000_000);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps the preservation dialog and local values when command storage fails', async () => {
    fundStore.setState({
      fundName: 'Local Draft',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'error',
    });
    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Storage is unavailable');
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().fundName).toBe('Local Draft');
  });

  it('never discards an unresolved creation when starting another fund', async () => {
    fundStore.setState({
      fundName: 'Uncertain creation',
      pendingCommand: {
        operation: 'create',
        key: crypto.randomUUID(),
        targetFundId: null,
        bodySignature: '{}',
        expectedETag: null,
        dispatchedAt: new Date().toISOString(),
      },
    });
    const original = fundStore.getState().pendingCommand;
    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Discard and start new' })).toBeDisabled();
    expect(fundStore.getState().pendingCommand).toEqual(original);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('preserves a newer command when an old workspace save rejects', async () => {
    const { ApiError } = await import('@/lib/queryClient');
    fundStore.setState({
      fundName: 'Local Draft',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'error',
    });
    let rejectOld!: (error: unknown) => void;
    mockSaveFundDraft.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    const view = renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
    const old = fundStore.getState().pendingCommand!;
    view.unmount();

    // Wizard replay settles A, then starts B before the original request A completes.
    fundStore.getState().resolveCommand();
    const newerKey = crypto.randomUUID();
    fundStore.getState().beginCommand({
      operation: old.operation,
      targetFundId: old.targetFundId,
      key: newerKey,
      expectedETag: '"0000000000000002"',
      bodySignature: '{"fundName":"Newer edits"}',
    });
    await act(async () => {
      rejectOld(new ApiError(412, 'Old revision', 'STALE_REVISION'));
      await Promise.resolve();
    });
    expect(fundStore.getState().pendingCommand?.key).toBe(newerKey);
  });

  it('does not show an old rejection while a newer command owns the mounted dialog', async () => {
    const { ApiError } = await import('@/lib/queryClient');
    fundStore.setState({
      fundName: 'Local Draft',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'error',
    });
    let rejectOld!: (error: unknown) => void;
    mockSaveFundDraft.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    );
    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    const saveButton = within(dialog).getByRole('button', { name: 'Save draft and start new' });
    await userEvent.click(saveButton);
    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
    const old = fundStore.getState().pendingCommand!;
    fundStore.getState().resolveCommand();
    const newerKey = crypto.randomUUID();
    fundStore.getState().beginCommand({
      operation: old.operation,
      targetFundId: old.targetFundId,
      key: newerKey,
      expectedETag: '"0000000000000002"',
      bodySignature: '{"fundName":"Newer edits"}',
    });
    await act(async () => {
      rejectOld(new ApiError(412, 'Old revision', 'STALE_REVISION'));
    });
    expect(within(dialog).queryByRole('alert')?.textContent ?? '').not.toContain('Old revision');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toMatchObject({
      key: newerKey,
      expectedETag: '"0000000000000002"',
    });
    expect(saveButton).toBeEnabled();
  });

  it('does not reset a replacement session queued after the save resolves', async () => {
    fundStore.setState({ fundName: 'Local Draft', draftFundId: 2, draftServerReady: true });
    let finishSave!: (value: unknown) => void;
    mockSaveFundDraft.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSave = resolve;
        })
    );
    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishSave({ config: {}, etag: '"0000000000000002"', replayed: false });
      Promise.resolve().then(() => {
        fundStore.getState().startNewFundSession();
        fundStore.setState({ fundName: 'Fund B', draftFundId: 3 });
      });
    });
    expect(fundStore.getState()).toMatchObject({ fundName: 'Fund B', draftFundId: 3 });
    expect(mockNavigate.mock.calls.filter(([path]) => path === '/fund-setup?step=1')).toHaveLength(
      1
    );
  });

  it.each([
    ['reordered', false],
    ['changed', true],
  ])('handles a recovered %s allocation without losing its replay', async (_case, changed) => {
    fundStore.setState({ fundName: 'Local Draft', draftFundId: 2, draftServerReady: true });
    const payload = fundStoreToDraftWriteV1(fundStore.getState(), {
      includeEconomicsAssumptions: false,
    });
    const [allocation, ...remaining] = payload.capitalPlanAllocations!;
    const reordered = Object.fromEntries(
      Object.entries(allocation!).reverse()
    ) as typeof allocation;
    const originalBody = {
      ...payload,
      capitalPlanAllocations: [
        {
          ...reordered,
          ...(changed ? { capitalAllocationPct: allocation!.capitalAllocationPct + 1 } : {}),
        },
        ...remaining,
      ],
    };
    if (changed) {
      expect(originalBody).not.toEqual(payload);
    } else {
      expect(originalBody).toEqual(payload);
      expect(JSON.stringify(originalBody)).not.toBe(JSON.stringify(payload));
    }
    const key = crypto.randomUUID();
    fundStore.setState({
      draftETag: '"0000000000000001"',
      pendingCommand: {
        operation: 'save_draft',
        key,
        targetFundId: 2,
        bodySignature: JSON.stringify(originalBody),
        expectedETag: '"0000000000000001"',
        dispatchedAt: new Date().toISOString(),
      },
    });
    mockSaveFundDraft.mockResolvedValue({
      config: {},
      etag: '"0000000000000002"',
      replayed: true,
    });
    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() => expect(mockSaveFundDraft).toHaveBeenCalledTimes(1));
    expect(mockSaveFundDraft).toHaveBeenCalledWith(2, originalBody, {
      key,
      etag: '"0000000000000001"',
    });
    if (changed) {
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Save the newer changes');
      expect(mockNavigate).not.toHaveBeenCalled();
    } else {
      expect(within(dialog).queryByRole('alert')?.textContent ?? '').not.toContain(
        'Save the newer changes'
      );
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=1'));
    }
  });

  it('replays and hydrates an identity-only recovered save before starting another fund', async () => {
    const key = crypto.randomUUID();
    fundStore.setState({
      fundName: 'Placeholder',
      draftFundId: 2,
      draftServerReady: true,
      draftETag: '"0000000000000001"',
      draftSyncStatus: 'uncertain',
      needsServerHydration: true,
      pendingCommand: {
        operation: 'save_draft',
        key,
        targetFundId: 2,
        bodySignature: '{"fundName":"Dispatched draft"}',
        expectedETag: '"0000000000000001"',
        dispatchedAt: new Date().toISOString(),
      },
    });
    mockSaveFundDraft.mockResolvedValue({
      config: {},
      etag: '"0000000000000002"',
      replayed: true,
    });
    mockFetchFundDraft
      .mockRejectedValueOnce(new Error('Recovery read failed'))
      .mockResolvedValueOnce({
        config: { fundName: 'Dispatched draft' },
        etag: '"0000000000000002"',
      });

    renderWorkspace();
    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));
    await waitFor(() => expect(mockFetchFundDraft).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(dialog).getByRole('alert')).toHaveTextContent(
        'Draft saved. Could not refresh the latest draft before starting a new fund; try again.'
      )
    );
    expect(within(dialog).getByRole('alert')).not.toHaveTextContent('Could not confirm the save');
    expect(fundStore.getState().needsServerHydration).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save draft and start new' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=1'));
    expect(mockSaveFundDraft).toHaveBeenCalledTimes(1);
    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      2,
      { fundName: 'Dispatched draft' },
      { key, etag: '"0000000000000001"' }
    );
    expect(mockFetchFundDraft).toHaveBeenCalledTimes(2);
    expect(mockFetchFundDraft).toHaveBeenCalledWith(2);
    expect(fundStore.getState().needsServerHydration).toBe(false);
  });

  it('asks before starting another fund when a restored session is only idle', async () => {
    fundStore.setState({
      fundName: 'Restored edits',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'idle',
    });
    renderWorkspace();
    await screen.findByTestId('workspace-fund-2');

    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    expect(await screen.findByRole('dialog', { name: 'Start another fund?' })).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(fundStore.getState().fundName).toBe('Restored edits');
  });

  it('starts a new fund directly when the local session is settled', async () => {
    fundStore.setState({
      fundName: 'Settled',
      draftFundId: 2,
      draftServerReady: true,
      draftSyncStatus: 'synced',
    });
    renderWorkspace();
    await screen.findByTestId('workspace-fund-2');

    await userEvent.click(screen.getByTestId('workspace-new-fund'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/fund-setup?step=1');
    expect(fundStore.getState().draftFundId).toBeNull();
  });
});
