import { saveFundDraft, type DraftSnapshot } from '@/services/fund-drafts';
import { classifyWorkflowError, isStaleRevisionError } from '@/services/fund-workflow';
import { fundStore, prepareFundCommand } from '@/stores/fundStore';
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
