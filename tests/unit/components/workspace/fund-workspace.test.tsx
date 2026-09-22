import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fundStore, resetFundWorkspace, bindFundWorkspaceActor } from '@/stores/fundStore';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/dashboard', mockNavigate],
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({ useFlag: () => false }));

const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

const mockSaveFundDraft = vi.fn();
vi.mock('@/services/fund-drafts', () => ({
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
