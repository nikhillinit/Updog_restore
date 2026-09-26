import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingCreateCommands,
  isUnknownCreateOutcome,
  useIdempotencyKey,
  type IdempotencyKeyScope,
} from '@/hooks/useIdempotencyKey';
import { ApiError } from '@/lib/queryClient';

const ENTRY = 'pending-create:v1:1:deal_create';
const scope = (actorId: string | null = '7'): IdempotencyKeyScope => ({
  fundId: 1,
  operation: 'deal_create',
  actorId,
});
const stored = () => JSON.parse(sessionStorage.getItem(ENTRY) ?? 'null');

describe('useIdempotencyKey', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the unscoped in-memory behavior and a stable handle', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const handle = result.current;
    const key = handle.keyFor({ a: 1 });

    rerender();
    expect(result.current).toBe(handle);
    expect(result.current.keyFor({ a: 1 })).toBe(key);
    expect(result.current.keyFor({ a: 2 })).not.toBe(key);
    expect(sessionStorage.length).toBe(0);
  });

  it('writes the scoped entry before returning, reuses it per digest, and rotates on change', () => {
    const { result } = renderHook(() => useIdempotencyKey(scope()));

    const key = result.current.keyFor('digest-a');
    expect(stored()).toMatchObject({ actorId: '7', key, fingerprint: 'digest-a' });
    expect(result.current.keyFor('digest-a')).toBe(key);

    const rotated = result.current.keyFor('digest-b');
    expect(rotated).not.toBe(key);
    expect(stored()).toMatchObject({ key: rotated, fingerprint: 'digest-b' });
  });

  it('restores a same-actor entry after a reload and reuses its key for the same digest', () => {
    sessionStorage.setItem(
      ENTRY,
      JSON.stringify({ actorId: '7', key: 'kept-key', fingerprint: 'digest-a', createdAt: 1 })
    );
    const { result } = renderHook(() => useIdempotencyKey(scope()));

    expect(result.current.restored).toBe(true);
    expect(result.current.keyFor('digest-a')).toBe('kept-key');
  });

  it('removes another actor entry and a corrupt entry on restore', () => {
    sessionStorage.setItem(
      ENTRY,
      JSON.stringify({ actorId: '8', key: 'other', fingerprint: 'digest-a', createdAt: 1 })
    );
    const other = renderHook(() => useIdempotencyKey(scope()));
    expect(other.result.current.restored).toBe(false);
    expect(sessionStorage.getItem(ENTRY)).toBeNull();

    sessionStorage.setItem(ENTRY, '{not json');
    const corrupt = renderHook(() => useIdempotencyKey(scope()));
    expect(corrupt.result.current.restored).toBe(false);
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
  });

  it('neither reads nor writes storage without a session actor', () => {
    const { result } = renderHook(() => useIdempotencyKey(scope(null)));
    const key = result.current.keyFor('digest-a');

    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.keyFor('digest-a')).toBe(key);
    expect(Object.keys(sessionStorage)).toEqual([]);
  });

  it('falls back to memory when the storage write throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const { result } = renderHook(() => useIdempotencyKey(scope()));

    const key = result.current.keyFor('digest-a');
    expect(result.current.keyFor('digest-a')).toBe(key);
  });

  it('clears its own entry on reset and every pending-create entry on logout', () => {
    const { result } = renderHook(() => useIdempotencyKey(scope()));
    const key = result.current.keyFor('digest-a');

    act(() => result.current.reset());
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    expect(result.current.keyFor('digest-a')).not.toBe(key);

    sessionStorage.setItem('pending-create:v1:2:company_create', '{}');
    sessionStorage.setItem('unrelated', 'keep');
    clearPendingCreateCommands();
    expect(sessionStorage.getItem(ENTRY)).toBeNull();
    expect(sessionStorage.getItem('pending-create:v1:2:company_create')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });

  it('classifies outcomes that may have committed as unknown', () => {
    expect(isUnknownCreateOutcome(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUnknownCreateOutcome(new ApiError(408, 'timeout'))).toBe(true);
    expect(isUnknownCreateOutcome(new ApiError(502, 'bad gateway'))).toBe(true);
    expect(isUnknownCreateOutcome(new ApiError(409, 'busy', 'REQUEST_IN_PROGRESS'))).toBe(true);
    expect(isUnknownCreateOutcome(new ApiError(409, 'race', 'IDEMPOTENCY_RACE_UNRESOLVED'))).toBe(
      true
    );
    expect(isUnknownCreateOutcome(new ApiError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'))).toBe(false);
    expect(isUnknownCreateOutcome(new ApiError(400, 'invalid'))).toBe(false);
    expect(isUnknownCreateOutcome(new ApiError(403, 'forbidden'))).toBe(false);
  });
});
