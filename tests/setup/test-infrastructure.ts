// Test Infrastructure for Reliable Testing
// Provides state management, sandboxing, and cleanup utilities

import { vi } from 'vitest';
import crypto from 'crypto';

/**
 * TestStateManager - Captures and restores test state
 * Ensures complete isolation between tests
 */
export class TestStateManager {
  private snapshots = new Map<string, any>();

  captureSnapshot(key: string): void {
    this.snapshots.set(key, {
      env: { ...process.env },
      timers: this.captureTimers(),
      mocks: this.captureMocks(),
      memory: process.memoryUsage(),
      timestamp: Date.now()
    });
  }

  restoreSnapshot(key: string): void {
    const snapshot = this.snapshots.get(key);
    if (!snapshot) return;

    // Restore environment
    Object.keys(process.env).forEach(key => delete process.env[key]);
    Object.assign(process.env, snapshot.env);

    // Restore timers
    vi.clearAllTimers();
    vi.useRealTimers();

    // Clear all mocks
    vi.clearAllMocks();
    vi.resetModules();

    // Force GC if available
    if (global.gc) global.gc();
  }

  private captureTimers(): any {
    // Capture current timer state
    return {
      hasTimers: vi.isFakeTimers(),
      pendingTimers: vi.getTimerCount ? vi.getTimerCount() : 0
    };
  }

  private captureMocks(): any {
    // Capture mock state
    return {
      mockCount: vi.getMockedFunctions ? vi.getMockedFunctions().length : 0
    };
  }

  clear(): void {
    this.snapshots.clear();
  }
}

/**
 * TestSandbox - Isolated execution environment
 * Prevents test contamination
 */
export class TestSandbox {
  private namespace: string;
  private cleanup: Array<() => void | Promise<void>> = [];
  private abortController: AbortController;

  constructor() {
    this.namespace = `test_${crypto.randomUUID()}`;
    this.abortController = new AbortController();
  }

  async isolate<T>(fn: () => T | Promise<T>): Promise<T> {
    const original = (global as any).__testNamespace__;
    (global as any).__testNamespace__ = this.namespace;

    try {
      const result = await fn();
      return result;
    } finally {
      (global as any).__testNamespace__ = original;
      await this.runCleanup();
    }
  }

  addCleanup(fn: () => void | Promise<void>): void {
    this.cleanup.push(fn);
  }

  signal(): AbortSignal {
    return this.abortController.signal;
  }

  abort(): void {
    this.abortController.abort();
  }

  private async runCleanup(): Promise<void> {
    // Run cleanup in reverse order
    const cleanupFns = [...this.cleanup].reverse();
    this.cleanup = [];

    for (const fn of cleanupFns) {
      try {
        await fn();
      } catch (e) {
        console.error('Cleanup failed:', e);
      }
    }
  }
}

/**
 * TestTimeoutManager - Prevents test timeouts
 * Ensures proper async handling
 */
export class TestTimeoutManager {
  private timeouts = new Set<NodeJS.Timeout>();

  setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const timeout = setTimeout(() => {
      this.timeouts.delete(timeout);
      fn();
    }, ms);
    this.timeouts.add(timeout);
    return timeout;
  }

  clearTimeout(timeout: NodeJS.Timeout): void {
    clearTimeout(timeout);
    this.timeouts.delete(timeout);
  }

  clearAll(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
  }
}

/**
 * TestPromiseTracker - Tracks and manages promises
 * Prevents promise leaks and ensures proper resolution
 */
export class TestPromiseTracker {
  private promises = new Map<string, Promise<any>>();
  private settled = new Set<string>();

  track<T>(id: string, promise: Promise<T>): Promise<T> {
    this.promises.set(id, promise);
    
    promise
      .then(() => this.settled.add(id))
      .catch(() => this.settled.add(id))
      .finally(() => this.promises.delete(id));

    return promise;
  }

  async waitForAll(timeout = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (this.promises.size > 0) {
      if (Date.now() - startTime > timeout) {
        const pending = Array.from(this.promises.keys());
        throw new Error(`Promises still pending after ${timeout}ms: ${pending.join(', ')}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  getPending(): string[] {
    return Array.from(this.promises.keys());
  }

  clear(): void {
    this.promises.clear();
    this.settled.clear();
  }
}

// Export singleton instances
export const stateManager = new TestStateManager();
export const createSandbox = () => new TestSandbox();
export const timeoutManager = new TestTimeoutManager();
export const promiseTracker = new TestPromiseTracker();

// Test helper for deterministic async testing
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

// Test helper for flaky test detection
export async function runTestMultiple<T>(
  testFn: () => T | Promise<T>,
  iterations = 5
): Promise<{ results: T[]; failures: number; passRate: number }> {
  const results: T[] = [];
  let failures = 0;

  for (let i = 0; i < iterations; i++) {
    try {
      const result = await testFn();
      results.push(result);
    } catch (error) {
      failures++;
      console.error(`Test iteration ${i + 1} failed:`, error);
    }
  }

  return {
    results,
    failures,
    passRate: (iterations - failures) / iterations
  };
}