import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindFundWorkspaceActor,
  FUND_WORKSPACE_ENVELOPE,
  FUND_WORKSPACE_STORAGE_KEY,
  fundCommandKey,
  fundStore,
  hasFundWorkspaceSession,
  prepareFundCommand,
  unbindFundWorkspaceActor,
  isFundWorkspaceEnvelope,
  resetFundWorkspace,
  toFundWorkspaceEnvelope,
} from '@/stores/fundStore';

const ACTOR = 'user-1';

function fullState() {
  return {
    fundName: 'Envelope Fund',
    establishmentDate: '2026-01-15',
    modelInputsAsOfDate: '2026-06-30',
    vintageYear: 2026,
    isEvergreen: false,
    fundLife: 10,
    investmentPeriod: 5,
    fundSize: 50_000_000,
    managementFeeRate: 2,
    carriedInterest: 20,
    gpCommitment: 1_000_000,
    fundedFromFeesPct: 0.25,
    lpClasses: [{ id: 'c1', name: 'Class A', targetAllocation: 100 }],
    lps: [{ id: 'lp1', name: 'LP One', commitment: 5_000_000, type: 'institutional' as const }],
    stages: [{ id: 's1', name: 'Seed', graduate: 30, exit: 20, months: 18 }],
    sectorProfiles: [{ id: 'sp1', name: 'FinTech', targetPercentage: 100, description: '' }],
    allocations: [{ id: 'a1', category: 'New', percentage: 100, description: '' }],
    followOnChecks: { A: 1, B: 2, C: 3 },
    capitalStageAllocations: [{ id: 'seed', label: 'Seed', pct: 100 }],
    capitalPlanAllocations: [
      {
        id: 'cp1',
        name: 'Seed',
        entryRound: 'Seed',
        capitalAllocationPct: 100,
        initialCheckStrategy: 'amount' as const,
        initialCheckAmount: 250_000,
        followOnStrategy: 'amount' as const,
        followOnAmount: 100_000,
        followOnParticipationPct: 50,
        investmentHorizonMonths: 24,
      },
    ],
    pipelineProfiles: [],
    waterfallType: 'american' as const,
    waterfallTiers: [{ id: 't1', name: 'Carry', gpSplit: 20, lpSplit: 80, preferredReturn: 8 }],
    recyclingEnabled: true,
    recyclingType: 'both' as const,
    recyclingCap: 10,
    recyclingPeriod: 4,
    exitRecyclingRate: 50,
    mgmtFeeRecyclingRate: 10,
    allowFutureRecycling: true,
    feeProfiles: [
      {
        id: 'fp1',
        name: 'Default',
        feeTiers: [
          {
            id: 'ft1',
            name: 'Mgmt',
            percentage: 2,
            feeBasis: 'committed_capital' as const,
            startMonth: 1,
          },
        ],
      },
    ],
    fundExpenses: [{ id: 'e1', category: 'Audit', monthlyAmount: 1_000, startMonth: 1 }],
    economicsAssumptions: undefined,
    draftFundId: 42,
    draftServerReady: true,
    draftETag: '"0000000000000007"',
    creationKey: '11111111-1111-4111-8111-111111111111',
    pendingCommand: {
      operation: 'save_draft' as const,
      key: '22222222-2222-4222-8222-222222222222',
      targetFundId: 42,
      expectedETag: '"0000000000000007"',
      bodySignature: '{"fundName":"Envelope Fund"}',
      dispatchedAt: '2026-09-21T00:00:00.000Z',
    },
  };
}

describe('fund workspace envelope', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.clear();
    await bindFundWorkspaceActor(ACTOR);
    resetFundWorkspace();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('round-trips every editable field, identity, ETag and the unresolved command', async () => {
    fundStore.setState(fullState());
    const written = JSON.parse(sessionStorage.getItem(FUND_WORKSPACE_STORAGE_KEY) ?? 'null');
    expect(written?.state?.envelope).toBe(FUND_WORKSPACE_ENVELOPE);
    expect(written?.state?.workspaceActorId).toBe(ACTOR);
    for (const [key, value] of Object.entries(fullState())) {
      if (value === undefined) continue;
      expect(written.state[key], key).toEqual(value);
    }
    expect(Object.values(written.state).some((value) => typeof value === 'function')).toBe(false);
    expect(written.state.hydrated).toBeUndefined();
    expect(written.state.draftSyncStatus).toBeUndefined();

    // Same actor, fresh tab load: the envelope restores.
    const sessionId = fundStore.getState().sessionId;
    resetFundWorkspaceStateOnly();
    await bindFundWorkspaceActor(ACTOR);
    expect(fundStore.getState().fundName).toBe('Envelope Fund');
    expect(fundStore.getState().draftETag).toBe('"0000000000000007"');
    expect(fundStore.getState().pendingCommand?.key).toBe('22222222-2222-4222-8222-222222222222');
    expect(fundStore.getState().sessionId).toBe(sessionId);
    expect(fundStore.getState().hydrated).toBe(true);
  });

  it("never hydrates another actor's envelope and clears the session on actor change", async () => {
    fundStore.setState({ fundName: 'Actor One Draft', draftFundId: 5, draftServerReady: true });
    await bindFundWorkspaceActor('user-2');
    expect(fundStore.getState().fundName).toBeUndefined();
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(fundStore.getState().workspaceActorId).toBe('user-2');
    expect(sessionStorage.getItem(FUND_WORKSPACE_STORAGE_KEY)).toContain('"user-2"');
  });

  it.each([
    ['malformed json', '{not json'],
    [
      'legacy shape',
      JSON.stringify({ state: { stages: [], modelVersion: 'reserves-ev1' }, version: 3 }),
    ],
    [
      'missing arrays',
      JSON.stringify({
        state: {
          envelope: FUND_WORKSPACE_ENVELOPE,
          sessionId: 's',
          workspaceActorId: ACTOR,
          draftFundId: null,
          draftServerReady: false,
        },
        version: 1,
      }),
    ],
    [
      'unknown version',
      JSON.stringify({ state: toFundWorkspaceEnvelope(fundStore.getState()), version: 99 }),
    ],
  ])('starts fresh on a %s envelope', async (_label, raw) => {
    sessionStorage.setItem(FUND_WORKSPACE_STORAGE_KEY, raw);
    resetFundWorkspaceStateOnly();
    await bindFundWorkspaceActor(ACTOR);
    expect(fundStore.getState().hydrated).toBe(true);
    expect(fundStore.getState().fundName).toBeUndefined();
    expect(fundStore.getState().draftFundId).toBeNull();
  });

  it('quarantines legacy localStorage instead of hydrating it', async () => {
    localStorage.setItem(
      'investment-strategy',
      JSON.stringify({ state: { draftFundId: 9, draftServerReady: true, stages: [] }, version: 3 })
    );
    resetFundWorkspaceStateOnly();
    await bindFundWorkspaceActor(ACTOR);
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(localStorage.getItem('investment-strategy')).not.toBeNull();
  });

  it('flags storage failure without losing in-memory state', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    fundStore.setState({ fundName: 'Only In Tab' });
    expect(fundStore.getState().persistenceFailed).toBe(true);
    expect(fundStore.getState().fundName).toBe('Only In Tab');
    setItem.mockRestore();
    fundStore.setState({ fundName: 'Persisted Again' });
    expect(fundStore.getState().persistenceFailed).toBe(false);
  });

  it('validates the envelope guard on a real snapshot', () => {
    fundStore.setState(fullState());
    expect(isFundWorkspaceEnvelope(toFundWorkspaceEnvelope(fundStore.getState()))).toBe(true);
    expect(isFundWorkspaceEnvelope({ envelope: FUND_WORKSPACE_ENVELOPE })).toBe(false);
  });

  it('recognizes unnamed edits and reserved sessions without treating generated IDs as edits', () => {
    expect(hasFundWorkspaceSession(fundStore.getState())).toBe(false);
    resetFundWorkspace();
    expect(hasFundWorkspaceSession(fundStore.getState())).toBe(false);
    fundStore.getState().updateFundBasics({ fundSize: 20_000_000 });
    expect(fundStore.getState().creationKey).toBeNull();
    expect(hasFundWorkspaceSession(fundStore.getState())).toBe(true);
    resetFundWorkspace();
    fundStore.getState().updateStageRate(0, { months: 42 });
    expect(hasFundWorkspaceSession(fundStore.getState())).toBe(true);
    resetFundWorkspace();
    fundStore.getState().reserveCreationKey();
    expect(hasFundWorkspaceSession(fundStore.getState())).toBe(true);
  });

  it.each([
    ['command primitive', { pendingCommand: 'bad' }],
    ['command shape', { pendingCommand: { operation: 'save_draft' } }],
    ['command operation', { pendingCommand: { ...fullState().pendingCommand, operation: 'bad' } }],
    ['command key', { pendingCommand: { ...fullState().pendingCommand, key: 'bad' } }],
    [
      'command revision',
      { pendingCommand: { ...fullState().pendingCommand, expectedETag: 'bad' } },
    ],
    ['command body', { pendingCommand: { ...fullState().pendingCommand, bodySignature: '{bad' } }],
    [
      'command body array',
      { pendingCommand: { ...fullState().pendingCommand, bodySignature: '[]' } },
    ],
    [
      'command timestamp',
      { pendingCommand: { ...fullState().pendingCommand, dispatchedAt: 'bad' } },
    ],
    ['command target', { pendingCommand: { ...fullState().pendingCommand, targetFundId: null } }],
    ['creation target', { pendingCommand: { ...fullState().pendingCommand, operation: 'create' } }],
    ['draft ID', { draftFundId: -1 }],
    [
      'command/store identity',
      { pendingCommand: { ...fullState().pendingCommand, targetFundId: 43 } },
    ],
    [
      'command without draft identity',
      { draftFundId: null, draftServerReady: false, draftETag: null },
    ],
    ['unsafe draft ID', { draftFundId: Number.MAX_SAFE_INTEGER + 1 }],
    ['draft revision', { draftETag: 'W/"0000000000000007"' }],
    ['creation key', { creationKey: 42 }],
    ['nested fee', { feeProfiles: [{ id: 'fee', name: '', feeTiers: ['bad'] }] }],
    ['nested pipeline', { pipelineProfiles: [{ id: 'pipe', name: '', stages: [null] }] }],
    ['nested LP', { lps: [{ id: 'lp', name: 'LP', commitment: 'bad', type: 'other' }] }],
    ['nested capital plan', { capitalPlanAllocations: [false] }],
    ['nested follow-on checks', { followOnChecks: { A: 0, B: 0, C: 'bad' } }],
    ['unknown top-level field', { resolveCommand: 'bad' }],
  ])('rejects a malformed %s before hydration', async (_label, patch) => {
    fundStore.setState(fullState());
    const malformed = { ...toFundWorkspaceEnvelope(fundStore.getState()), ...patch };
    expect(isFundWorkspaceEnvelope(malformed)).toBe(false);
    const raw = JSON.stringify({ state: malformed, version: 1 });
    sessionStorage.setItem(FUND_WORKSPACE_STORAGE_KEY, raw);
    resetFundWorkspaceStateOnly();
    await bindFundWorkspaceActor(ACTOR);
    expect(fundStore.getState().fundName).toBeUndefined();
    expect(fundStore.getState().pendingCommand).toBeNull();
    expect(fundStore.getState().draftFundId).toBeNull();
    expect(typeof fundStore.getState().resolveCommand).toBe('function');
  });

  it('preserves structurally valid unfinished form values', () => {
    fundStore.setState({
      fundName: '',
      establishmentDate: '',
      modelInputsAsOfDate: '',
      fundSize: -1,
      sectorProfiles: [{ id: 'unfinished', name: '', targetPercentage: 110 }],
    });
    expect(isFundWorkspaceEnvelope(toFundWorkspaceEnvelope(fundStore.getState()))).toBe(true);
  });

  it('starts a new session with a fresh creation key and no draft identity', () => {
    fundStore.setState(fullState());
    const previousSession = fundStore.getState().sessionId;
    fundStore.getState().startNewFundSession();
    const next = fundStore.getState();
    expect(next.sessionId).not.toBe(previousSession);
    expect(next.creationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(next.creationKey).not.toBe(fullState().creationKey);
    expect(next.draftFundId).toBeNull();
    expect(next.draftETag).toBeNull();
    expect(next.pendingCommand).toBeNull();
    expect(next.fundName).toBeUndefined();
    expect(next.workspaceActorId).toBe(ACTOR);
    expect(typeof next.updateFundBasics).toBe('function');
  });

  it('binds a resumed server draft to a fresh session', () => {
    fundStore.setState(fullState());
    fundStore.getState().resumeServerDraft(88);
    const next = fundStore.getState();
    expect(next.draftFundId).toBe(88);
    expect(next.draftServerReady).toBe(true);
    expect(next.draftETag).toBeNull();
    expect(next.fundName).toBeUndefined();
  });

  it('reserves one creation key until the session changes', () => {
    const first = fundStore.getState().reserveCreationKey();
    expect(fundStore.getState().reserveCreationKey()).toBe(first);
    fundStore.getState().startNewFundSession();
    expect(fundStore.getState().reserveCreationKey()).not.toBe(first);
  });

  it('does not let an older actor binding overwrite a newer actor or logout', async () => {
    let finishFirst!: () => void;
    const rehydrate = vi.spyOn(fundStore.persist, 'rehydrate').mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        })
    );
    const first = bindFundWorkspaceActor('old-actor', 'admin');
    await bindFundWorkspaceActor('new-actor', 'viewer');
    finishFirst();
    await first;
    expect(fundStore.getState().workspaceActorId).toBe('new-actor');
    expect(fundStore.getState().workspaceActorRole).toBe('viewer');
    rehydrate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        })
    );
    const loggingOut = bindFundWorkspaceActor('new-actor', 'admin');
    unbindFundWorkspaceActor();
    finishFirst();
    await loggingOut;
    expect(fundStore.getState().workspaceActorId).toBeNull();
    expect(fundStore.getState().workspaceActorRole).toBeNull();
    expect(sessionStorage.getItem(FUND_WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('persists and replays the original command even after local edits and reload', async () => {
    fundStore.setState({
      draftFundId: 42,
      draftETag: '"0000000000000001"',
      draftServerReady: true,
    });
    const original = prepareFundCommand(
      'save_draft',
      42,
      { fundName: 'Original' },
      '"0000000000000001"'
    );
    const envelope = sessionStorage.getItem(FUND_WORKSPACE_STORAGE_KEY)!;
    fundStore.setState({ pendingCommand: null });
    sessionStorage.setItem(FUND_WORKSPACE_STORAGE_KEY, envelope);
    await bindFundWorkspaceActor(ACTOR);
    expect(
      prepareFundCommand('save_draft', 42, { fundName: 'Edited' }, '"0000000000000002"')
    ).toEqual(original);
    expect(() => prepareFundCommand('finalize', 42, {}, '"0000000000000002"')).toThrow(/pending/i);
    fundStore.getState().resolveCommand();
    const next = prepareFundCommand('save_draft', 42, { fundName: 'Edited' }, '"0000000000000002"');
    expect(next.key).not.toBe(original.key);
    expect(next.payload).toEqual({ fundName: 'Edited' });
    expect(next.etag).toBe('"0000000000000002"');
  });

  it('refuses dispatch preparation when the pending command cannot be persisted', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(() => prepareFundCommand('create', null, { name: 'Unsaved' }, null)).toThrow(/Storage/);
    expect(fundStore.getState().pendingCommand?.bodySignature).toBe('{"name":"Unsaved"}');
  });

  it('includes the expected revision in command key identity', () => {
    fundStore.getState().beginCommand({
      operation: 'save_draft',
      targetFundId: 42,
      bodySignature: 'same',
      expectedETag: '"1"',
      key: 'old-key',
    });
    expect(fundCommandKey('save_draft', 42, 'same', '"1"')).toBe('old-key');
    expect(fundCommandKey('save_draft', 42, 'same', '"2"')).not.toBe('old-key');
  });

  it('reuses the pending key only for the same operation, target and body', () => {
    fundStore.getState().beginCommand({
      operation: 'save_draft',
      key: 'pending-key',
      targetFundId: 42,
      expectedETag: null,
      bodySignature: 'same',
    });
    expect(fundCommandKey('save_draft', 42, 'same')).toBe('pending-key');
    expect(fundCommandKey('save_draft', 42, 'changed')).not.toBe('pending-key');
    expect(fundCommandKey('save_draft', 43, 'same')).not.toBe('pending-key');
    expect(fundCommandKey('finalize', 42, 'same')).not.toBe('pending-key');
    fundStore.getState().resolveCommand();
    expect(fundCommandKey('save_draft', 42, 'same')).not.toBe('pending-key');
  });
});

/** Simulate a fresh tab: in-memory state gone, storage untouched. */
function resetFundWorkspaceStateOnly() {
  const stored = sessionStorage.getItem(FUND_WORKSPACE_STORAGE_KEY);
  resetFundWorkspace();
  if (stored !== null) sessionStorage.setItem(FUND_WORKSPACE_STORAGE_KEY, stored);
}
