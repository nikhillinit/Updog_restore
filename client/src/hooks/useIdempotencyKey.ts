import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '@/lib/queryClient';

interface IdempotencyKeyState {
  key: string;
  fingerprint: string;
  scopeKey: string | null;
  actorId: string | null;
}

export type IdempotencyKeyScope = {
  fundId: number | null | undefined;
  operation: 'deal_create' | 'deal_import' | 'company_create';
  actorId: string | null | undefined;
};

const pendingCreateSchema = z
  .object({
    actorId: z.string().min(1),
    key: z.string().min(1),
    fingerprint: z.string().min(1),
    createdAt: z.number().finite(),
  })
  .strict();

type PendingCreate = z.infer<typeof pendingCreateSchema>;

const PENDING_CREATE_PREFIX = 'pending-create:v1:';

function getSessionStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function scopeKey(scope: IdempotencyKeyScope | undefined): string | null {
  if (scope?.fundId == null || !scope.actorId) return null;
  return `${PENDING_CREATE_PREFIX}${scope.fundId}:${scope.operation}`;
}

function readPendingCreate(key: string, actorId: string): PendingCreate | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const parsed = pendingCreateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.actorId !== actorId) {
      storage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage is optional.
    }
    return null;
  }
}

function writePendingCreate(key: string, value: PendingCreate): void {
  try {
    getSessionStorage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is optional. The hook still retains the command in memory.
  }
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
  /** True when a valid scoped command was restored from sessionStorage. */
  restored: boolean;
}

/**
 * A network failure, 408, 5xx, or an in-progress/race 409 may have committed
 * server-side: the command stays uncertain and retries with the same key.
 */
export function isUnknownCreateOutcome(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return (
    error.status === 408 ||
    error.status >= 500 ||
    (error.status === 409 &&
      (error.errorCode === 'IDEMPOTENCY_RACE_UNRESOLVED' ||
        error.errorCode === 'REQUEST_IN_PROGRESS'))
  );
}

export function clearPendingCreateCommands(): void {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(PENDING_CREATE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    // Logout remains best-effort if sessionStorage is unavailable.
  }
}

export function useIdempotencyKey(scope?: IdempotencyKeyScope): IdempotencyKeyHandle {
  const state = useRef<IdempotencyKeyState | null>(null);
  const scopeRef = useRef<IdempotencyKeyScope | undefined>(scope);
  scopeRef.current = scope;
  const [restored, setRestored] = useState(false);
  const restoredRef = useRef(restored);
  restoredRef.current = restored;

  useEffect(() => {
    const currentScope = scopeRef.current;
    const key = scopeKey(currentScope);
    if (!key || !currentScope?.actorId) {
      setRestored(false);
      return;
    }
    if (state.current?.scopeKey === key && state.current.actorId === currentScope.actorId) return;

    const restoredEntry = readPendingCreate(key, currentScope.actorId);
    state.current = restoredEntry
      ? { ...restoredEntry, scopeKey: key, actorId: currentScope.actorId }
      : null;
    setRestored(restoredEntry !== null);
  }, [scope?.actorId, scope?.fundId, scope?.operation]);

  const handle = useRef<IdempotencyKeyHandle | null>(null);
  if (handle.current === null) {
    handle.current = {
      keyFor: (payload) => {
        const serializedPayload = JSON.stringify(payload) ?? '';
        const currentScope = scopeRef.current;
        const key = scopeKey(currentScope);

        if (key && currentScope?.actorId) {
          const fingerprint = typeof payload === 'string' ? payload : serializedPayload;
          if (state.current?.scopeKey !== key || state.current.actorId !== currentScope.actorId) {
            const restoredEntry = readPendingCreate(key, currentScope.actorId);
            state.current = restoredEntry
              ? { ...restoredEntry, scopeKey: key, actorId: currentScope.actorId }
              : null;
            setRestored(restoredEntry !== null);
          }

          if (state.current?.fingerprint === fingerprint) return state.current.key;

          const next = {
            actorId: currentScope.actorId,
            key: crypto.randomUUID(),
            fingerprint,
            createdAt: Date.now(),
          } satisfies PendingCreate;
          state.current = { ...next, scopeKey: key, actorId: currentScope.actorId };
          writePendingCreate(key, next);
          setRestored(false);
          return next.key;
        }

        if (
          state.current === null ||
          state.current.scopeKey !== null ||
          state.current.fingerprint !== serializedPayload
        ) {
          state.current = {
            key: crypto.randomUUID(),
            fingerprint: serializedPayload,
            scopeKey: null,
            actorId: null,
          };
        }
        return state.current.key;
      },
      reset: () => {
        const key = scopeKey(scopeRef.current);
        state.current = null;
        setRestored(false);
        if (key) {
          try {
            getSessionStorage()?.removeItem(key);
          } catch {
            // Storage is optional.
          }
        }
      },
      // Read through a ref so the handle stays referentially stable.
      get restored() {
        return restoredRef.current;
      },
    };
  }

  return handle.current;
}
