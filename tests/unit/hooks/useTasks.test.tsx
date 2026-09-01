import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateTask, useTaskEvidenceLinks, useTasks } from '@/hooks/useTasks';
import type { ApiError } from '@/lib/queryClient';
import {
  TaskCreateSchema,
  TaskResponseSchema,
} from '@shared/contracts/operating-objects/task.contract';

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
} as const;

const sampleEvidenceLink = {
  contractVersion: 'task-evidence-link/1.0.0',
  linkId: 31,
  fundId: 7,
  taskId: 1,
  target: { kind: 'analysis_reference', id: 19 },
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

describe('useTasks', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'task-idempotency-key') });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns fund-scoped task rows from the list response', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [sampleTask] }));
    const client = createClient();
    const { result } = renderHook(() => useTasks('7'), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => expect(result.current.data).toEqual([sampleTask]));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/tasks',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('does not fetch tasks without a fund ID', () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = createClient();

    renderHook(() => useTasks(undefined), { wrapper: createWrapper(client) });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches task evidence only after the selected row is enabled', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: [sampleEvidenceLink] }));
    const client = createClient();
    const { result, rerender } = renderHook(
      ({ enabled }) => useTaskEvidenceLinks('7', 1, { enabled }),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(client),
      }
    );

    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toEqual([sampleEvidenceLink]));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/tasks/1/evidence-links',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('creates a task with an idempotency key', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(sampleTask, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateTask('7'), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Follow up' });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds/7/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fundId: 7, title: 'Follow up' }),
        headers: expect.objectContaining({ 'Idempotency-Key': 'task-idempotency-key' }),
      })
    );
  });

  it('invalidates only the fund task list after task creation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(sampleTask, 201));
    const client = createClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
    const { result } = renderHook(() => useCreateTask('7'), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Follow up' });
    });

    expect(invalidate).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', '7'] });
  });

  it('surfaces a forbidden task-create response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ message: 'Fund write role required' }, 403)
    );
    const client = createClient();
    const { result } = renderHook(() => useCreateTask('7'), {
      wrapper: createWrapper(client),
    });

    await expect(
      act(async () => result.current.mutateAsync({ fundId: 7, title: 'Follow up' }))
    ).rejects.toMatchObject<ApiError>({
      status: 403,
      message: 'Fund write role required',
    });
  });

  it('requires fundId and rejects client-owned task fields', () => {
    expect(TaskCreateSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ fundId: 7, title: 'x', status: 'open' }).success).toBe(
      false
    );
    expect(TaskCreateSchema.safeParse({ fundId: 7, title: 'x' }).success).toBe(true);
  });

  it('requires a non-empty task ETag and forbids createdBy', () => {
    expect(TaskResponseSchema.safeParse({ ...sampleTask, etag: '' }).success).toBe(false);
    expect(TaskResponseSchema.safeParse({ ...sampleTask, createdBy: 5 }).success).toBe(false);
    expect(TaskResponseSchema.safeParse(sampleTask).success).toBe(true);
  });
});
