import { useRef } from 'react';

interface IdempotencyKeyState {
  key: string;
  fingerprint: string;
}

export interface IdempotencyKeyHandle {
  /**
   * Returns the key for the current logical operation. The same payload
   * retried after a failure reuses the key so server-side dedup and stale
   * recovery engage; a changed payload mints a fresh key (a new logical
   * operation, never a spurious request-hash 409).
   */
  keyFor: (payload: unknown) => string;
  /** Call on success so the next logical operation mints a fresh key. */
  reset: () => void;
}

export function useIdempotencyKey(): IdempotencyKeyHandle {
  const state = useRef<IdempotencyKeyState | null>(null);
  const handle = useRef<IdempotencyKeyHandle>({
    keyFor: (payload) => {
      const fingerprint = JSON.stringify(payload) ?? '';
      if (state.current === null || state.current.fingerprint !== fingerprint) {
        state.current = { key: crypto.randomUUID(), fingerprint };
      }
      return state.current.key;
    },
    reset: () => {
      state.current = null;
    },
  });
  return handle.current;
}
