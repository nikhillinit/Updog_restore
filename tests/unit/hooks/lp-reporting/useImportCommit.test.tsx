/**
 * LP Reporting -- import commit hook tests.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import { useLedgerImportCommit, useValuationMarkImportCommit } from '@/hooks/lp-reporting';
import type { ImportCommitRequest, ImportCommitResponse } from '@shared/contracts/lp-reporting';

const previewHash = 'a'.repeat(64);
const requestBody: ImportCommitRequest = {
  sourceType: 'csv',
  payload: Buffer.from('a,b\n1,2\n').toString('base64'),
  previewHash,
};
const responseBody: ImportCommitResponse = {
  importBatchId: '11111111-2222-3333-4444-555555555555',
  previewHash,
  insertedCount: 1,
  skippedExistingCount: 0,
  skippedDuplicateCount: 0,
  skippedExcludedCount: 0,
  insertedIds: [10],
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper };
}

describe('import commit hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('useLedgerImportCommit posts to the ledger commit endpoint and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(responseBody), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLedgerImportCommit(7), { wrapper: Wrapper });

    result.current.mutate(requestBody);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/imports/ledger/commit');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(requestBody);
    expect(result.current.data?.insertedIds).toEqual([10]);
  });

  it('useValuationMarkImportCommit surfaces route errors with code and status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'PREVIEW_HASH_MISMATCH',
          message: 'Dry-run preview hash no longer matches the submitted payload.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useValuationMarkImportCommit(7), { wrapper: Wrapper });

    result.current.mutate(requestBody);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('PREVIEW_HASH_MISMATCH');
    expect(result.current.error?.status).toBe(409);
  });

  it('does not call fetch when fundId is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLedgerImportCommit(null), { wrapper: Wrapper });

    result.current.mutate(requestBody);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('MISSING_FUND_ID');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
