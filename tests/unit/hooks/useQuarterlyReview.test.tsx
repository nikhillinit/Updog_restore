import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  quarterlyReviewQueryKey,
  useQuarterlyReview,
  useQuarterlyReviewCommands,
} from '@/hooks/useQuarterlyReview';
import {
  internalAnalysisDraftsQueryKey,
  useRefreshInternalAnalysisDraft,
  useReplaceInternalAnalysisEconomicsReference,
} from '@/hooks/useInternalAnalysis';

const healthyReview = {
  contractVersion: 'quarterly-review-v1',
  draftId: 11,
  fundId: 7,
  rosterId: 31,
  draftVersion: 3,
  financialFactsSnapshotId: 91,
  draftEtag: '"analysis-draft:11:3"',
  requiresRefresh: false,
  completion: {
    companyCount: 1,
    completedCompanyCount: 0,
    pendingCompanyCount: 1,
    pendingItemCount: 5,
  },
  canFinalize: false,
  capabilities: {
    operatingDecision: {
      availability: 'unavailable' as const,
      reason: 'dependency_not_available' as const,
    },
  },
  companies: [
    {
      id: 301,
      portfolioCompanyId: 101,
      companyName: 'Acme',
      etag: '"quarterly-review-company:101:1"',
      waivedAt: null,
      waivedBy: null as number | null,
      waiverReason: null,
      version: 1,
      items: [
        'cases_probabilities',
        'kpis',
        'valuation_fmv',
        'reserve_plan',
        'qualitative_risks',
      ].map((category, index) => ({
        id: 801 + index,
        category,
        state: 'pending',
        note: null,
        reviewedBy: null,
        reviewedAt: null,
        changeReference: null,
        followUp: null,
        version: 1,
        etag: `"quarterly-review-item:${801 + index}:1"`,
      })),
    },
  ],
};

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('quarterly review hooks', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('refetches canonical draft and review after a compact item receipt', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify(healthyReview), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ETag: healthyReview.draftEtag },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              receiptId: 501,
              operation: 'review_item_update',
              draftId: 11,
              targetId: 801,
              resultingRowVersion: 2,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ...healthyReview,
            completion: {
              companyCount: 1,
              completedCompanyCount: 0,
              pendingCompanyCount: 1,
              pendingItemCount: 4,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(internalAnalysisDraftsQueryKey(7), { drafts: [] });
    const wrapper = makeWrapper(queryClient);
    const review = renderHook(() => useQuarterlyReview(7, 11), { wrapper });
    const commands = renderHook(() => useQuarterlyReviewCommands(7, 11), { wrapper });

    await waitFor(() => expect(review.result.current.data?.draftVersion).toBe(3));

    await act(async () => {
      await commands.result.current.updateItem.mutateAsync({
        companyId: 301,
        category: 'cases_probabilities',
        etag: healthyReview.companies[0]!.items[0]!.etag,
        idempotencyKey: 'item-command-1',
        input: {
          state: 'reviewed_no_change',
          note: 'Base and downside cases remain current.',
        },
      });
    });

    await waitFor(() => expect(review.result.current.data?.completion.pendingItemCount).toBe(4));
    const commandRequest = fetchMock.mock.calls[1];
    expect(commandRequest?.[0]).toBe(
      '/api/funds/7/internal-analysis/drafts/11/quarterly-review/companies/301/items/cases_probabilities'
    );
    expect(commandRequest?.[1]).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({
        'If-Match': healthyReview.companies[0]!.items[0]!.etag,
        'Idempotency-Key': 'item-command-1',
      }),
    });
    expect(queryClient.getQueryState(internalAnalysisDraftsQueryKey(7))?.isInvalidated).toBe(true);
  });

  it('optimistically updates only the targeted item and restores it on a non-412 failure', async () => {
    let resolveResponse!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      })
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(quarterlyReviewQueryKey(7, 11), structuredClone(healthyReview));
    const commands = renderHook(() => useQuarterlyReviewCommands(7, 11), {
      wrapper: makeWrapper(queryClient),
    });

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = commands.result.current.updateItem.mutateAsync({
        companyId: 301,
        category: 'cases_probabilities',
        etag: healthyReview.companies[0]!.items[0]!.etag,
        idempotencyKey: 'optimistic-item-command',
        input: { state: 'reviewed_no_change', note: 'No change.' },
      });
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<typeof healthyReview>(quarterlyReviewQueryKey(7, 11))?.companies[0]
          ?.items[0]
      ).toMatchObject({ state: 'reviewed_no_change', note: 'No change.' })
    );
    expect(
      queryClient.getQueryData<typeof healthyReview>(quarterlyReviewQueryKey(7, 11))?.companies[0]
        ?.items[1]?.state
    ).toBe('pending');

    resolveResponse(
      new Response(JSON.stringify({ error: 'INVALID_REVIEW', message: 'Rejected.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(mutation).rejects.toMatchObject({ status: 400 });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<typeof healthyReview>(quarterlyReviewQueryKey(7, 11))?.companies[0]
          ?.items[0]
      ).toMatchObject({ state: 'pending', note: null })
    );
  });

  it('discards stale canonical state and refetches after an unseen 412', async () => {
    const fetchMock = vi.mocked(fetch);
    const currentReview = {
      ...healthyReview,
      draftVersion: 4,
      draftEtag: '"analysis-draft:11:4"',
    };
    let reviewReads = 0;
    let draftReads = 0;
    let resolveStale!: (response: Response) => void;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/quarterly-review') && init?.method === 'GET') {
        reviewReads += 1;
        return new Response(JSON.stringify(reviewReads === 1 ? healthyReview : currentReview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/internal-analysis/drafts') && init?.method === 'GET') {
        draftReads += 1;
        return new Response(
          JSON.stringify({ drafts: [{ draftId: 11, version: draftReads === 1 ? 3 : 4 }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (init?.method === 'PATCH') {
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(internalAnalysisDraftsQueryKey(7), { drafts: [] });
    const wrapper = makeWrapper(queryClient);
    const review = renderHook(() => useQuarterlyReview(7, 11), { wrapper });
    const drafts = renderHook(
      () =>
        useQuery<{ drafts: Array<{ draftId: number; version: number }> }>({
          queryKey: internalAnalysisDraftsQueryKey(7),
          queryFn: async () => {
            const response = await fetch('/api/funds/7/internal-analysis/drafts', {
              method: 'GET',
            });
            return response.json();
          },
        }),
      { wrapper }
    );
    const commands = renderHook(() => useQuarterlyReviewCommands(7, 11), { wrapper });

    await waitFor(() => expect(review.result.current.data?.draftVersion).toBe(3));
    await waitFor(() => expect(drafts.result.current.data?.drafts[0]?.version).toBe(3));

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = commands.result.current.updateItem.mutateAsync({
        companyId: 301,
        category: 'cases_probabilities',
        etag: healthyReview.companies[0]!.items[0]!.etag,
        idempotencyKey: 'stale-item-command',
        input: {
          state: 'reviewed_no_change',
          note: 'No change.',
        },
      });
    });

    await waitFor(() =>
      expect(review.result.current.data?.companies[0]?.items[0]).toMatchObject({
        state: 'reviewed_no_change',
        note: 'No change.',
      })
    );
    resolveStale(
      new Response(JSON.stringify({ error: 'DRAFT_VERSION_CONFLICT', message: 'Draft changed.' }), {
        status: 412,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await expect(mutation).rejects.toMatchObject({
      status: 412,
      code: 'DRAFT_VERSION_CONFLICT',
    });

    await waitFor(() => expect(review.result.current.data?.draftVersion).toBe(4));
    await waitFor(() => expect(drafts.result.current.data?.drafts[0]?.version).toBe(4));
    expect(review.result.current.data?.companies[0]?.items[0]).toMatchObject({
      state: 'pending',
      note: null,
    });
    expect(reviewReads).toBe(2);
    expect(draftReads).toBe(2);
  });

  it('rolls back an optimistic waiver and refetches canonical state after a typed 412', async () => {
    let reviewReads = 0;
    let resolveStale!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/quarterly-review') && init?.method === 'GET') {
        reviewReads += 1;
        return new Response(JSON.stringify(healthyReview), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/waiver') && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      }
      throw new Error(`Unexpected fetch: ${init?.method} ${url}`);
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = makeWrapper(queryClient);
    const review = renderHook(() => useQuarterlyReview(7, 11), { wrapper });
    const commands = renderHook(() => useQuarterlyReviewCommands(7, 11), { wrapper });
    await waitFor(() => expect(review.result.current.data).toBeDefined());

    let mutation!: Promise<unknown>;
    act(() => {
      mutation = commands.result.current.waiveCompany.mutateAsync({
        companyId: 301,
        etag: healthyReview.companies[0]!.etag,
        idempotencyKey: 'stale-waiver-command',
        input: { reason: 'Approved exception.' },
      });
    });
    await waitFor(() =>
      expect(review.result.current.data?.companies[0]).toMatchObject({
        waiverReason: 'Approved exception.',
      })
    );

    resolveStale(
      new Response(
        JSON.stringify({ error: 'COMPANY_VERSION_CONFLICT', message: 'Company changed.' }),
        { status: 412, headers: { 'Content-Type': 'application/json' } }
      )
    );
    await expect(mutation).rejects.toMatchObject({
      status: 412,
      code: 'COMPANY_VERSION_CONFLICT',
    });
    await waitFor(() => expect(reviewReads).toBe(2));
    expect(review.result.current.data?.companies[0]).toMatchObject({
      waivedAt: null,
      waiverReason: null,
    });
  });

  it('preserves safe corruption counts and response ETag for refresh-only recovery', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'QUARTERLY_REVIEW_ROSTER_CORRUPT',
          message: 'Quarterly review roster integrity check failed.',
          details: {
            draftId: 11,
            draftVersion: 3,
            financialFactsSnapshotId: 91,
            expectedCompanyCount: 4,
            actualCompanyCount: 3,
          },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json', ETag: healthyReview.draftEtag },
        }
      )
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const { result } = renderHook(() => useQuarterlyReview(7, 11), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.error?.code).toBe('QUARTERLY_REVIEW_ROSTER_CORRUPT'));
    expect(result.current.error).toMatchObject({
      status: 409,
      etag: healthyReview.draftEtag,
      details: { expectedCompanyCount: 4, actualCompanyCount: 3 },
    });
  });

  it('invalidates references, drafts, and review after save consumes its reference', async () => {
    const fetchMock = vi.mocked(fetch);
    queryClientFixture(fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const wrapper = makeWrapper(queryClient);
    queryClient.setQueryData(internalAnalysisDraftsQueryKey(7), { drafts: [healthyReview] });
    queryClient.setQueryData(['internal-analysis-references', 7, false], { references: [] });
    queryClient.setQueryData(quarterlyReviewQueryKey(7, 11), healthyReview);

    const commands = renderHook(() => useQuarterlyReviewCommands(7, 11), { wrapper });
    await act(async () => {
      const result = await commands.result.current.finalize.mutateAsync({
        etag: healthyReview.draftEtag,
        idempotencyKey: 'save-command-1',
        acknowledgeMixedBasis: false,
      });
      expect(result.reference.referenceId).toBe(901);
    });

    expect(queryClient.getQueryState(internalAnalysisDraftsQueryKey(7))?.isInvalidated).toBe(true);
    expect(
      queryClient.getQueryState(['internal-analysis-references', 7, false])?.isInvalidated
    ).toBe(true);
    expect(queryClient.getQueryState(quarterlyReviewQueryKey(7, 11))?.isInvalidated).toBe(true);
  });

  it('refetches canonical state after compact refresh instead of displaying receipt versions', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            receiptId: 601,
            operation: 'draft_refresh',
            draftId: 11,
            targetId: 11,
            resultingDraftVersion: 4,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(internalAnalysisDraftsQueryKey(7), { drafts: [] });
    queryClient.setQueryData(quarterlyReviewQueryKey(7, 11), healthyReview);
    const { result } = renderHook(() => useRefreshInternalAnalysisDraft(7, 11), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        etag: healthyReview.draftEtag,
        idempotencyKey: 'refresh-command-1',
      });
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      '/api/funds/7/internal-analysis/drafts/11/refresh',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'If-Match': healthyReview.draftEtag,
          'Idempotency-Key': 'refresh-command-1',
        }),
      })
    );
    expect(queryClient.getQueryState(internalAnalysisDraftsQueryKey(7))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(quarterlyReviewQueryKey(7, 11))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(quarterlyReviewQueryKey(7, 11))).not.toMatchObject({
      draftVersion: 4,
    });
  });

  it('refetches canonical state after compact economics replacement', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          result: {
            receiptId: 602,
            operation: 'economics_reference_replace',
            draftId: 11,
            targetId: 44,
            resultingDraftVersion: 4,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(internalAnalysisDraftsQueryKey(7), { drafts: [] });
    queryClient.setQueryData(quarterlyReviewQueryKey(7, 11), healthyReview);
    const { result } = renderHook(() => useReplaceInternalAnalysisEconomicsReference(7, 11), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        etag: healthyReview.draftEtag,
        idempotencyKey: 'economics-command-1',
        input: { economicsReferenceId: 44 },
      });
    });

    const request = vi.mocked(fetch).mock.calls[0];
    expect(request?.[0]).toBe('/api/funds/7/internal-analysis/drafts/11/economics-reference');
    expect(request?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ economicsReferenceId: 44 }),
      headers: expect.objectContaining({
        'If-Match': healthyReview.draftEtag,
        'Idempotency-Key': 'economics-command-1',
      }),
    });
    expect(queryClient.getQueryState(internalAnalysisDraftsQueryKey(7))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(quarterlyReviewQueryKey(7, 11))?.isInvalidated).toBe(true);
  });
});

function queryClientFixture(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>) {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        reference: {
          referenceId: 901,
          fundId: 7,
          sourceDraftId: 11,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    )
  );
}
