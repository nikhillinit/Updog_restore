import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSharedDashboard } from '@/pages/shared-dashboard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function snapshotResponse(shareId: string) {
  return {
    success: true,
    share: {
      id: shareId,
      requirePasskey: false,
      customTitle: null,
      customMessage: null,
      expiresAt: null,
      snapshot: {
        payloadVersion: 'public-share-snapshot.v1',
        snapshotId: `snapshot-${shareId}`,
        shareId,
        title: `Share ${shareId}`,
        message: null,
        asOfDate: '2026-09-06T00:00:00.000Z',
        generatedAt: '2026-09-06T00:00:00.000Z',
        metrics: [],
        portfolioCompanies: [],
        hiddenMetricPolicy: { requested: [], applied: [] },
        sourceCalculationRunIds: [],
      },
    },
  };
}

function response(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe('useSharedDashboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ignores an older share response after the URL share ID changes', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => (url.includes('/second') ? second.promise : first.promise))
    );

    const { result, rerender } = renderHook(({ shareId }) => useSharedDashboard(shareId), {
      initialProps: { shareId: 'first' },
    });
    rerender({ shareId: 'second' });

    await act(async () => second.resolve(response(snapshotResponse('second'))));
    await waitFor(() => expect(result.current.snapshot?.shareId).toBe('second'));
    await act(async () => first.resolve(response(snapshotResponse('first'))));

    expect(result.current.snapshot?.shareId).toBe('second');
  });

  it('rejects malformed successful response data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ success: true, share: { id: 'x' } }))
    );
    const { result } = renderHook(() => useSharedDashboard('x'));

    await waitFor(() => expect(result.current.error).toBe('Public share response is invalid'));
    expect(result.current.snapshot).toBeNull();
  });

  it('ignores passkey verification completed for a previous share ID', async () => {
    const verify = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (init?.method === 'POST') return verify.promise;
        if (url.includes('/second')) return Promise.resolve(response(snapshotResponse('second')));
        return Promise.resolve(
          response({
            success: true,
            share: {
              id: 'first',
              requirePasskey: true,
              customTitle: null,
              customMessage: null,
              expiresAt: null,
            },
          })
        );
      })
    );

    const { result, rerender } = renderHook(({ shareId }) => useSharedDashboard(shareId), {
      initialProps: { shareId: 'first' },
    });
    await waitFor(() => expect(result.current.requiresPasskey).toBe(true));

    let verification!: Promise<boolean>;
    act(() => {
      verification = result.current.verifyPasskey('secret');
    });
    rerender({ shareId: 'second' });
    await waitFor(() => expect(result.current.snapshot?.shareId).toBe('second'));
    await act(async () => verify.resolve(response(snapshotResponse('first'))));

    await expect(verification).resolves.toBe(false);
    expect(result.current.snapshot?.shareId).toBe('second');
  });
});
