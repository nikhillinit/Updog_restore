import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReserveIntelligence } from '../../../client/src/hooks/useReserveIntelligence';
import { makeReserveIntelligenceRun } from '../fixtures/dynamic-reserve-intelligence';

const fetchMock = vi.fn<typeof fetch>();

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useReserveIntelligence', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the exact latest-run path with included credentials', async () => {
    fetchMock.mockResolvedValue(jsonResponse(makeReserveIntelligenceRun()));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith('/api/funds/7/moic/reserve-intelligence/latest', {
      credentials: 'include',
    });
  });

  it.each([null, 0, -1, 1.5])('does not fetch for invalid fund id %s', (fundId) => {
    const { result } = renderHook(() => useReserveIntelligence(fundId), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps the server-disabled 404 body to feature-disabled without error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'not_found' }, 404));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('feature-disabled'));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps the no-persisted-run 404 body to no-run without error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'RESERVE_INTELLIGENCE_RUN_NOT_FOUND' }, 404));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('no-run'));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails safe to feature-disabled for an unrecognized 404 code', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'FUND_SCOPE_NOT_FOUND' }, 404));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('feature-disabled'));
    expect(result.current.error).toBeNull();
  });

  it('surfaces malformed success bodies as contract parse errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ snapshotId: 41, result: {} }));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR'));
    expect(result.current.data).toBeUndefined();
  });

  it('rejects a non-integer final planned reserves value', async () => {
    const run = makeReserveIntelligenceRun();
    run.result.provenance.marginalNonFactsSources.approvedAllocations[0]!.finalPlannedReservesCents =
      '12.5';
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR'));
    expect(result.current.data).toBeUndefined();
  });

  it('accepts a negative integer final planned reserves value', async () => {
    const run = makeReserveIntelligenceRun();
    run.result.provenance.marginalNonFactsSources.approvedAllocations[0]!.finalPlannedReservesCents =
      '-1200';
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('accepts a null final planned reserves value', async () => {
    const run = makeReserveIntelligenceRun();
    run.result.provenance.marginalNonFactsSources.approvedAllocations[0]!.finalPlannedReservesCents =
      null;
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('returns a schema-valid reserve intelligence run', async () => {
    const run = makeReserveIntelligenceRun();
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('ready'));
    if (result.current.data?.kind !== 'ready') {
      throw new Error('Expected ready reserve intelligence state');
    }
    expect(result.current.data.run).toEqual(run);
  });

  it('accepts a payload 3 facts snapshot', async () => {
    const run = makeReserveIntelligenceRun('financial-facts-policy/1.2.0');
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('ready'));
    expect(result.current.error).toBeNull();
  });

  it('accepts a policy 1.3.0 payload 4 facts snapshot', async () => {
    const run = makeReserveIntelligenceRun('financial-facts-policy/1.3.0');
    fetchMock.mockResolvedValue(jsonResponse(run));

    const { result } = renderHook(() => useReserveIntelligence(7), { wrapper });

    await waitFor(() => expect(result.current.data?.kind).toBe('ready'));
    expect(result.current.error).toBeNull();
    if (result.current.data?.kind !== 'ready') {
      throw new Error('Expected ready reserve intelligence state');
    }
    expect(result.current.data.run.result.provenance.factsSnapshot.policyVersion).toBe(
      'financial-facts-policy/1.3.0'
    );
  });
});
