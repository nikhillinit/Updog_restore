import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTimeout, withGeminiRetry } from '../../../server/services/ai-orchestrator';

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fn exactly once — no custom retry loop', async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) throw new Error('transient');
      return 'ok';
    };
    const pending = expect(withTimeout(fn)).rejects.toThrow('transient');
    await vi.advanceTimersByTimeAsync(5_000);
    await pending;
    expect(callCount).toBe(1);
  });

  it('rejects on timeout without waiting a real 90s', async () => {
    const fn = () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 999_999));
    const pending = expect(withTimeout(fn)).rejects.toThrow(/timeout/i);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(91_000);
    }
    await pending;
  });

  it('rejects immediately when callerSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn(async () => 'should not run');
    await expect(withTimeout(fn, controller.signal)).rejects.toThrow('Caller already aborted');
    expect(fn).not.toHaveBeenCalled();
  });

  it('forwards signal to fn and aborts on caller cancellation', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const fn = async (sig: AbortSignal) => {
      receivedSignal = sig;
      return new Promise<string>((_, reject) => {
        sig.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };
    const pending = expect(withTimeout(fn, controller.signal)).rejects.toThrow();
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(receivedSignal?.aborted).toBe(true);
  });

  it('drains late rejection without unhandled promise rejection', async () => {
    const fn = async () => {
      await new Promise<never>((_, reject) => setTimeout(() => reject(new Error('late')), 999_999));
    };
    const pending = expect(withTimeout(fn)).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(91_000);
    await pending;
    await vi.advanceTimersByTimeAsync(1_000_000);
    await vi.runAllTimersAsync();
  });

  it('aborts Gemini retry delay when signal fires', async () => {
    const controller = new AbortController();
    let attempts = 0;
    const fn = async (_sig: AbortSignal) => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('rate limit'), { status: 429 });
      return 'ok';
    };
    const pending = withGeminiRetry(fn, controller.signal);
    pending.catch(() => {});
    setTimeout(() => controller.abort(), 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).rejects.toThrow();
    expect(attempts).toBe(1);
  });
});
