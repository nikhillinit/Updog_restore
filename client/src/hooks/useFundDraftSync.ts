import React from 'react';
import { fundStoreToDraftWriteV1 } from '@/adapters/fund-store-adapters';
import {
  applyDraftSnapshot,
  isDraftSaveInFlight,
  saveDraftAndSettle,
} from '@/services/fund-draft-settlement';
import { fetchFundDraft, isMissingDraftError, type DraftSnapshot } from '@/services/fund-drafts';
import { useFlag } from '@/hooks/useUnifiedFlag';
import { fundStore, type DraftSyncStatus } from '@/stores/fundStore';
import { useFundTuple } from '@/stores/useFundSelector';
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
  const [
    hydrated,
    draftFundId,
    draftServerReady,
    needsServerHydration,
    status,
    sessionId,
    pendingCommand,
  ] = useFundTuple(
    (s) =>
      [
        s.hydrated,
        s.draftFundId,
        s.draftServerReady,
        s.needsServerHydration,
        s.draftSyncStatus,
        s.sessionId,
        s.pendingCommand,
      ] as const
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
    clearPendingSave();
    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }
    if (
      state.pendingCommand?.operation === 'save_draft' &&
      isDraftSaveInFlight(state.sessionId, state.pendingCommand)
    ) {
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

    saveInFlightRef.current = true;
    setStatus('saving');
    setError(null);

    try {
      await saveDraftAndSettle(
        targetFundId,
        { includeEconomicsAssumptions: economicsEnabled },
        (outcome) => {
          switch (outcome.kind) {
            case 'superseded':
              return;
            case 'not_dispatched':
              setError(outcome.message);
              setStatus('error');
              return;
            case 'saved':
              fundStore.getState().setDraftServerReady(true);
              if (outcome.needsHydration) {
                queuedSaveRef.current = false;
                markVerified(null);
                setStatus('hydrating');
                setRetryNonce((value) => value + 1);
                return;
              }
              markVerified(targetFundId);
              lastSavedSignatureRef.current = outcome.dispatchedSignature;
              queuedSaveRef.current = outcome.newerEdits;
              setStatus('synced');
              return;
            case 'stale':
              setError(STALE_DRAFT_MESSAGE);
              setStatus('stale');
              return;
            case 'uncertain':
              setError(UNCERTAIN_SAVE_MESSAGE);
              setStatus('uncertain');
              return;
            case 'rejected':
              if (outcome.missingDraft) {
                setMissingDraftFundId(targetFundId);
                setError(MISSING_DRAFT_MESSAGE);
                setStatus('error');
                return;
              }
              setError(outcome.message);
              setStatus('error');
              return;
            case 'retry_same_key':
              setError(outcome.message);
              setStatus('error');
              return;
            default: {
              const exhaustive: never = outcome;
              return exhaustive;
            }
          }
        }
      );
    } finally {
      // eslint-disable-next-line require-atomic-updates -- single in-flight save per hook instance.
      saveInFlightRef.current = false;
      const now = fundStore.getState();
      if (
        now.sessionId === state.sessionId &&
        now.draftFundId === targetFundId &&
        queuedSaveRef.current &&
        !now.pendingCommand &&
        now.draftSyncStatus === 'synced'
      ) {
        queuedSaveRef.current = false;
        void persistCurrentDraft();
      }
    }
  }, [clearPendingSave, economicsEnabled, markVerified, setStatus]);

  const applyServerSnapshot = React.useCallback(
    (fundId: number, config: DraftSnapshot['config'], etag: string | null) => {
      applyDraftSnapshot(fundId, { config, etag });
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
    if (state.needsServerHydration && !state.pendingCommand) {
      markVerified(null);
      setError(null);
      setRetryNonce((value) => value + 1);
      return;
    }
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
  }, [markVerified, persistCurrentDraft]);

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
    if (hydratedServerDraftIdRef.current === draftFundId && !needsServerHydration) return;

    if (pendingCommand) {
      // Recovery must settle the exact dispatched command before fetching over it.
      markVerified(draftFundId);
      if (pendingCommand.operation === 'save_draft') {
        if (!isDraftSaveInFlight(sessionId, pendingCommand)) {
          setError(UNCERTAIN_SAVE_MESSAGE);
          setStatus('uncertain');
        }
      } else {
        setStatus('synced');
      }
      return;
    }
    if (!draftServerReady && !needsServerHydration) return;

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

        if (state.needsServerHydration || state.draftETag == null) {
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
    needsServerHydration,
    pendingCommand,
    persistCurrentDraft,
    retryNonce,
    sessionId,
    setStatus,
  ]);

  // Autosave: local edits after identity exists. Blocked while hydrating, stale, or missing.
  React.useEffect(() => {
    if (!hydrated || draftFundId == null) return;
    if (needsServerHydration) return;
    if (draftServerReady && verifiedDraftFundId !== draftFundId) return;
    if (missingDraftFundId === draftFundId) return;

    lastObservedSignatureRef.current = localSignature();
    const unsubscribe = fundStore.subscribe((state) => {
      if (state.draftFundId == null || state.draftFundId !== draftFundId) return;
      if (state.draftSyncStatus === 'stale' || state.draftSyncStatus === 'hydrating') return;
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
    needsServerHydration,
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
