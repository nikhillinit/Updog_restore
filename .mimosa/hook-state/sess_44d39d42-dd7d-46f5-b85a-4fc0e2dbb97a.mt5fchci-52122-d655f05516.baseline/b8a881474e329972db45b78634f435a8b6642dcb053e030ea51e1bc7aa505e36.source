import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTasks } from '@/hooks/useTasks';
import {
  TaskCreateSchema,
  TaskResponseSchema,
} from '@shared/contracts/operating-objects/task.contract';

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
      text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
      json: vi.fn().mockResolvedValue(payload),
    })
  );
}
const sampleTask = {
  id: 1,
  fundId: 7,
  title: 'Follow up',
  status: 'open',
  ownerId: null,
  dueDate: null,
  description: null,
  createdAt: '2026-06-17T00:00:00.000Z',
  updatedAt: '2026-06-17T00:00:00.000Z',
  etag: 'W/"t1"',
};

describe('useTasks', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('GETs the fund-scoped tasks URL and returns data[]', async () => {
    mockFetchJson({ data: [sampleTask] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useTasks('7'), { wrapper: createWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetch).toHaveBeenCalledWith(
      '/api/funds/7/tasks',
      expect.objectContaining({ method: 'GET' })
    );
    expect(result.current.data).toEqual([sampleTask]);
  });

  it('is disabled when fundId is missing (no fetch)', () => {
    mockFetchJson({ data: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => useTasks(undefined), { wrapper: createWrapper(client) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('create contract requires fundId and rejects client-owned fields', () => {
    expect(TaskCreateSchema.safeParse({ title: 'x' }).success).toBe(false); // missing fundId
    expect(TaskCreateSchema.safeParse({ fundId: 7, title: 'x', status: 'open' }).success).toBe(
      false
    ); // strict: no status
    expect(TaskCreateSchema.safeParse({ fundId: 7, title: 'x' }).success).toBe(true);
  });

  it('response contract requires non-empty etag and forbids createdBy', () => {
    expect(TaskResponseSchema.safeParse({ ...sampleTask, etag: '' }).success).toBe(false);
    expect(TaskResponseSchema.safeParse({ ...sampleTask, createdBy: 5 }).success).toBe(false); // strict
    expect(TaskResponseSchema.safeParse(sampleTask).success).toBe(true);
  });
});
