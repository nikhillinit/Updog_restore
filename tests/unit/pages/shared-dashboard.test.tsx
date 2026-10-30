import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SharedDashboard, { useSharedDashboard } from '@/pages/shared-dashboard';
import { createWouterWrapper } from '../../utils/withWouter';

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

function errorResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response;
}

function passkeyRequiredResponse(shareId: string) {
  return {
    success: true,
    share: {
      id: shareId,
      requirePasskey: true,
      customTitle: null,
      customMessage: null,
      expiresAt: null,
    },
  };
}

function stubShareFetch(verify: () => Promise<Response>, load?: () => Promise<Response>) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? verify()
      : (load ?? (() => Promise.resolve(response(passkeyRequiredResponse('abc')))))()
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSharedDashboard() {
  const { Wrapper } = createWouterWrapper('/shared/abc');
  return render(<SharedDashboard />, { wrapper: Wrapper });
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

    let verification!: ReturnType<typeof result.current.verifyPasskey>;
    act(() => {
      verification = result.current.verifyPasskey('secret');
    });
    rerender({ shareId: 'second' });
    await waitFor(() => expect(result.current.snapshot?.shareId).toBe('second'));
    await act(async () => verify.resolve(response(snapshotResponse('first'))));

    await expect(verification).resolves.toEqual({ status: 'superseded' });
    expect(result.current.snapshot?.shareId).toBe('second');
  });

  it('returns a verification failure inline without writing the share-load error', async () => {
    stubShareFetch(() =>
      Promise.resolve(errorResponse(410, { success: false, error: 'Share has expired' }))
    );
    const { result } = renderHook(() => useSharedDashboard('abc'));
    await waitFor(() => expect(result.current.requiresPasskey).toBe(true));

    let outcome!: Awaited<ReturnType<typeof result.current.verifyPasskey>>;
    await act(async () => {
      outcome = await result.current.verifyPasskey('secret');
    });

    expect(outcome).toEqual({ status: 'failed', message: 'Share has expired' });
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isVerifying).toBe(false);
    expect(result.current.requiresPasskey).toBe(true);
  });
});

describe('SharedDashboard passkey form', () => {
  afterEach(() => vi.unstubAllGlobals());

  const verificationFailures: Array<[string, () => Promise<Response>, string]> = [
    [
      '400',
      () =>
        Promise.resolve(
          errorResponse(400, { success: false, error: 'Share does not require passkey' })
        ),
      'Share does not require passkey',
    ],
    [
      '401',
      () => Promise.resolve(errorResponse(401, { success: false, error: 'Invalid passkey' })),
      'Invalid passkey',
    ],
    [
      '404',
      () => Promise.resolve(errorResponse(404, { success: false, error: 'Share not found' })),
      'Share not found',
    ],
    [
      '410',
      () => Promise.resolve(errorResponse(410, { success: false, error: 'Share has expired' })),
      'Share has expired',
    ],
    [
      '429',
      () =>
        Promise.resolve(
          errorResponse(429, {
            success: false,
            error: 'too_many_requests',
            message: 'Too many passkey attempts. Please try again later.',
          })
        ),
      'Too many passkey attempts. Please try again later.',
    ],
    [
      '503',
      () =>
        Promise.resolve(
          errorResponse(503, {
            success: false,
            error: 'snapshot_unavailable',
            message: 'Public share snapshot is unavailable',
          })
        ),
      'Public share snapshot is unavailable',
    ],
    [
      'network failure',
      () => Promise.reject(new TypeError('fetch failed')),
      'Failed to verify passkey',
    ],
  ];

  it.each(verificationFailures)(
    'keeps the form mounted with an accessible inline error on a %s verification failure',
    async (_label, verify, message) => {
      stubShareFetch(verify);
      const user = userEvent.setup();
      renderSharedDashboard();

      const input = await screen.findByLabelText('Enter Passkey');
      await user.type(input, 'wrong-key');
      await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      expect(alert.id).not.toBe('');
      const passkeyInput = screen.getByLabelText('Enter Passkey');
      expect(passkeyInput).toHaveValue('wrong-key');
      expect(passkeyInput).toHaveAttribute('aria-invalid', 'true');
      expect(passkeyInput).toHaveAttribute('aria-describedby', alert.id);
      expect(passkeyInput).toHaveFocus();
      expect(screen.queryByText('Access Error')).not.toBeInTheDocument();
      if (message !== 'Invalid passkey') {
        expect(screen.queryByText(/invalid passkey/i)).not.toBeInTheDocument();
      }
    }
  );

  it('keeps the form mounted with a disabled Verifying button while verification is pending', async () => {
    const verify = deferred<Response>();
    stubShareFetch(() => verify.promise);
    const user = userEvent.setup();
    renderSharedDashboard();

    await user.type(await screen.findByLabelText('Enter Passkey'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    expect(screen.getByRole('button', { name: 'Verifying...' })).toBeDisabled();
    expect(screen.getByLabelText('Enter Passkey')).toHaveValue('secret');
    expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument();

    await act(async () => verify.resolve(response(snapshotResponse('abc'))));
    expect(await screen.findByText('Share abc')).toBeInTheDocument();
  });

  it('still renders the global access error when the initial share load fails', async () => {
    stubShareFetch(
      () => Promise.reject(new Error('verify should not run')),
      () => Promise.resolve(errorResponse(404, { success: false, error: 'Share not found' }))
    );
    renderSharedDashboard();

    expect(await screen.findByText('Access Error')).toBeInTheDocument();
    expect(screen.getByText('Share not found')).toBeInTheDocument();
    expect(screen.queryByLabelText('Enter Passkey')).not.toBeInTheDocument();
  });
});
