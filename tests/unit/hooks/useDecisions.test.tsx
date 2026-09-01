import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateDecision,
  useCreateDecisionEvidenceLink,
  useDecisionEvidenceLinks,
  useDecisions,
  useRecordDecisionOutcome,
  useSupersedeDecision,
  useTransitionDecision,
} from '@/hooks/useDecisions';
import type { ApiError } from '@/lib/queryClient';

const decision = {
  contractVersion: 'decision/1.0.0',
  decisionId: 1,
  fundId: 7,
  title: 'Keep reserve',
  recommendation: 'Keep reserve available',
  status: 'accepted',
  supersedesDecisionId: null,
  outcome: null,
  outcomeRecordedAt: null,
  outcomeRecordedBy: null,
  followUpOwnerId: null,
  followUpDate: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  etag: 'W/"1"',
} as const;

const decisionEvidenceLink = {
  contractVersion: 'decision-evidence-link/1.0.0',
  linkId: 11,
  fundId: 7,
  decisionId: 1,
  target: { kind: 'analysis_reference', id: 22 },
  createdAt: '2026-08-31T12:00:00.000Z',
} as const;

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useDecisions', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'decision-idempotency-key') });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns fund-scoped decision rows from the list response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [decision] }));
    const client = createClient();
    const { result } = renderHook(() => useDecisions(7), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual([decision]));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('does not fetch decisions without a fund ID', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = createClient();

    renderHook(() => useDecisions(undefined), { wrapper: createWrapper(client) });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches decision evidence only after the selected row is enabled', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [decisionEvidenceLink] }));
    const client = createClient();
    const { result, rerender } = renderHook(
      ({ enabled }) => useDecisionEvidenceLinks(7, 1, { enabled }),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(client),
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toEqual([decisionEvidenceLink]));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions/1/evidence-links',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('creates a decision with an idempotency key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(decision, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        fundId: 7,
        title: 'Keep reserve',
        recommendation: 'Keep reserve available',
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'decision-idempotency-key' }),
      })
    );
  });

  it('reuses the idempotency key on retry after failure and mints a fresh key after success', async () => {
    let uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(decision, 201))
      .mockResolvedValueOnce(jsonResponse(decision, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateDecision(7), {
      wrapper: createWrapper(client),
    });
    const input = {
      fundId: 7,
      title: 'Keep reserve',
      recommendation: 'Keep reserve available',
    };

    await act(async () => {
      await result.current.mutateAsync(input).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });
    await act(async () => {
      await result.current.mutateAsync(input);
    });

    const keys = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key']
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBeDefined();
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('mints a fresh idempotency key when the payload changes after a failure', async () => {
    let uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(decision, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current
        .mutateAsync({ fundId: 7, title: 'First', recommendation: 'A' })
        .catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Second', recommendation: 'B' });
    });

    const keys = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key']
    );
    expect(keys[1]).toBeDefined();
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('invalidates only the fund decision list after decision creation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(decision, 201));
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        fundId: 7,
        title: 'Keep reserve',
        recommendation: 'Keep reserve available',
      });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });

  it('transitions a decision with its row ETag', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ...decision, status: 'rejected' }));
    const client = createClient();
    const { result } = renderHook(() => useTransitionDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        etag: 'W/"1"',
        input: { status: 'rejected' },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions/1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ 'If-Match': 'W/"1"' }),
      })
    );
  });

  it('invalidates the fund decision list after a successful transition', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...decision, status: 'rejected' })
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransitionDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        etag: 'W/"1"',
        input: { status: 'rejected' },
      });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });

  it('records an outcome with its row ETag', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ ...decision, outcome: 'Reserve remained unused' }));
    const client = createClient();
    const { result } = renderHook(() => useRecordDecisionOutcome(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        etag: 'W/"1"',
        input: { outcome: 'Reserve remained unused' },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions/1/outcome',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'If-Match': 'W/"1"' }),
      })
    );
  });

  it('invalidates the fund decision list after successful outcome recording', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ ...decision, outcome: 'Reserve remained unused' })
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecordDecisionOutcome(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        etag: 'W/"1"',
        input: { outcome: 'Reserve remained unused' },
      });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });

  it('supersedes a decision with an idempotency key', async () => {
    const successor = { ...decision, decisionId: 2, supersedesDecisionId: 1 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(successor, 201));
    const client = createClient();
    const { result } = renderHook(() => useSupersedeDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        input: {
          fundId: 7,
          title: 'Release reserve',
          recommendation: 'Release unused reserve',
        },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions/1/supersede',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'decision-idempotency-key' }),
      })
    );
  });

  it('invalidates the fund decision list after successful supersession', async () => {
    const successor = { ...decision, decisionId: 2, supersedesDecisionId: 1 };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(successor, 201));
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useSupersedeDecision(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        input: {
          fundId: 7,
          title: 'Release reserve',
          recommendation: 'Release unused reserve',
        },
      });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });

  it('creates a decision evidence link with an idempotency key', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(decisionEvidenceLink, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateDecisionEvidenceLink(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        input: { target: { kind: 'analysis_reference', id: 22 } },
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/decisions/1/evidence-links',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'decision-idempotency-key' }),
      })
    );
  });

  it('invalidates the decision list and only the changed evidence row', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(decisionEvidenceLink, 201));
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateDecisionEvidenceLink(7), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        decisionId: 1,
        input: { target: { kind: 'analysis_reference', id: 22 } },
      });
    });

    expect(invalidate.mock.calls).toEqual([
      [{ queryKey: ['decisions', 7] }],
      [{ queryKey: ['decision-evidence-links', 7, 1] }],
    ]);
  });

  it('surfaces a forbidden decision-create response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Fund write role required' }, 403)
    );
    const client = createClient();
    const { result } = renderHook(() => useCreateDecision(7), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () =>
        result.current.mutateAsync({
          fundId: 7,
          title: 'Keep reserve',
          recommendation: 'Keep reserve available',
        })
      )
    ).rejects.toMatchObject<ApiError>({ status: 403, message: 'Fund write role required' });
  });

  it('surfaces an in-flight supersede conflict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Command already in progress' }, 409)
    );
    const client = createClient();
    const { result } = renderHook(() => useSupersedeDecision(7), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () =>
        result.current.mutateAsync({
          decisionId: 1,
          input: {
            fundId: 7,
            title: 'Release reserve',
            recommendation: 'Release unused reserve',
          },
        })
      )
    ).rejects.toMatchObject<ApiError>({ status: 409, message: 'Command already in progress' });
  });

  it('surfaces stale transition and refreshes the decision list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Decision changed' }, 412)
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useTransitionDecision(7), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () =>
        result.current.mutateAsync({
          decisionId: 1,
          etag: 'W/"1"',
          input: { status: 'rejected' },
        })
      )
    ).rejects.toMatchObject<ApiError>({ status: 412, message: 'Decision changed' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });

  it('surfaces stale outcome recording and refreshes the decision list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Decision changed' }, 412)
    );
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useRecordDecisionOutcome(7), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () =>
        result.current.mutateAsync({
          decisionId: 1,
          etag: 'W/"1"',
          input: { outcome: 'Reserve remained unused' },
        })
      )
    ).rejects.toMatchObject<ApiError>({ status: 412, message: 'Decision changed' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decisions', 7] });
  });
});
