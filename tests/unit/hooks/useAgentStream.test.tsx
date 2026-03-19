import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStream } from '@/hooks/useAgentStream';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: loggerMocks,
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback =
      typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
    const existing = this.listeners.get(type) ?? [];
    existing.push(callback);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, payload: string): void {
    const event = new MessageEvent(type, { data: payload });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  emitNetworkError(): void {
    this.onerror?.(new Event('error'));
  }

  static latest(): MockEventSource {
    const latest = MockEventSource.instances.at(-1);
    if (!latest) {
      throw new Error('Expected an EventSource instance');
    }
    return latest;
  }

  static reset(): void {
    MockEventSource.instances = [];
  }
}

describe('useAgentStream', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    MockEventSource.reset();
    vi.clearAllMocks();
    vi.stubGlobal('EventSource', MockEventSource);
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses status, partial, delta, and complete events before closing the stream', async () => {
    const { result } = renderHook(() => useAgentStream('run-123'));
    const source = MockEventSource.latest();

    expect(source.url).toBe('/api/agents/stream/run-123');
    expect(result.current.status).toBe('connecting');

    act(() => {
      source.emit('status', JSON.stringify({ msg: 'Connected' }));
      source.emit('partial', JSON.stringify({ chunk: 'first' }));
      source.emit('delta', JSON.stringify({ chunk: 'second' }));
      source.emit('complete', JSON.stringify({ done: true }));
    });

    await waitFor(() => {
      expect(result.current.status).toBe('complete');
    });

    expect(result.current.partials).toEqual([
      { chunk: 'first' },
      { chunk: 'second' },
      { done: true },
    ]);
    expect(result.current.isComplete).toBe(true);
    expect(source.closed).toBe(true);
  });

  it('fails closed when a stream payload is not valid JSON', async () => {
    const { result } = renderHook(() => useAgentStream('run-bad-payload'));
    const source = MockEventSource.latest();

    act(() => {
      source.emit('partial', 'not-json');
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).toBe('Invalid stream payload');
    expect(source.closed).toBe(true);
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Invalid agent stream payload',
      expect.any(Error),
      expect.objectContaining({ runId: 'run-bad-payload', eventType: 'partial' })
    );
  });

  it('cancels the active run via DELETE and resets local state', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      statusText: 'OK',
    });

    const { result } = renderHook(() => useAgentStream('run-cancel'));
    const source = MockEventSource.latest();

    await act(async () => {
      await result.current.cancel();
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/agents/run/run-cancel', {
      method: 'DELETE',
    });
    expect(source.closed).toBe(true);
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBe('Cancelled by user');
  });
});
