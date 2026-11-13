import {
  fetchFundRevisionSource,
  saveFundDraft,
  startFundRevision,
  type DraftSnapshot,
  type StartFundRevisionBody,
} from '@/services/fund-drafts';
import { classifyWorkflowError, isStaleRevisionError } from '@/services/fund-workflow';
import { fundStore, prepareFundCommand, type PendingFundCommand } from '@/stores/fundStore';
import {
  fundStoreToDraftWriteV1,
  fundDraftWriteV1ToStoreHydrationPatch,
} from '@/adapters/fund-store-adapters';
import { ApiError } from '@/lib/queryClient';
import { canonicalJson } from '@shared/lib/canonical-json-serialization';

export type DraftSaveOutcome =
  | { kind: 'not_dispatched'; message: string }
  | { kind: 'superseded' }
  | { kind: 'saved'; dispatchedSignature: string; newerEdits: boolean; needsHydration: boolean }
  | { kind: 'stale'; message: string }
  | { kind: 'uncertain'; message: string }
  | { kind: 'retry_same_key'; message: string }
  | { kind: 'rejected'; message: string; missingDraft: boolean };

export type DraftSaveOutcomeHandler = (outcome: DraftSaveOutcome) => void | Promise<void>;

export type SaveDraftAndSettleOptions = { includeEconomicsAssumptions: boolean };

// A reload clears live ownership; same-session envelope hydration must retain it.
const inFlightSaves = new Set<{ sessionId: string; command: PendingFundCommand }>();
const inFlightRevisions = new Set<{ sessionId: string; command: PendingFundCommand }>();

// A reload clears the acknowledged draft signature.
let draftSaveAcknowledgement: {
  sessionId: string;
  fundId: number;
  signature: string;
  etag: string | null;
} | null = null;

export function recordDraftSaveAcknowledgement(
  sessionId: string,
  fundId: number,
  signature: string,
  etag: string | null
): void {
  draftSaveAcknowledgement = { sessionId, fundId, signature, etag };
}

export function clearDraftSaveAcknowledgement(): void {
  draftSaveAcknowledgement = null;
}

export function isDraftSaveAcknowledged(
  sessionId: string,
  fundId: number,
  signature: string,
  etag: string | null
): boolean {
  return (
    draftSaveAcknowledgement?.sessionId === sessionId &&
    draftSaveAcknowledgement.fundId === fundId &&
    draftSaveAcknowledgement.signature === signature &&
    draftSaveAcknowledgement.etag === etag
  );
}

export function isDraftSaveInFlight(sessionId: string, command: PendingFundCommand): boolean {
  return [...inFlightSaves].some(
    (save) =>
      save.sessionId === sessionId &&
      save.command.key === command.key &&
      save.command.operation === command.operation &&
      save.command.targetFundId === command.targetFundId &&
      save.command.bodySignature === command.bodySignature &&
      save.command.expectedETag === command.expectedETag
  );
}

export function isRevisionStartInFlight(sessionId: string, command: PendingFundCommand): boolean {
  return [...inFlightRevisions].some(
    (revision) =>
      revision.sessionId === sessionId &&
      revision.command.key === command.key &&
      revision.command.operation === 'save_draft' &&
      revision.command.source === 'published' &&
      revision.command.targetFundId === command.targetFundId &&
      revision.command.bodySignature === command.bodySignature &&
      revision.command.expectedETag === command.expectedETag
  );
}

export type RevisionStartOutcome =
  | { kind: 'not_dispatched'; message: string }
  | { kind: 'superseded' }
  | { kind: 'started' }
  | { kind: 'stale'; message: string }
  | { kind: 'uncertain'; message: string }
  | { kind: 'retry_same_key'; message: string }
  | { kind: 'rejected'; message: string };

export async function startRevisionAndSettle(
  fundId: number,
  onOutcome: (outcome: RevisionStartOutcome) => void | Promise<void>
): Promise<void> {
  const state = fundStore.getState();
  const capturedSession = state.sessionId;
  if (state.draftFundId !== fundId) {
    await onOutcome({ kind: 'not_dispatched', message: 'The selected fund changed; try again.' });
    return;
  }
  if (state.pendingCommand && state.pendingCommand.source !== 'published') {
    await onOutcome({
      kind: 'not_dispatched',
      message: 'Check the pending command status before starting a revision.',
    });
    return;
  }

  let command: { payload: StartFundRevisionBody; key: string; etag: string | null };
  try {
    if (state.pendingCommand?.source === 'published') {
      command = prepareFundCommand(
        'save_draft',
        fundId,
        JSON.parse(state.pendingCommand.bodySignature) as StartFundRevisionBody,
        state.pendingCommand.expectedETag,
        'published'
      );
    } else {
      const source = await fetchFundRevisionSource(fundId);
      const current = fundStore.getState();
      if (
        current.sessionId !== capturedSession ||
        current.draftFundId !== fundId ||
        current.pendingCommand !== null
      ) {
        await onOutcome({ kind: 'superseded' });
        return;
      }
      command = prepareFundCommand(
        'save_draft',
        fundId,
        {
          sourceConfigId: source.sourceConfigId,
          sourceConfigVersion: source.sourceConfigVersion,
        },
        source.etag,
        'published'
      );
    }
  } catch (error) {
    await onOutcome({
      kind: 'not_dispatched',
      message: error instanceof Error ? error.message : 'Could not prepare the revision',
    });
    return;
  }

  const inFlightRevision = {
    sessionId: capturedSession,
    command: fundStore.getState().pendingCommand!,
  };
  inFlightRevisions.add(inFlightRevision);
  let result: { snapshot: Awaited<ReturnType<typeof startFundRevision>> } | { error: unknown };
  try {
    result = {
      snapshot: await startFundRevision(fundId, command.payload, {
        key: command.key,
        etag: command.etag,
      }),
    };
  } catch (error) {
    result = { error };
  } finally {
    inFlightRevisions.delete(inFlightRevision);
  }

  const current = fundStore.getState();
  let outcome: RevisionStartOutcome;
  if (
    current.sessionId !== capturedSession ||
    current.draftFundId !== fundId ||
    current.pendingCommand?.key !== command.key
  ) {
    outcome = { kind: 'superseded' };
  } else if ('snapshot' in result) {
    applyDraftSnapshot(fundId, result.snapshot);
    outcome = { kind: 'started' };
  } else if (isStaleRevisionError(result.error)) {
    current.resolveCommand();
    outcome = {
      kind: 'stale',
      message: result.error instanceof Error ? result.error.message : 'Published source changed',
    };
  } else {
    const classification = classifyWorkflowError(result.error);
    if (classification === 'rejected') current.resolveCommand();
    outcome = {
      kind: classification,
      message: result.error instanceof Error ? result.error.message : 'Could not start revision',
    };
  }
  await onOutcome(outcome);
}

export async function saveDraftAndSettle(
  fundId: number,
  options: SaveDraftAndSettleOptions,
  onOutcome: DraftSaveOutcomeHandler
): Promise<void> {
  const state = fundStore.getState();
  if (state.draftFundId !== fundId) {
    await onOutcome({
      kind: 'not_dispatched',
      message: 'The draft changed before saving; try again.',
    });
    return;
  }

  let command: {
    payload: ReturnType<typeof fundStoreToDraftWriteV1>;
    key: string;
    etag: string | null;
  };
  try {
    const payload = fundStoreToDraftWriteV1(state, options);
    command = prepareFundCommand('save_draft', fundId, payload, state.draftETag);
  } catch (error) {
    await onOutcome({
      kind: 'not_dispatched',
      message: error instanceof Error ? error.message : 'Could not save changes',
    });
    return;
  }

  const capturedSession = state.sessionId;
  const dispatchedSignature = canonicalJson(command.payload);
  const inFlightSave = {
    sessionId: capturedSession,
    command: fundStore.getState().pendingCommand!,
  };
  inFlightSaves.add(inFlightSave);
  let result: { saved: Awaited<ReturnType<typeof saveFundDraft>> } | { error: unknown };
  try {
    result = {
      saved: await saveFundDraft(fundId, command.payload, {
        key: command.key,
        etag: command.etag,
      }),
    };
  } catch (error) {
    result = { error };
  } finally {
    inFlightSaves.delete(inFlightSave);
  }

  const current = fundStore.getState();
  let outcome: DraftSaveOutcome;
  if (
    current.sessionId !== capturedSession ||
    current.draftFundId !== fundId ||
    current.pendingCommand?.key !== command.key
  ) {
    outcome = { kind: 'superseded' };
  } else if ('saved' in result) {
    current.setDraftETag(result.saved.etag ?? current.draftETag);
    current.resolveCommand();
    recordDraftSaveAcknowledgement(
      capturedSession,
      fundId,
      dispatchedSignature,
      fundStore.getState().draftETag
    );
    outcome = {
      kind: 'saved',
      dispatchedSignature,
      newerEdits:
        canonicalJson(fundStoreToDraftWriteV1(fundStore.getState(), options)) !==
        dispatchedSignature,
      needsHydration: fundStore.getState().needsServerHydration,
    };
  } else {
    const { error } = result;
    const message = error instanceof Error ? error.message : 'Could not save changes';
    if (isStaleRevisionError(error)) {
      current.resolveCommand();
      // The acknowledged ETag is no longer the server head.
      clearDraftSaveAcknowledgement();
      outcome = { kind: 'stale', message };
    } else {
      const classification = classifyWorkflowError(error);
      if (classification === 'rejected') {
        current.resolveCommand();
        outcome = {
          kind: 'rejected',
          message,
          missingDraft: error instanceof ApiError && error.errorCode === 'NO_ACTIVE_DRAFT',
        };
      } else {
        outcome = { kind: classification, message };
      }
    }
  }

  await onOutcome(outcome);
}

export function applyDraftSnapshot(fundId: number, snapshot: DraftSnapshot): void {
  fundStore.setState((state) => ({
    ...state,
    ...fundDraftWriteV1ToStoreHydrationPatch(snapshot.config, fundStore.getInitialState()),
    draftFundId: fundId,
    draftServerReady: true,
    needsServerHydration: false,
    draftETag: snapshot.etag,
    pendingCommand: null,
  }));
}
