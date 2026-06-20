import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLPRecentDocuments } from '@/hooks/useLPDocuments';
import { useLPDistributionsSummary } from '@/hooks/useLPDistributions';
import {
  useLPNotifications,
  useMarkAllNotificationsRead,
} from '@/hooks/useLPNotifications';

const { mockUseLPContext } = vi.hoisted(() => ({
  mockUseLPContext: vi.fn(),
}));

vi.mock('@/contexts/LPContext', () => ({
  useLPContext: () => mockUseLPContext(),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryDelay: 1,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('LP dashboard widget hook HTTP response handling', () => {
  beforeEach(() => {
    mockUseLPContext.mockReturnValue({ lpId: 17 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('maps runtime document list fields for recent document widgets', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({
        documents: [
          {
            id: 'doc-1',
            fundId: 7,
            fundName: 'Fund VII',
            documentType: 'quarterly_report',
            title: 'Q4 Report',
            description: null,
            fileName: 'q4.pdf',
            fileSize: 2_500_000,
            mimeType: 'application/pdf',
            documentDate: '2025-12-31',
            publishedAt: '2026-01-01T00:00:00.000Z',
            accessLevel: 'sensitive',
          },
        ],
        nextCursor: null,
        hasMore: false,
        totalCount: 1,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLPRecentDocuments({ limit: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/lp/documents?lpId=17&limit=1');
    expect(result.current.data?.recentDocuments[0]).toMatchObject({
      id: 'doc-1',
      fileType: 'application/pdf',
      fileSizeBytes: 2_500_000,
      reportingPeriod: '2025-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
      isConfidential: true,
    });
    expect(result.current.data?.recentDocuments[0]?.downloadUrl).toBeUndefined();
  });

  it('maps runtime notification read state and unread count fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
        jsonResponse({
          notifications: [
            {
              id: 'notification-1',
              type: 'report_ready',
              title: 'Report ready',
              message: 'Your quarterly report is ready.',
              relatedEntityType: 'report',
              relatedEntityId: 'report-1',
              actionUrl: '/lp/reports/report-1',
              read: false,
              readAt: null,
              createdAt: '2026-01-02T00:00:00.000Z',
            },
          ],
          nextCursor: null,
          hasMore: false,
          unreadCount: 1,
        })
      )
    );

    const { result } = renderHook(() => useLPNotifications({ limit: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.notifications[0]).toMatchObject({
      id: 'notification-1',
      lpId: 17,
      type: 'report_ready',
      priority: 'normal',
      isRead: false,
    });
    expect(result.current.data?.totalUnread).toBe(1);
  });

  it('posts read-all mutations to the runtime route', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({ success: true, markedCount: 2 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith('/api/lp/notifications/read-all?lpId=17', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(result.current.data).toEqual({ success: true, count: 2 });
  });

  it('summarizes runtime distribution totals for the dashboard widget', async () => {
    const currentYear = new Date().getFullYear();
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          distributions: [
            {
              id: 'dist-1',
              fundId: 7,
              fundName: 'Fund VII',
              distributionNumber: 4,
              distributionType: 'capital_gains',
              totalAmount: '12500000',
              distributionDate: '2026-01-15',
              status: 'completed',
            },
          ],
          nextCursor: null,
          hasMore: false,
          totalDistributed: '12500000',
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          summary: [
            {
              year: currentYear,
              totalDistributed: '5000000',
            },
          ],
          totalAllTime: '25000000',
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useLPDistributionsSummary(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      totalDistributed: '25000000',
      ytdDistributed: '5000000',
      pendingDistributions: 0,
    });
    expect(result.current.data?.recentDistributions[0]).toMatchObject({
      id: 'dist-1',
      grossAmount: '12500000',
      netAmount: '12500000',
      recordDate: '2026-01-15',
      paymentDate: null,
      paymentMethod: null,
      taxYear: null,
    });
  });
});
