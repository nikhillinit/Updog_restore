import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildLpCapitalCallPatch,
  formFromEvent,
  isCashEventFormValid,
  useApproveCashFlowEvent,
  useCashFlowEvents,
  useLockCashFlowEvent,
  useUpdateCashFlowEvent,
} from '@/hooks/useCashFlowEvents';
import type { CashFlowEventResponse } from '@shared/contracts/lp-reporting/cash-flow-event.contract';

const sampleEvent: CashFlowEventResponse = {
  id: 10,
  fundId: 1,
  eventType: 'lp_capital_call',
  amount: '1250000.000000',
  currency: 'USD',
  eventDate: '2026-06-15T14:30:00.000Z',
  perspective: 'lp_net',
  description: null,
  payload: { callNumber: 1 },
  status: 'draft',
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
  etag: 'W/"abc"',
};

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

function mockFetchJson(payload: unknown, ok = true, status = ok ? 200 : 500) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      text: vi
        .fn()
        .mockResolvedValue(typeof payload === 'string' ? payload : JSON.stringify(payload)),
      json: vi.fn().mockResolvedValue(payload),
    })
  );
}

describe('useCashFlowEvents (query)', () => {
  beforeEach(() => {
    mockFetchJson({ data: [sampleEvent] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when there is no fund id', async () => {
    renderHook(() => useCashFlowEvents(undefined), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when disabled', async () => {
    renderHook(() => useCashFlowEvents('1', { enabled: false }), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the fund-scoped endpoint and unwraps the data array', async () => {
    const { result } = renderHook(() => useCashFlowEvents('1'), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledWith('/api/funds/1/cash-flow-events');
    expect(result.current.data).toEqual([sampleEvent]);
  });

  it('surfaces API error messages', async () => {
    mockFetchJson({ message: 'Cash events unavailable' }, false);
    const { result } = renderHook(() => useCashFlowEvents('1'), {
      wrapper: createWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Cash events unavailable');
  });
});

describe('buildLpCapitalCallPatch', () => {
  it('returns an empty patch when nothing changed', () => {
    expect(buildLpCapitalCallPatch(sampleEvent, formFromEvent(sampleEvent))).toEqual({});
  });

  it('serializes only changed top-level fields', () => {
    const form = { ...formFromEvent(sampleEvent), amount: '2000000' };
    expect(buildLpCapitalCallPatch(sampleEvent, form)).toEqual({ amount: '2000000' });
  });

  it('clears a nullable field when cleared to empty string', () => {
    const withDesc = { ...sampleEvent, description: 'old' };
    const form = { ...formFromEvent(withDesc), description: '' };
    expect(buildLpCapitalCallPatch(withDesc, form)).toEqual({ description: null });
  });

  it('preserves the original time component when only the date changes', () => {
    const form = { ...formFromEvent(sampleEvent), eventDate: '2026-08-01' };
    expect(buildLpCapitalCallPatch(sampleEvent, form)).toEqual({
      eventDate: '2026-08-01T14:30:00.000Z',
    });
  });

  it('builds a shallow payload patch with only changed sub-keys', () => {
    const form = { ...formFromEvent(sampleEvent), dueDate: '2026-09-01', callNumber: '' };
    expect(buildLpCapitalCallPatch(sampleEvent, form)).toEqual({
      payload: { callNumber: null, dueDate: '2026-09-01' },
    });
  });
});

describe('isCashEventFormValid', () => {
  it('accepts a well-formed form', () => {
    expect(isCashEventFormValid(formFromEvent(sampleEvent))).toBe(true);
  });
  it('rejects a malformed amount', () => {
    expect(isCashEventFormValid({ ...formFromEvent(sampleEvent), amount: '1.2.3' })).toBe(false);
  });
  it('rejects a non-positive call number', () => {
    expect(isCashEventFormValid({ ...formFromEvent(sampleEvent), callNumber: '0' })).toBe(false);
  });
});

describe('useUpdateCashFlowEvent (mutation)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends PATCH with If-Match and the serialized patch, then invalidates the list', async () => {
    mockFetchJson({ ...sampleEvent, amount: '2000000.000000', etag: 'W/"def"' });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useUpdateCashFlowEvent('1'), {
      wrapper: createWrapper(client),
    });

    await result.current.mutateAsync({
      eventId: 10,
      etag: 'W/"abc"',
      patch: { amount: '2000000' },
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/funds/1/cash-flow-events/10',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ amount: '2000000' }),
        headers: expect.objectContaining({ 'If-Match': 'W/"abc"' }),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cash-flow-events', '1'] });
  });

  it('surfaces { status, message } on a 412 conflict', async () => {
    mockFetchJson({ error: 'precondition_failed', message: 'Event has been modified' }, false, 412);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateCashFlowEvent('1'), {
      wrapper: createWrapper(client),
    });

    await expect(
      result.current.mutateAsync({ eventId: 10, etag: 'W/"abc"', patch: { amount: '5' } })
    ).rejects.toMatchObject({ status: 412, message: 'Event has been modified' });
  });
});

describe('useApproveCashFlowEvent / useLockCashFlowEvent', () => {
  it('approve POSTs bodyless to the approve URL with If-Match and invalidates', async () => {
    mockFetchJson({ ...sampleEvent, status: 'approved', etag: 'W/"v2"' });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useApproveCashFlowEvent('1'), {
      wrapper: createWrapper(client),
    });

    await result.current.mutateAsync({ eventId: 10, etag: 'W/"v1"' });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/funds/1/cash-flow-events/10/approve');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual(expect.objectContaining({ 'If-Match': 'W/"v1"' }));
    expect(init.headers).not.toHaveProperty('Idempotency-Key');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cash-flow-events', '1'] });
  });

  it('lock POSTs to the lock URL', async () => {
    mockFetchJson({ ...sampleEvent, status: 'locked', etag: 'W/"v3"' });
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useLockCashFlowEvent('1'), {
      wrapper: createWrapper(client),
    });
    await result.current.mutateAsync({ eventId: 10, etag: 'W/"v2"' });
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/funds/1/cash-flow-events/10/lock');
    expect(init.method).toBe('POST');
  });

  it('preserves server status + message on 412 conflict', async () => {
    mockFetchJson({ message: 'Event has been modified' }, false, 412);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useApproveCashFlowEvent('1'), {
      wrapper: createWrapper(client),
    });
    await expect(
      result.current.mutateAsync({ eventId: 10, etag: 'W/"stale"' })
    ).rejects.toMatchObject({ status: 412, message: expect.stringMatching(/modified/i) });
  });

  it('does not POST when fundId is missing', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useApproveCashFlowEvent(undefined), {
      wrapper: createWrapper(client),
    });
    await expect(result.current.mutateAsync({ eventId: 10, etag: 'W/"v1"' })).rejects.toMatchObject(
      { status: 0 }
    );
  });
});
