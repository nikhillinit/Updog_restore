import React from 'react';
import {
  fundDraftWriteV1ToStoreHydrationPatch,
  fundStoreToDraftWriteV1,
} from '@/adapters/fund-store-adapters';
import { fetchFundDraft, isMissingDraftError, saveFundDraft } from '@/services/fund-drafts';
import { classifyWorkflowError, isStaleRevisionError } from '@/services/fund-workflow';
import { useFlag } from '@/hooks/useUnifiedFlag';
import {
  prepareFundCommand,
  fundStore,
  FUND_COMMAND_STORAGE_MESSAGE,
  type DraftSyncStatus,
} from '@/stores/fundStore';
import { useFundTuple } from '@/stores/useFundSelector';
import { ApiError } from '@/lib/queryClient';
import { canonicalJson } from '@shared/lib/canonical-json-serialization';

export type { DraftSyncStatus } from '@/stores/fundStore';

interface UseFundDraftSyncOptions {
  stepKey: string;
  debounceMs?: number;
}

export interface UseFundDraftSyncResult {
  status: DraftSyncStatus;
  error: string | null;
  retry: () => void;
  isHydrating: boolean;
  /** Stale revision: replace local values with the server draft (deliberate choice). */
  loadServerDraft: () => void;
  /** Stale revision: keep local values and resubmit them over the current revision. */
  keepLocalDraft: () => void;
  /** The routed fund has no active draft; nothing can be saved for it. */
  missingDraftFundId: number | null;
}

export const STORAGE_UNAVAILABLE_MESSAGE = FUND_COMMAND_STORAGE_MESSAGE;
export const STALE_DRAFT_MESSAGE = 'A newer draft is available';
export const UNCERTAIN_SAVE_MESSAGE = 'Could not confirm the save; it may have completed';
export const MISSING_DRAFT_MESSAGE = 'No active draft exists for this fund';

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useFundDraftSync({
  stepKey,
  debounceMs = 600,
}: UseFundDraftSyncOptions): UseFundDraftSyncResult {
  const [hydrated, draftFundId, draftServerReady, status, sessionId] = useFundTuple(
    (s) => [s.hydrated, s.draftFundId, s.draftServerReady, s.draftSyncStatus, s.sessionId] as const
  );
  const economicsEnabled = useFlag('enable_gp_economics_engine', { withDependencies: true });
  const [error, setError] = React.useState<string | null>(null);
  const [missingDraftFundId, setMissingDraftFundId] = React.useState<number | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  // Fund whose server snapshot this mount has verified. The ref serves async
  // callbacks; the state re-arms the autosave subscription after hydration.
  const hydratedServerDraftIdRef = React.useRef<number | null>(null);
  const [verifiedDraftFundId, setVerifiedDraftFundId] = React.useState<number | null>(null);
  const markVerified = React.useCallback((fundId: number | null) => {
    hydratedServerDraftIdRef.current = fundId;
    setVerifiedDraftFundId(fundId);
  }, []);
  const serverETagRef = React.useRef<string | null>(null);
  const saveInFlightRef = React.useRef(false);
  const queuedSaveRef = React.useRef(false);
  const pendingSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = React.useRef(false);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  // Payload signature at the last store notification; status writes to the store
  // must not re-trigger the autosave subscription.
  const lastObservedSignatureRef = React.useRef<string | null>(null);
  const previousStepKeyRef = React.useRef(stepKey);

  const setStatus = React.useCallback((next: DraftSyncStatus) => {
    fundStore.getState().setDraftSyncStatus(next);
  }, []);

  const clearPendingSave = React.useCallback(() => {
    if (pendingSaveTimerRef.current != null) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
  }, []);

  const localSignature = React.useCallback(
    () =>
      canonicalJson(
        fundStoreToDraftWriteV1(fundStore.getState(), {
          includeEconomicsAssumptions: economicsEnabled,
        })
      ),
    [economicsEnabled]
  );

  const persistCurrentDraft = React.useCallback(async () => {
    const state = fundStore.getState();
    const targetFundId = state.draftFundId;
    if (targetFundId == null) return;
    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    if (state.pendingCommand && state.pendingCommand.operation !== 'save_draft') return;
    const currentPayload = fundStoreToDraftWriteV1(state, {
      includeEconomicsAssumptions: economicsEnabled,
    });
    if (!state.pendingCommand && canonicalJson(currentPayload) === lastSavedSignatureRef.current) {
      setStatus('synced');
      return;
    }

    clearPendingSave();
    let command;
    try {
      command = prepareFundCommand('save_draft', targetFundId, currentPayload, state.draftETag);
    } catch (preparationError) {
      setError(readErrorMessage(preparationError, STORAGE_UNAVAILABLE_MESSAGE));
      setStatus('error');
      return;
    }
    const { payload, key, etag } = command;
    const signature = canonicalJson(payload);

    saveInFlightRef.current = true;
    setStatus('saving');
    setError(null);
    const capturedSession = state.sessionId;
    const stillCurrent = () => {
      const now = fundStore.getState();
      return now.sessionId === capturedSession && now.draftFundId === targetFundId;
    };

    try {
      const saved = await saveFundDraft(targetFundId, payload, {
        key,
        etag,
      });
      if (!stillCurrent() || fundStore.getState().pendingCommand?.key !== key) return;
      const current = fundStore.getState();
      current.setDraftETag(saved.etag ?? current.draftETag);
      current.setDraftServerReady(true);
      current.resolveCommand();
      markVerified(targetFundId);
      // eslint-disable-next-line require-atomic-updates -- ref stores the last server-confirmed payload signature.
      lastSavedSignatureRef.current = signature;
      queuedSaveRef.current = localSignature() !== signature;
      setStatus('synced');
    } catch (draftError) {
      if (!stillCurrent() || fundStore.getState().pendingCommand?.key !== key) return;
      const current = fundStore.getState();
      if (isStaleRevisionError(draftError)) {
        current.resolveCommand();
        setError(STALE_DRAFT_MESSAGE);
        setStatus('stale');
        return;
      }
      const outcome = classifyWorkflowError(draftError);
      if (outcome === 'uncertain') {
        setError(UNCERTAIN_SAVE_MESSAGE);
        setStatus('uncertain');
        return;
      }
      if (outcome === 'rejected') {
        current.resolveCommand();
        if (draftError instanceof ApiError && draftError.errorCode === 'NO_ACTIVE_DRAFT') {
          setMissingDraftFundId(targetFundId);
          setError(MISSING_DRAFT_MESSAGE);
          setStatus('error');
          return;
        }
      }
      setError(readErrorMessage(draftError, 'Could not save changes'));
      setStatus('error');
    } finally {
      // eslint-disable-next-line require-atomic-updates -- single in-flight save per hook instance.
      saveInFlightRef.current = false;
      if (
        stillCurrent() &&
        queuedSaveRef.current &&
        !fundStore.getState().pendingCommand &&
        fundStore.getState().draftSyncStatus === 'synced'
      ) {
        queuedSaveRef.current = false;
        void persistCurrentDraft();
      }
    }
  }, [clearPendingSave, economicsEnabled, localSignature, markVerified, setStatus]);

  const applyServerSnapshot = React.useCallback(
    (
      fundId: number,
      config: Parameters<typeof fundDraftWriteV1ToStoreHydrationPatch>[0],
      etag: string | null
    ) => {
      const defaults = fundStore.getInitialState();
      const patch = fundDraftWriteV1ToStoreHydrationPatch(config, defaults);
      skipNextAutosaveRef.current = true;
      fundStore.setState((state) => ({
        ...state,
        ...patch,
        draftFundId: fundId,
        draftServerReady: true,
        draftETag: etag,
        pendingCommand: null,
      }));
      lastSavedSignatureRef.current = localSignature();
      markVerified(fundId);
      serverETagRef.current = null;
      setError(null);
      setStatus('synced');
    },
    [localSignature, markVerified, setStatus]
  );

  const loadServerDraft = React.useCallback(() => {
    const captured = fundStore.getState();
    if (captured.pendingCommand) return;
    const fundId = captured.draftFundId;
    if (fundId == null) return;
    const stillCurrent = () => {
      const current = fundStore.getState();
      return (
        current.sessionId === captured.sessionId &&
        current.draftFundId === fundId &&
        !current.pendingCommand
      );
    };
    setStatus('hydrating');
    void fetchFundDraft(fundId).then(
      (snapshot) => {
        if (!stillCurrent()) return;
        applyServerSnapshot(fundId, snapshot.config, snapshot.etag);
      },
      (loadError) => {
        if (!stillCurrent()) return;
        setError(readErrorMessage(loadError, 'Draft load failed'));
        setStatus('error');
      }
    );
  }, [applyServerSnapshot, setStatus]);

  const keepLocalDraft = React.useCallback(() => {
    const state = fundStore.getState();
    if (state.pendingCommand) return;
    if (state.draftFundId == null) return;
    const stillCurrent = () => {
      const current = fundStore.getState();
      return (
        current.sessionId === state.sessionId &&
        current.draftFundId === state.draftFundId &&
        !current.pendingCommand
      );
    };
    const rebaseTo = serverETagRef.current;
    if (rebaseTo == null) {
      setStatus('hydrating');
      void fetchFundDraft(state.draftFundId).then(
        (snapshot) => {
          if (!stillCurrent()) return;
          fundStore.getState().setDraftETag(snapshot.etag);
          markVerified(state.draftFundId);
          void persistCurrentDraft();
        },
        (loadError) => {
          if (!stillCurrent()) return;
          setError(readErrorMessage(loadError, 'Draft load failed'));
          setStatus('error');
        }
      );
      return;
    }
    state.setDraftETag(rebaseTo);
    serverETagRef.current = null;
    void persistCurrentDraft();
  }, [markVerified, persistCurrentDraft, setStatus]);

  const retry = React.useCallback(() => {
    const state = fundStore.getState();
    if (
      state.draftFundId != null &&
      state.draftServerReady &&
      hydratedServerDraftIdRef.current !== state.draftFundId
    ) {
      setError(null);
      setRetryNonce((value) => value + 1);
      return;
    }
    void persistCurrentDraft();
  }, [persistCurrentDraft]);

  // Identity cleared: nothing to sync.
  React.useEffect(() => {
    if (!hydrated || draftFundId != null) return;
    clearPendingSave();
    markVerified(null);
    serverETagRef.current = null;
    lastSavedSignatureRef.current = null;
    setMissingDraftFundId(null);
    setError(null);
    setStatus('idle');
  }, [clearPendingSave, draftFundId, hydrated, markVerified, setStatus]);

  // Server-ready identity not yet verified this mount: load it (resume, reload, explicit ID).
  React.useEffect(() => {
    if (!hydrated || draftFundId == null) return;
    if (hydratedServerDraftIdRef.current === draftFundId) return;

    const pending = fundStore.getState().pendingCommand;
    if (pending) {
      // Recovery must settle the exact dispatched command before fetching over it.
      markVerified(draftFundId);
      if (pending.operation === 'save_draft') {
        setError(UNCERTAIN_SAVE_MESSAGE);
        setStatus('uncertain');
      } else {
        setStatus('synced');
      }
      return;
    }
    if (!draftServerReady) return;

    let cancelled = false;
    setStatus('hydrating');
    setError(null);
    setMissingDraftFundId(null);

    void (async () => {
      try {
        const snapshot = await fetchFundDraft(draftFundId);
        if (cancelled) return;
        const state = fundStore.getState();
        if (state.sessionId !== sessionId || state.draftFundId !== draftFundId) return;

        if (state.draftETag == null) {
          applyServerSnapshot(draftFundId, snapshot.config, snapshot.etag);
          return;
        }
        if (state.draftETag === snapshot.etag) {
          // Local values are at or ahead of the acknowledged revision; keep them.
          markVerified(draftFundId);
          lastSavedSignatureRef.current = canonicalJson(snapshot.config);
          if (localSignature() !== lastSavedSignatureRef.current) {
            // Restored edits are not on the server yet; they are not settled.
            setStatus('saving');
            pendingSaveTimerRef.current = setTimeout(() => void persistCurrentDraft(), debounceMs);
          } else {
            setStatus('synced');
          }
          return;
        }
        // Stale baseline: hold local values and require a deliberate choice.
        markVerified(draftFundId);
        serverETagRef.current = snapshot.etag;
        setError(STALE_DRAFT_MESSAGE);
        setStatus('stale');
      } catch (draftError) {
        if (cancelled) return;
        const current = fundStore.getState();
        if (current.sessionId !== sessionId || current.draftFundId !== draftFundId) return;
        if (isMissingDraftError(draftError)) {
          markVerified(draftFundId);
          setMissingDraftFundId(draftFundId);
          setError(MISSING_DRAFT_MESSAGE);
          setStatus('error');
          return;
        }
        setError(readErrorMessage(draftError, 'Draft load failed'));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    applyServerSnapshot,
    debounceMs,
    draftFundId,
    draftServerReady,
    hydrated,
    localSignature,
    markVerified,
    persistCurrentDraft,
    retryNonce,
    sessionId,
    setStatus,
  ]);

  // Autosave: local edits after identity exists. Blocked while hydrating, stale, or missing.
  React.useEffect(() => {
    if (!hydrated || draftFundId == null) return;
    if (draftServerReady && verifiedDraftFundId !== draftFundId) return;
    if (missingDraftFundId === draftFundId) return;

    lastObservedSignatureRef.current = localSignature();
    const unsubscribe = fundStore.subscribe((state) => {
      if (state.draftFundId == null || state.draftFundId !== draftFundId) return;
      if (state.draftSyncStatus === 'stale' || state.draftSyncStatus === 'hydrating') return;
      if (skipNextAutosaveRef.current) {
        skipNextAutosaveRef.current = false;
        lastObservedSignatureRef.current = localSignature();
        return;
      }
      const signature = canonicalJson(
        fundStoreToDraftWriteV1(state, { includeEconomicsAssumptions: economicsEnabled })
      );
      if (signature === lastObservedSignatureRef.current) return;
      lastObservedSignatureRef.current = signature;
      if (signature === lastSavedSignatureRef.current) return;
      if (state.pendingCommand) {
        queuedSaveRef.current = state.pendingCommand.operation === 'save_draft';
        return;
      }

      clearPendingSave();
      setError(null);
      setStatus('saving');
      pendingSaveTimerRef.current = setTimeout(() => {
        void persistCurrentDraft();
      }, debounceMs);
    });

    // Resubscribing must not cancel a pending debounced save; unmount does.
    return unsubscribe;
  }, [
    clearPendingSave,
    debounceMs,
    draftFundId,
    draftServerReady,
    economicsEnabled,
    hydrated,
    localSignature,
    missingDraftFundId,
    persistCurrentDraft,
    setStatus,
    verifiedDraftFundId,
  ]);

  React.useEffect(() => clearPendingSave, [clearPendingSave]);

  // Leaving a step flushes a pending debounced save.
  React.useEffect(() => {
    if (previousStepKeyRef.current === stepKey) return;
    previousStepKeyRef.current = stepKey;
    if (pendingSaveTimerRef.current != null) {
      void persistCurrentDraft();
    }
  }, [persistCurrentDraft, stepKey]);

  return {
    status,
    error,
    retry,
    isHydrating: status === 'hydrating',
    loadServerDraft,
    keepLocalDraft,
    missingDraftFundId,
  };
}
