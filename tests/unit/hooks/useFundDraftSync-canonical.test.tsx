import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { useFundDraftSync } from '@/hooks/useFundDraftSync';
import { clearDraftSaveAcknowledgement } from '@/services/fund-draft-settlement';
import {
  bindFundWorkspaceActor,
  FUND_WORKSPACE_STORAGE_KEY,
  fundStore,
  toFundWorkspaceEnvelope,
  unbindFundWorkspaceActor,
} from '@/stores/fundStore';

const { mockFetchFundDraft, mockSaveFundDraft } = vi.hoisted(() => ({
  mockFetchFundDraft: vi.fn(),
  mockSaveFundDraft: vi.fn(),
}));

vi.mock('@/hooks/useUnifiedFlag', () => ({
  useFlag: () => false,
}));

vi.mock('@/services/fund-drafts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fund-drafts')>()),
  fetchFundDraft: (...args: unknown[]) => mockFetchFundDraft(...args),
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

const SERVER_ETAG = '"0000000000000001"';
let retryDraftSync = () => {};

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, field]) => [key, reverseObjectKeys(field)])
  );
}

function Harness() {
  const { status, error, retry } = useFundDraftSync({ stepKey: '1', debounceMs: 25 });
  retryDraftSync = retry;
  return (
    <>
      <output aria-label="Draft sync status">{status}</output>
      <output aria-label="Draft sync error">{error}</output>
    </>
  );
}

describe('useFundDraftSync canonical snapshot equality', () => {
  beforeEach(() => {
    clearDraftSaveAcknowledgement();
    vi.useFakeTimers();
    mockFetchFundDraft.mockReset();
    mockSaveFundDraft.mockReset();
    unbindFundWorkspaceActor();
    localStorage.clear();
    sessionStorage.clear();

    const initialState = fundStore.getInitialState();
    fundStore.setState(
      {
        ...initialState,
        hydrated: true,
        draftFundId: 42,
        draftServerReady: true,
        draftETag: SERVER_ETAG,
        draftSyncStatus: 'synced',
        fundName: 'Canonical Fund',
        followOnChecks: { A: 1, B: 2, C: 3 },
      },
      true
    );

    const localPayload = fundStoreToDraftWriteV1(fundStore.getState());
    const reorderedPayload = reverseObjectKeys(localPayload) as typeof localPayload;
    expect(reorderedPayload.stages).toEqual(localPayload.stages);
    expect(Object.keys(reorderedPayload.followOnChecks!)).toEqual(['C', 'B', 'A']);
    expect(reorderedPayload.followOnChecks).toEqual(localPayload.followOnChecks);
    expect(JSON.stringify(reorderedPayload)).not.toBe(JSON.stringify(localPayload));
    mockFetchFundDraft.mockResolvedValue({ config: reorderedPayload, etag: SERVER_ETAG });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a confirmed save synced when it settles before the pending render effect', async () => {
    fundStore.getState().beginCommand({
      operation: 'save_draft',
      key: crypto.randomUUID(),
      targetFundId: 42,
      expectedETag: SERVER_ETAG,
      bodySignature: JSON.stringify(fundStoreToDraftWriteV1(fundStore.getState())),
    });

    function ConfirmSave() {
      React.useLayoutEffect(() => {
        fundStore.getState().resolveCommand();
        fundStore.getState().setDraftSyncStatus('synced');
      }, []);
      return null;
    }

    render(
      <>
        <Harness />
        <ConfirmSave />
      </>
    );

    await act(async () => Promise.resolve());

    expect(screen.getByLabelText('Draft sync status')).toHaveTextContent('synced');
    expect(screen.getByLabelText('Draft sync error')).toBeEmptyDOMElement();
  });

  it.each(['session', 'draft'] as const)(
    'ignores a captured pending save after its %s changes before effects',
    (ownership) => {
      fundStore.getState().beginCommand({
        operation: 'save_draft',
        key: crypto.randomUUID(),
        targetFundId: 42,
        expectedETag: SERVER_ETAG,
        bodySignature: JSON.stringify(fundStoreToDraftWriteV1(fundStore.getState())),
      });

      function ReplaceOwnership() {
        React.useLayoutEffect(() => {
          fundStore.setState({
            sessionId:
              ownership === 'session' ? crypto.randomUUID() : fundStore.getState().sessionId,
            draftFundId: ownership === 'draft' ? 43 : 42,
            draftServerReady: false,
            pendingCommand: null,
            draftSyncStatus: 'synced',
          });
        }, []);
        return null;
      }

      render(
        <>
          <Harness />
          <ReplaceOwnership />
        </>
      );

      expect(screen.getByLabelText('Draft sync status')).toHaveTextContent('synced');
      expect(screen.getByLabelText('Draft sync error')).toBeEmptyDOMElement();
      expect(mockFetchFundDraft).not.toHaveBeenCalled();
    }
  );

  it('still reports an unresolved restored save as uncertain', () => {
    fundStore.getState().beginCommand({
      operation: 'save_draft',
      key: crypto.randomUUID(),
      targetFundId: 42,
      expectedETag: SERVER_ETAG,
      bodySignature: JSON.stringify(fundStoreToDraftWriteV1(fundStore.getState())),
    });

    render(<Harness />);

    expect(screen.getByLabelText('Draft sync status')).toHaveTextContent('uncertain');
    expect(screen.getByLabelText('Draft sync error')).toHaveTextContent(
      'Could not confirm the save; it may have completed'
    );
    expect(mockFetchFundDraft).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('does not PUT when server JSONB only reordered nested object keys', async () => {
    render(<Harness />);

    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(mockFetchFundDraft).toHaveBeenCalledWith(42);
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('autosaves the first edit after hydrating a draft without a local ETag', async () => {
    fundStore.setState({ draftETag: null });
    mockSaveFundDraft.mockResolvedValue({ config: {}, etag: SERVER_ETAG, replayed: false });

    render(<Harness />);

    await act(async () => {
      await Promise.resolve();
    });
    act(() => fundStore.setState({ fundName: 'First edit after hydration' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });

    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ fundName: 'First edit after hydration' }),
      expect.objectContaining({ etag: SERVER_ETAG })
    );
  });

  it('does not save default values after replaying a command from an identity-only recovery', async () => {
    unbindFundWorkspaceActor();
    const actorId = 'draft-sync-actor';
    const originalPayload = fundStoreToDraftWriteV1({
      ...fundStore.getState(),
      fundName: 'Dispatched fund name',
      fundSize: 25_000_000,
    });
    const envelope = {
      ...toFundWorkspaceEnvelope(fundStore.getState()),
      workspaceActorId: actorId,
      draftFundId: 42,
      draftServerReady: true,
      draftETag: SERVER_ETAG,
      fundSize: null,
      pendingCommand: {
        operation: 'save_draft' as const,
        key: crypto.randomUUID(),
        targetFundId: 42,
        expectedETag: SERVER_ETAG,
        bodySignature: JSON.stringify(originalPayload),
        dispatchedAt: new Date().toISOString(),
      },
    };
    sessionStorage.setItem(
      FUND_WORKSPACE_STORAGE_KEY,
      JSON.stringify({ state: envelope, version: 1 })
    );
    await bindFundWorkspaceActor(actorId);
    expect(fundStore.getState().needsServerHydration).toBe(true);
    mockSaveFundDraft.mockResolvedValue({ config: {}, etag: SERVER_ETAG, replayed: true });

    render(<Harness />);
    await act(async () => retryDraftSync());

    expect(mockSaveFundDraft).toHaveBeenCalledTimes(1);
    expect(mockFetchFundDraft).toHaveBeenCalledWith(42);
    expect(fundStore.getState().needsServerHydration).toBe(false);
    expect(mockSaveFundDraft).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ fundName: 'Dispatched fund name', fundSize: 25_000_000 }),
      expect.objectContaining({ etag: SERVER_ETAG })
    );
  });

  it.each([false, true])(
    'hydrates identity-only recovery without a pending command when server-ready is %s',
    async (draftServerReady) => {
      unbindFundWorkspaceActor();
      const actorId = 'draft-sync-actor';
      const serverPayload = fundStoreToDraftWriteV1({
        ...fundStore.getState(),
        fundName: 'Server fund name',
        fundSize: 25_000_000,
      });
      const envelope = {
        ...toFundWorkspaceEnvelope(fundStore.getState()),
        workspaceActorId: actorId,
        draftFundId: 42,
        draftServerReady,
        draftETag: SERVER_ETAG,
        fundSize: null,
        pendingCommand: null,
      };
      sessionStorage.setItem(
        FUND_WORKSPACE_STORAGE_KEY,
        JSON.stringify({ state: envelope, version: 1 })
      );
      await bindFundWorkspaceActor(actorId);
      expect(fundStore.getState().needsServerHydration).toBe(true);
      mockFetchFundDraft.mockResolvedValue({ config: serverPayload, etag: SERVER_ETAG });
      mockSaveFundDraft.mockResolvedValue({ config: {}, etag: SERVER_ETAG, replayed: false });

      render(<Harness />);
      await act(async () => {
        await Promise.resolve();
        await vi.advanceTimersByTimeAsync(30);
      });

      expect(mockFetchFundDraft).toHaveBeenCalledWith(42);
      expect(mockSaveFundDraft).not.toHaveBeenCalled();
      expect(fundStore.getState().needsServerHydration).toBe(false);
    }
  );
});
