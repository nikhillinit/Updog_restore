import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateTask,
  useCreateTaskEvidenceLink,
  useTaskEvidenceLinks,
  useTasks,
  useUpdateTask,
} from '@/hooks/useTasks';
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

  it('reuses the idempotency key on retry after failure and mints a fresh key after success', async () => {
    let uuidCounter = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `uuid-${++uuidCounter}`) });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
      .mockResolvedValueOnce(jsonResponse(sampleTask, 201))
      .mockResolvedValueOnce(jsonResponse(sampleTask, 201));
    const client = createClient();
    const { result } = renderHook(() => useCreateTask('7'), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Follow up' }).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Follow up' });
    });
    await act(async () => {
      await result.current.mutateAsync({ fundId: 7, title: 'Follow up' });
    });

    const keys = fetchMock.mock.calls.map(
      ([, init]) => ((init as RequestInit).headers as Record<string, string>)['Idempotency-Key']
    );
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).toBeDefined();
    expect(keys[2]).not.toBe(keys[1]);
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

  it.each(['connection loss', 'lock refusal'])(
    'mounted task update retries %s with the original body, ETag and command key',
    async (failure) => {
      let key = 0;
      vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `update-${++key}`) });
      const saved = { ...sampleTask, status: 'done', etag: 'W/"accepted-update"' };
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      if (failure === 'lock refusal') {
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Failed to update task' }, 500));
      } else {
        fetchMock.mockRejectedValueOnce(new TypeError('Connection lost'));
      }
      fetchMock
        .mockResolvedValueOnce(jsonResponse(saved))
        .mockResolvedValueOnce(jsonResponse(saved));
      const client = createClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useUpdateTask('7'), { wrapper: createWrapper(client) });
      const command = { taskId: 1, etag: sampleTask.etag, input: { status: 'done' as const } };

      await act(async () => {
        await result.current.mutateAsync(command).catch(() => undefined);
      });
      await act(async () => {
        await result.current.mutateAsync(command);
      });
      await waitFor(() => expect(result.current.data).toEqual(saved));
      await act(async () => {
        await result.current.mutateAsync(command);
      });

      const requests = fetchMock.mock.calls.map(([, init]) => init as RequestInit);
      expect(requests[0]).toMatchObject({
        method: 'PATCH',
        body: JSON.stringify(command.input),
        headers: { 'If-Match': sampleTask.etag, 'Idempotency-Key': 'update-1' },
      });
      expect(requests[1]).toEqual(requests[0]);
      expect(requests[2]?.headers).toMatchObject({ 'Idempotency-Key': 'update-2' });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/funds/7/tasks/1');
      expect(invalidate).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', '7'] });
    }
  );

  it('changes task command identity for changed fields, version, task, fund, or explicit reset', async () => {
    let key = 0;
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `update-${++key}`) });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse({ message: 'Temporary failure' }, 503));
    const { result, rerender } = renderHook(({ fundId }) => useUpdateTask(fundId), {
      initialProps: { fundId: '7' },
      wrapper: createWrapper(createClient()),
    });
    const initial = { taskId: 1, etag: sampleTask.etag, input: { title: 'Updated' } };
    const changed = { ...initial, input: { title: 'Changed again' } };
    const refreshed = { ...changed, etag: 'W/"refreshed"' };
    const otherTask = { ...refreshed, taskId: 2 };
    for (const command of [initial, initial, changed, refreshed, otherTask]) {
      await act(async () => {
        await result.current.mutateAsync(command).catch(() => undefined);
      });
    }
    rerender({ fundId: '8' });
    await act(async () => {
      await result.current.mutateAsync(otherTask).catch(() => undefined);
    });
    act(() => result.current.reset());
    await act(async () => {
      await result.current.mutateAsync(otherTask).catch(() => undefined);
    });
    const keys = fetchMock.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']
    );
    expect(keys).toEqual([
      'update-1',
      'update-1',
      'update-2',
      'update-3',
      'update-4',
      'update-5',
      'update-6',
    ]);
  });

  it.each([412, 403, 409])(
    'surfaces task update %s and only refreshes the list for a stale version',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse({ message: 'Update refused' }, status)
      );
      const client = createClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useUpdateTask('7'), { wrapper: createWrapper(client) });
      await act(async () => {
        await result.current
          .mutateAsync({ taskId: 1, etag: sampleTask.etag, input: { title: 'Edit' } })
          .catch(() => undefined);
      });
      await waitFor(() =>
        expect(result.current.error).toMatchObject({ status, message: 'Update refused' })
      );
      expect(invalidate).toHaveBeenCalledTimes(status === 412 ? 1 : 0);
      if (status === 412) expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tasks', '7'] });
    }
  );

  it('refuses a task update without an opaque version before sending a request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useUpdateTask('7'), {
      wrapper: createWrapper(createClient()),
    });
    await act(async () => {
      await result.current
        .mutateAsync({ taskId: 1, etag: '', input: { status: 'done' } })
        .catch(() => undefined);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.error?.message).toContain('ETag'));
  });

  it.each(['analysis_reference', 'internal_economics_run'] as const)(
    'attaches %s evidence with stable retry identity and scoped invalidation',
    async (kind) => {
      let key = 0;
      vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `link-${++key}`) });
      const linked = { ...sampleEvidenceLink, target: { kind, id: 19 } };
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new TypeError('Connection lost'))
        .mockResolvedValueOnce(jsonResponse(linked))
        .mockResolvedValueOnce(jsonResponse(linked));
      const client = createClient();
      const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);
      const { result } = renderHook(() => useCreateTaskEvidenceLink('7'), {
        wrapper: createWrapper(client),
      });
      const command = { taskId: 1, input: { target: { kind, id: 19 } } };
      await act(async () => {
        await result.current.mutateAsync(command).catch(() => undefined);
      });
      await act(async () => {
        await result.current.mutateAsync(command);
      });
      await act(async () => {
        await result.current.mutateAsync(command);
      });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/funds/7/tasks/1/evidence-links');
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify(command.input),
        headers: { 'Idempotency-Key': 'link-1' },
      });
      expect(fetchMock.mock.calls[1]).toEqual(fetchMock.mock.calls[0]);
      expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': 'link-2' });
      expect(invalidate.mock.calls).toEqual([
        [{ queryKey: ['tasks', '7'] }],
        [{ queryKey: ['task-evidence-links', '7', 1] }],
        [{ queryKey: ['tasks', '7'] }],
        [{ queryKey: ['task-evidence-links', '7', 1] }],
      ]);
    }
  );
});
