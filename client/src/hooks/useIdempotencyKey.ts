import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ApiError } from '@/lib/queryClient';

interface IdempotencyKeyState {
  key: string;
  fingerprint: string;
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
   * operation, never a spurious request-hash 409). Pass the scope captured
   * before any await: the hook's scope can change while a payload hashes.
   */
  keyFor: (payload: unknown, scope?: IdempotencyKeyScope) => string;
  /** Call on settlement, with the command's scope, so the next operation mints a fresh key. */
  reset: (scope?: IdempotencyKeyScope) => void;
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

// Memory first (this tab's own command, possibly never persisted), then an
// entry left in sessionStorage by an earlier page life.
function pendingFor(
  commands: Map<string | null, IdempotencyKeyState>,
  key: string,
  actorId: string
): { entry: IdempotencyKeyState | null; fromStorage: boolean } {
  const memory = commands.get(key);
  if (memory?.actorId === actorId) return { entry: memory, fromStorage: false };

  const stored = readPendingCreate(key, actorId);
  if (!stored) {
    commands.delete(key);
    return { entry: null, fromStorage: false };
  }
  const entry = { key: stored.key, fingerprint: stored.fingerprint, actorId };
  commands.set(key, entry);
  return { entry, fromStorage: true };
}

export function useIdempotencyKey(scope?: IdempotencyKeyScope): IdempotencyKeyHandle {
  // One pending command per scope (null = unscoped), kept until settlement or
  // discard. Memory is the only copy when a sessionStorage write fails, so a
  // scope change must never evict another scope's key.
  const commands = useRef(new Map<string | null, IdempotencyKeyState>());
  const scopeRef = useRef<IdempotencyKeyScope | undefined>(scope);
  scopeRef.current = scope;
  const [restored, setRestored] = useState(false);
  const restoredRef = useRef(restored);
  restoredRef.current = restored;

  useEffect(() => {
    const currentScope = scopeRef.current;
    const key = scopeKey(currentScope);
    setRestored(
      key !== null &&
        !!currentScope?.actorId &&
        pendingFor(commands.current, key, currentScope.actorId).fromStorage
    );
  }, [scope?.actorId, scope?.fundId, scope?.operation]);

  const handle = useRef<IdempotencyKeyHandle | null>(null);
  if (handle.current === null) {
    handle.current = {
      keyFor: (payload, boundScope) => {
        const serializedPayload = JSON.stringify(payload) ?? '';
        const currentScope = boundScope ?? scopeRef.current;
        const key = scopeKey(currentScope);
        // `restored` describes the hook's own scope, never a bound one.
        const ownScope = key === scopeKey(scopeRef.current);

        if (key && currentScope?.actorId) {
          const fingerprint = typeof payload === 'string' ? payload : serializedPayload;
          const { entry, fromStorage } = pendingFor(commands.current, key, currentScope.actorId);
          if (fromStorage && ownScope) setRestored(true);
          if (entry?.fingerprint === fingerprint) return entry.key;

          const next = {
            actorId: currentScope.actorId,
            key: crypto.randomUUID(),
            fingerprint,
            createdAt: Date.now(),
          } satisfies PendingCreate;
          commands.current.set(key, next);
          writePendingCreate(key, next);
          if (ownScope) setRestored(false);
          return next.key;
        }

        const unscoped = commands.current.get(null);
        if (unscoped?.fingerprint === serializedPayload) return unscoped.key;
        const next = { key: crypto.randomUUID(), fingerprint: serializedPayload, actorId: null };
        commands.current.set(null, next);
        return next.key;
      },
      reset: (boundScope) => {
        const key = scopeKey(boundScope ?? scopeRef.current);
        commands.current.delete(key);
        if (key === scopeKey(scopeRef.current)) setRestored(false);
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
