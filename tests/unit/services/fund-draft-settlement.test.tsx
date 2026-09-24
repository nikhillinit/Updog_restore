import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindFundWorkspaceActor,
  FUND_COMMAND_STORAGE_MESSAGE,
  FUND_DRAFT_HYDRATION_MESSAGE,
  fundStore,
  resetFundWorkspace,
  unbindFundWorkspaceActor,
} from '@/stores/fundStore';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import { ApiError } from '@/lib/queryClient';
import { FundWorkflowUncertainError } from '@/services/fund-workflow';
import { canonicalJson } from '@shared/lib/canonical-json-serialization';
import {
  applyDraftSnapshot,
  saveDraftAndSettle,
  type DraftSaveOutcome,
} from '@/services/fund-draft-settlement';

const mockSaveFundDraft = vi.fn();
vi.mock('@/services/fund-drafts', () => ({
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
  fetchFundDraft: vi.fn(),
  isMissingDraftError: vi.fn(),
}));

const options = { includeEconomicsAssumptions: false };
const onOutcome = vi.fn<(outcome: DraftSaveOutcome) => void>();
const nextETag = '"0000000000000002"';

function save() {
  return saveDraftAndSettle(9, options, onOutcome);
}

function outcome() {
  expect(onOutcome).toHaveBeenCalledTimes(1);
  return onOutcome.mock.calls[0]![0];
}

function pendingCommand(operation: 'save_draft' | 'create' = 'save_draft', bodySignature?: string) {
  const command = {
    operation,
    targetFundId: operation === 'create' ? null : 9,
    key: crypto.randomUUID(),
    expectedETag: '"0000000000000001"',
    bodySignature:
      bodySignature ?? JSON.stringify(fundStoreToDraftWriteV1(fundStore.getState(), options)),
  };
  fundStore.getState().beginCommand(command);
  return command;
}

function holdTransport() {
  let resolve!: (value: { config: { fundName: string }; etag?: string; replayed: boolean }) => void;
  let reject!: (error: unknown) => void;
  mockSaveFundDraft.mockImplementationOnce(
    () =>
      new Promise((resolveSave, rejectSave) => {
        resolve = resolveSave;
        reject = rejectSave;
      })
  );
  return {
    resolve: (value: ReturnType<typeof savedResult>) => resolve(value),
    reject: (error: unknown) => reject(error),
  };
}

function savedResult(etag = nextETag) {
  return { config: { fundName: 'Local' }, etag, replayed: false };
}

describe('fund draft command settlement', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await bindFundWorkspaceActor('settlement-user');
    resetFundWorkspace();
    fundStore.setState({
      hydrated: true,
      fundName: 'Local',
      draftFundId: 9,
      draftETag: '"0000000000000001"',
      draftServerReady: true,
    });
    mockSaveFundDraft.mockReset().mockResolvedValue(savedResult());
    onOutcome.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    unbindFundWorkspaceActor();
    sessionStorage.clear();
  });

  it('saves without newer edits and advances the revision', async () => {
    await save();
    const payload = mockSaveFundDraft.mock.calls[0]![1];
    expect(outcome()).toEqual({
      kind: 'saved',
      dispatchedSignature: canonicalJson(payload),
      newerEdits: false,
      needsHydration: false,
    });
    expect(fundStore.getState()).toMatchObject({ draftETag: nextETag, pendingCommand: null });
  });

  it('detects newer edits while the transport is pending', async () => {
    const transport = holdTransport();
    const saving = save();
    fundStore.setState({ fundName: 'Newer' });
    transport.resolve(savedResult());
    await saving;
    expect(outcome()).toMatchObject({ kind: 'saved', newerEdits: true });
  });

  it('reports hydration needed for a confirmed recovered save', async () => {
    pendingCommand();
    fundStore.setState({ needsServerHydration: true });
    await save();
    expect(outcome()).toMatchObject({ kind: 'saved', needsHydration: true });
  });

  it('resolves a stale command with the server message', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(
      new ApiError(412, 'Server says stale', 'STALE_REVISION')
    );
    await save();
    expect(outcome()).toEqual({ kind: 'stale', message: 'Server says stale' });
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it('keeps the key when the result is uncertain', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(new FundWorkflowUncertainError('lost', false));
    await save();
    expect(outcome()).toEqual({ kind: 'uncertain', message: 'lost' });
    expect(fundStore.getState().pendingCommand?.key).toBe(mockSaveFundDraft.mock.calls[0]![2].key);
  });

  it('keeps the key when the server asks to retry the same command', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(
      new ApiError(409, 'Retry command', 'REQUEST_IN_PROGRESS')
    );
    await save();
    expect(outcome()).toEqual({ kind: 'retry_same_key', message: 'Retry command' });
    expect(fundStore.getState().pendingCommand?.key).toBe(mockSaveFundDraft.mock.calls[0]![2].key);
  });

  it('resolves a definitive rejection', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(new ApiError(400, 'Bad draft'));
    await save();
    expect(outcome()).toEqual({ kind: 'rejected', message: 'Bad draft', missingDraft: false });
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it('reports a missing active draft on rejection', async () => {
    mockSaveFundDraft.mockRejectedValueOnce(
      new ApiError(404, 'No active draft', 'NO_ACTIVE_DRAFT')
    );
    await save();
    expect(outcome()).toEqual({ kind: 'rejected', message: 'No active draft', missingDraft: true });
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it('supersedes a save after a session reset', async () => {
    const transport = holdTransport();
    const saving = save();
    fundStore.getState().startNewFundSession();
    const revision = fundStore.getState().draftETag;
    transport.resolve(savedResult());
    await saving;
    expect(outcome()).toEqual({ kind: 'superseded' });
    expect(fundStore.getState().draftETag).toBe(revision);
  });

  it('supersedes a save when the draft id changes without changing session', async () => {
    const transport = holdTransport();
    const saving = save();
    const sessionId = fundStore.getState().sessionId;
    fundStore.setState({ draftFundId: 10 });
    transport.resolve(savedResult());
    await saving;
    expect(outcome()).toEqual({ kind: 'superseded' });
    expect(fundStore.getState().sessionId).toBe(sessionId);
    expect(fundStore.getState().draftETag).toBe('"0000000000000001"');
  });

  it('does not settle a newer key after an old success', async () => {
    const transport = holdTransport();
    const saving = save();
    fundStore.getState().resolveCommand();
    const newer = pendingCommand('save_draft', '{"fundName":"Newer"}');
    transport.resolve(savedResult());
    await saving;
    expect(outcome()).toEqual({ kind: 'superseded' });
    expect(fundStore.getState().pendingCommand).toMatchObject({
      key: newer.key,
      expectedETag: newer.expectedETag,
    });
  });

  it('does not settle a newer key after an old failure', async () => {
    const transport = holdTransport();
    const saving = save();
    fundStore.getState().resolveCommand();
    const newer = pendingCommand('save_draft', '{"fundName":"Newer"}');
    transport.reject(new ApiError(412, 'Old revision', 'STALE_REVISION'));
    await saving;
    expect(outcome()).toEqual({ kind: 'superseded' });
    expect(fundStore.getState().pendingCommand).toMatchObject({
      key: newer.key,
      expectedETag: newer.expectedETag,
    });
  });

  it('refuses a foreign pending operation without releasing it', async () => {
    const pending = pendingCommand('create');
    await save();
    expect(outcome()).toMatchObject({ kind: 'not_dispatched' });
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toMatchObject(pending);
  });

  it('refuses a different fund without changing the journal', async () => {
    const pending = pendingCommand();
    await saveDraftAndSettle(10, options, onOutcome);
    expect(outcome()).toEqual({
      kind: 'not_dispatched',
      message: 'The draft changed before saving; try again.',
    });
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toMatchObject(pending);
  });

  it('refuses a fresh write until server hydration completes', async () => {
    fundStore.setState({ needsServerHydration: true });
    await save();
    expect(outcome()).toEqual({ kind: 'not_dispatched', message: FUND_DRAFT_HYDRATION_MESSAGE });
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it('releases a fresh undispatched command on storage failure', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fundStore.setState({ fundName: 'x' });
    await save();
    expect(outcome()).toEqual({ kind: 'not_dispatched', message: FUND_COMMAND_STORAGE_MESSAGE });
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toBeNull();
  });

  it('preserves a previously pending command on storage failure', async () => {
    const pending = pendingCommand();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    fundStore.setState({ fundName: 'x' });
    await save();
    expect(outcome()).toEqual({ kind: 'not_dispatched', message: FUND_COMMAND_STORAGE_MESSAGE });
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
    expect(fundStore.getState().pendingCommand).toMatchObject(pending);
  });

  it('settles and delivers the outcome before a later queued edit', async () => {
    const transport = holdTransport();
    const observed = vi.fn<(result: DraftSaveOutcome) => void>((result) => {
      expect(result).toMatchObject({ kind: 'saved', newerEdits: false });
      expect(fundStore.getState()).toMatchObject({
        fundName: 'Local',
        draftETag: nextETag,
        pendingCommand: null,
      });
    });
    const saving = saveDraftAndSettle(9, options, observed);
    transport.resolve(savedResult());
    Promise.resolve().then(() => fundStore.setState({ fundName: 'Late edit' }));
    await saving;
    expect(observed).toHaveBeenCalledTimes(1);
    expect(fundStore.getState().fundName).toBe('Late edit');
  });

  it('keeps the post-await store revision when transport omits its ETag', async () => {
    const transport = holdTransport();
    const saving = save();
    fundStore.getState().setDraftETag('"0000000000000003"');
    transport.resolve({ config: { fundName: 'Local' }, replayed: false });
    await saving;
    expect(outcome()).toMatchObject({ kind: 'saved' });
    expect(fundStore.getState().draftETag).toBe('"0000000000000003"');
  });

  it('uses a fixed fallback message for a non-Error transport failure', async () => {
    mockSaveFundDraft.mockRejectedValueOnce('failure');
    await save();
    expect(outcome()).toEqual({ kind: 'uncertain', message: 'Could not save changes' });
  });

  it('waits for an asynchronous outcome handler', async () => {
    let finish!: () => void;
    const handler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const saving = saveDraftAndSettle(9, options, handler);
    let settled = false;
    void saving.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    finish();
    await saving;
    expect(settled).toBe(true);
  });

  it('propagates a handler throw without reclassifying a settled save', async () => {
    const failure = new Error('handler failed');
    const handler = vi.fn(() => {
      throw failure;
    });
    await expect(saveDraftAndSettle(9, options, handler)).rejects.toBe(failure);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fundStore.getState()).toMatchObject({ draftETag: nextETag, pendingCommand: null });
  });

  it('replays the original pending body after nested keys reorder without newer edits', async () => {
    const { pending, bodySignature } = seedReorderedAllocation();
    await save();
    expect(JSON.stringify(mockSaveFundDraft.mock.calls[0]![1])).toBe(bodySignature);
    expect(mockSaveFundDraft.mock.calls[0]![2]).toEqual({
      key: pending.key,
      etag: pending.expectedETag,
    });
    expect(outcome()).toMatchObject({ kind: 'saved', newerEdits: false });
  });

  it('detects a changed nested value while still replaying the original body', async () => {
    const { pending, bodySignature } = seedReorderedAllocation();
    const allocation = fundStore.getState().capitalPlanAllocations[0]!;
    fundStore.setState({ capitalPlanAllocations: [{ ...allocation, capitalAllocationPct: 75 }] });
    await save();
    expect(JSON.stringify(mockSaveFundDraft.mock.calls[0]![1])).toBe(bodySignature);
    expect(mockSaveFundDraft.mock.calls[0]![2]).toEqual({
      key: pending.key,
      etag: pending.expectedETag,
    });
    expect(outcome()).toMatchObject({ kind: 'saved', newerEdits: true });
  });

  it('applies a server snapshot without touching the UI sync status', () => {
    pendingCommand();
    fundStore.setState({ draftSyncStatus: 'error', needsServerHydration: true });
    applyDraftSnapshot(9, { config: { fundName: 'Server' }, etag: '"e2"' });
    expect(fundStore.getState()).toMatchObject({
      draftFundId: 9,
      draftServerReady: true,
      needsServerHydration: false,
      draftETag: '"e2"',
      pendingCommand: null,
      fundName: 'Server',
      draftSyncStatus: 'error',
    });
  });

  it('delivers saved only after the ETag and journal have settled', async () => {
    const handler = vi.fn<(result: DraftSaveOutcome) => void>((result) => {
      expect(result.kind).toBe('saved');
      expect(fundStore.getState().draftETag).toBe(nextETag);
      expect(fundStore.getState().pendingCommand).toBeNull();
    });
    await saveDraftAndSettle(9, options, handler);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

function seedReorderedAllocation() {
  fundStore.setState({
    capitalPlanAllocations: [
      {
        id: 'cp1',
        name: 'Seed',
        entryRound: 'Seed',
        capitalAllocationPct: 100,
        initialCheckStrategy: 'amount',
        initialCheckAmount: 250_000,
        followOnStrategy: 'amount',
        followOnAmount: 100_000,
        followOnParticipationPct: 50,
        investmentHorizonMonths: 24,
      },
    ],
  });
  const current = fundStoreToDraftWriteV1(fundStore.getState(), options);
  const reversed = Object.fromEntries(
    Object.entries(current.capitalPlanAllocations![0]!).reverse()
  );
  const bodySignature = JSON.stringify({ ...current, capitalPlanAllocations: [reversed] });
  return { pending: pendingCommand('save_draft', bodySignature), bodySignature };
}
