import React from 'react';
import {
  fundDraftWriteV1ToStoreHydrationPatch,
  fundStoreToDraftWriteV1,
} from '@/adapters/fund-store-adapters';
import { fetchFundDraft, saveFundDraft } from '@/services/fund-drafts';
import { useFlag } from '@/hooks/useUnifiedFlag';
import { fundStore } from '@/stores/fundStore';
import { useFundTuple } from '@/stores/useFundSelector';

export type DraftSyncStatus = 'idle' | 'hydrating' | 'saving' | 'synced' | 'error';

interface UseFundDraftSyncOptions {
  stepKey: string;
  debounceMs?: number;
}

interface UseFundDraftSyncResult {
  status: DraftSyncStatus;
  error: string | null;
  retry: () => void;
  isHydrating: boolean;
}

function readErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isExpectedMissingServerDraft(error: unknown): boolean {
  return error instanceof Error && error.message === 'No draft found';
}

export function useFundDraftSync({
  stepKey,
  debounceMs = 600,
}: UseFundDraftSyncOptions): UseFundDraftSyncResult {
  const [hydrated, draftFundId, draftServerReady] = useFundTuple(
    (s) => [s.hydrated, s.draftFundId, s.draftServerReady] as const
  );
  const economicsEnabled = useFlag('enable_gp_economics_engine', { withDependencies: true });
  const [status, setStatus] = React.useState<DraftSyncStatus>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [retryNonce, setRetryNonce] = React.useState(0);
  const recoveryCapturedRef = React.useRef(false);
  const recoveredDraftIdRef = React.useRef<number | null>(null);
  const hydratedServerDraftIdRef = React.useRef<number | null>(null);
  const pendingSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = React.useRef(false);
  const lastSavedSignatureRef = React.useRef<string | null>(null);
  const previousStepKeyRef = React.useRef(stepKey);

  const clearPendingSave = React.useCallback(() => {
    if (pendingSaveTimerRef.current != null) {
      clearTimeout(pendingSaveTimerRef.current);
      pendingSaveTimerRef.current = null;
    }
  }, []);

  const persistCurrentDraft = React.useCallback(async () => {
    const state = fundStore.getState();
    if (state.draftFundId == null) {
      return;
    }

    const payload = fundStoreToDraftWriteV1(state, {
      includeEconomicsAssumptions: economicsEnabled,
    });
    const nextSignature = JSON.stringify(payload);
    if (nextSignature === lastSavedSignatureRef.current) {
      setStatus('synced');
      return;
    }

    clearPendingSave();
    setStatus('saving');
    setError(null);

    try {
      await saveFundDraft(state.draftFundId, payload);
      fundStore.getState().setDraftServerReady(true);
      hydratedServerDraftIdRef.current = state.draftFundId;
      // eslint-disable-next-line require-atomic-updates -- ref stores the last server-confirmed payload signature.
      lastSavedSignatureRef.current = nextSignature;
      setStatus('synced');
    } catch (draftError) {
      setError(readErrorMessage(draftError, 'Draft save failed'));
      setStatus('error');
    }
  }, [clearPendingSave, economicsEnabled]);

  const retry = React.useCallback(() => {
    if (
      recoveredDraftIdRef.current != null &&
      draftFundId === recoveredDraftIdRef.current &&
      hydratedServerDraftIdRef.current !== draftFundId
    ) {
      setError(null);
      setRetryNonce((value) => value + 1);
      return;
    }

    void persistCurrentDraft();
  }, [draftFundId, persistCurrentDraft]);

  React.useEffect(() => {
    if (!hydrated || recoveryCapturedRef.current) {
      return;
    }

    recoveryCapturedRef.current = true;
    const state = fundStore.getState();
    if (state.draftFundId != null && state.draftServerReady) {
      recoveredDraftIdRef.current = state.draftFundId;
    }
  }, [hydrated]);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (draftFundId == null) {
      clearPendingSave();
      recoveredDraftIdRef.current = null;
      hydratedServerDraftIdRef.current = null;
      lastSavedSignatureRef.current = null;
      setError(null);
      setStatus('idle');
      return;
    }

    if (
      draftServerReady &&
      recoveredDraftIdRef.current !== draftFundId &&
      lastSavedSignatureRef.current == null
    ) {
      lastSavedSignatureRef.current = JSON.stringify(
        fundStoreToDraftWriteV1(fundStore.getState(), {
          includeEconomicsAssumptions: economicsEnabled,
        })
      );
      setStatus('synced');
    }
  }, [clearPendingSave, draftFundId, draftServerReady, economicsEnabled, hydrated]);

  React.useEffect(() => {
    if (!hydrated) {
      return;
    }

    const recoveredDraftId = recoveredDraftIdRef.current;
    if (
      recoveredDraftId == null ||
      draftFundId !== recoveredDraftId ||
      hydratedServerDraftIdRef.current === recoveredDraftId
    ) {
      return;
    }

    let cancelled = false;
    setStatus('hydrating');
    setError(null);

    void (async () => {
      try {
        const draft = await fetchFundDraft(recoveredDraftId);
        if (cancelled) {
          return;
        }

        const defaults = fundStore.getInitialState();
        const patch = fundDraftWriteV1ToStoreHydrationPatch(draft, defaults);
        skipNextAutosaveRef.current = true;
        lastSavedSignatureRef.current = JSON.stringify(draft);
        fundStore.setState((state) => ({
          ...state,
          ...patch,
          draftFundId: recoveredDraftId,
          draftServerReady: true,
        }));
        hydratedServerDraftIdRef.current = recoveredDraftId;
        recoveredDraftIdRef.current = null;
        setStatus('synced');
      } catch (draftError) {
        if (cancelled) {
          return;
        }

        if (isExpectedMissingServerDraft(draftError)) {
          // The fund identity exists, but there is no authoritative draft snapshot to hydrate yet.
          if (fundStore.getState().draftFundId === recoveredDraftId) {
            fundStore.getState().setDraftServerReady(false);
          }
          recoveredDraftIdRef.current = null;
          hydratedServerDraftIdRef.current = null;
          lastSavedSignatureRef.current = null;
          setError(null);
          setStatus('idle');
          return;
        }

        setError(readErrorMessage(draftError, 'Draft load failed'));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draftFundId, hydrated, retryNonce]);

  React.useEffect(() => {
    if (!hydrated || draftFundId == null) {
      return;
    }

    if (
      draftServerReady &&
      recoveredDraftIdRef.current === draftFundId &&
      hydratedServerDraftIdRef.current !== draftFundId
    ) {
      return;
    }

    const unsubscribe = fundStore.subscribe((state) => {
      if (state.draftFundId == null || state.draftFundId !== draftFundId) {
        return;
      }

      if (skipNextAutosaveRef.current) {
        skipNextAutosaveRef.current = false;
        return;
      }

      const signature = JSON.stringify(
        fundStoreToDraftWriteV1(state, {
          includeEconomicsAssumptions: economicsEnabled,
        })
      );
      if (signature === lastSavedSignatureRef.current) {
        return;
      }

      clearPendingSave();
      setError(null);
      setStatus('saving');
      pendingSaveTimerRef.current = setTimeout(() => {
        void persistCurrentDraft();
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      clearPendingSave();
    };
  }, [
    clearPendingSave,
    debounceMs,
    draftFundId,
    draftServerReady,
    economicsEnabled,
    hydrated,
    persistCurrentDraft,
  ]);

  React.useEffect(() => {
    if (previousStepKeyRef.current === stepKey) {
      return;
    }

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
  };
}
