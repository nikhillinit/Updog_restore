// Test Infrastructure for Reliable Testing
// Provides state management, sandboxing, and cleanup utilities

import crypto from 'crypto';
import type { MemoryUsage, ProcessEnv } from 'node:process';
import type { Mock } from 'vitest';
import { vi } from 'vitest';

type TimerSnapshot = {
  hasTimers: boolean;
  pendingTimers: number;
};

type MockSnapshot = {
  mockCount: number;
};

type Snapshot = {
  env: ProcessEnv;
  timers: TimerSnapshot;
  mocks: MockSnapshot;
  memory: MemoryUsage;
  timestamp: number;
};

type CleanupFn = () => void | Promise<void>;

type TestGlobal = typeof globalThis & {
  __testNamespace__?: string;
};

/**
 * Crypto Polyfill for Node.js Test Environment
 *
 * Ensures `globalThis.crypto` is available for UUID generation and other crypto operations.
 * Node.js 18+ has `crypto.webcrypto`, but it's not automatically exposed as `globalThis.crypto`.
 * This polyfill prevents "crypto is not defined" errors in tests that use Web Crypto API.
 */
if (!globalThis.crypto) {
  // @ts-expect-error - Node.js crypto.webcrypto is compatible with Web Crypto API
  globalThis.crypto = crypto.webcrypto;
}

/**
 * TestStateManager - Captures and restores test state
 * Ensures complete isolation between tests
 */
export class TestStateManager {
  private snapshots = new Map<string, Snapshot>();

  captureSnapshot(key: string): void {
    const envSnapshot: Snapshot['env'] = { ...process.env };

    const snapshot: Snapshot = {
      // Cloning process.env preserves string | undefined values, but eslint lacks
      // the type refinement on spread env objects here.

      env: envSnapshot,
      timers: this.captureTimers(),
      mocks: this.captureMocks(),
      memory: process.memoryUsage(),
      timestamp: Date.now(),
    };

    this.snapshots.set(key, snapshot);
  }

  restoreSnapshot(key: string): void {
    const snapshot = this.snapshots.get(key);
    if (!snapshot) return;

    // Restore environment
    Object.keys(process.env).forEach((key) => delete process.env[key]);
    Object.assign(process.env, snapshot.env);

    // Restore timers
    vi.clearAllTimers();
    vi.useRealTimers();

    // Clear all mocks and restore spies/stubs without reloading modules.
    // NOTE: Avoid vi.resetModules() here because React is already loaded by the
    // jsdom setup file; resetting modules after React loads can create multiple
    // React singletons and corrupt the hook dispatcher between tests.
    vi.clearAllMocks();
    vi.restoreAllMocks();

    // Force GC if available
    if (global.gc) global.gc();
  }

  private captureTimers(): TimerSnapshot {
    // Capture current timer state
    const getTimerCount = vi.getTimerCount;
    return {
      hasTimers: vi.isFakeTimers(),
      pendingTimers: typeof getTimerCount === 'function' ? getTimerCount() : 0,
    };
  }

  private captureMocks(): MockSnapshot {
    // Capture mock state
    const getMockedFunctions = vi.getMockedFunctions as (() => readonly Mock[]) | undefined;
    const mockedFunctions: readonly Mock[] = getMockedFunctions?.() ?? [];

    return {
      mockCount: mockedFunctions.length,
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
  private cleanup: CleanupFn[] = [];
  private abortController: AbortController;

  constructor() {
    this.namespace = `test_${crypto.randomUUID()}`;
    this.abortController = new AbortController();
  }

  async isolate<T>(fn: () => T | Promise<T>): Promise<T> {
    const testGlobal = globalThis as TestGlobal;
    const original = testGlobal.__testNamespace__;
    testGlobal.__testNamespace__ = this.namespace;

    try {
      const result = await fn();
      return result;
    } finally {
      testGlobal.__testNamespace__ = original;
      await this.runCleanup();
    }
  }

  addCleanup(fn: CleanupFn): void {
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
      } catch (error: unknown) {
        console.error('Cleanup failed:', error);
      }
    }
  }
}

/**
 * TestTimeoutManager - Prevents test timeouts
 * Ensures proper async handling
 */
export class TestTimeoutManager {
  private timeouts = new Set<ReturnType<typeof setTimeout>>();

  setTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
    const timeout = setTimeout(() => {
      this.timeouts.delete(timeout);
      fn();
    }, ms);
    this.timeouts.add(timeout);
    return timeout;
  }

  clearTimeout(timeout: ReturnType<typeof setTimeout>): void {
    clearTimeout(timeout);
    this.timeouts.delete(timeout);
  }

  clearAll(): void {
    this.timeouts.forEach((timeout) => clearTimeout(timeout));
    this.timeouts.clear();
  }
}

/**
 * TestPromiseTracker - Tracks and manages promises
 * Prevents promise leaks and ensures proper resolution
 */
export class TestPromiseTracker {
  private promises = new Map<string, Promise<unknown>>();
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

      await new Promise((resolve) => setTimeout(resolve, 10));
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
    await new Promise((resolve) => setTimeout(resolve, interval));
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
    passRate: (iterations - failures) / iterations,
  };
}

/**
 * Financial Calculation Tolerance Helpers
 *
 * IRR/XIRR calculations use iterative numerical methods (Newton-Raphson, Brent's method)
 * which introduce floating-point drift. These helpers provide:
 * - Excel-parity tolerance (1e-7 for XIRR, matching Excel precision)
 * - General financial tolerance (1e-6 for most calculations)
 * - Clear error messages for debugging
 */

/**
 * Standard tolerance for XIRR/IRR comparisons
 *
 * Why 1e-7?
 * - Excel XIRR function uses ~7 decimal places of precision
 * - Newton-Raphson typically converges to 1e-7 tolerance
 * - Handles floating-point drift from:
 *   - Date arithmetic (milliseconds -> years conversion)
 *   - Compound interest calculations (Math.pow with fractional exponents)
 *   - Iterative root-finding algorithms
 *
 * Use this for validating IRR/XIRR results against Excel golden sets.
 */
export const EXCEL_IRR_TOLERANCE = 1e-7;

/**
 * General financial calculation tolerance
 *
 * Use for:
 * - MOIC, DPI, TVPI (ratio calculations)
 * - Fee calculations
 * - NAV computations
 * - Capital allocation percentages
 */
export const FINANCIAL_TOLERANCE = 1e-6;

/**
 * Assert that two IRR/XIRR values are approximately equal
 *
 * @param actual - Computed IRR value
 * @param expected - Expected IRR value (from Excel or golden set)
 * @param tolerance - Allowed difference (default: EXCEL_IRR_TOLERANCE)
 * @throws Error with clear message if values differ beyond tolerance
 *
 * @example
 * ```ts
 * const irr = xirrNewtonBisection(flows).irr;
 * assertIRREquals(irr, 0.148698355); // Excel XIRR result
 * ```
 */
export function assertIRREquals(
  actual: number | null,
  expected: number,
  tolerance: number = EXCEL_IRR_TOLERANCE
): void {
  if (actual === null) {
    throw new Error(`IRR assertion failed: actual is null, expected ${expected.toFixed(9)}`);
  }

  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `IRR assertion failed:\n` +
        `  Expected: ${expected.toFixed(9)}\n` +
        `  Actual:   ${actual.toFixed(9)}\n` +
        `  Diff:     ${diff.toExponential(2)} (tolerance: ${tolerance.toExponential(2)})`
    );
  }
}

/**
 * Assert that a financial ratio/percentage is approximately equal
 *
 * @param actual - Computed value (MOIC, DPI, TVPI, etc.)
 * @param expected - Expected value
 * @param tolerance - Allowed difference (default: FINANCIAL_TOLERANCE)
 * @throws Error with clear message if values differ beyond tolerance
 *
 * @example
 * ```ts
 * const tvpi = calculateTVPI(deployed, distributions, nav);
 * assertFinancialEquals(tvpi, 2.35, 1e-4); // 4 decimal places
 * ```
 */
export function assertFinancialEquals(
  actual: number | null | undefined,
  expected: number,
  tolerance: number = FINANCIAL_TOLERANCE
): void {
  if (actual === null || actual === undefined) {
    throw new Error(
      `Financial assertion failed: actual is ${actual}, expected ${expected.toFixed(6)}`
    );
  }

  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      `Financial assertion failed:\n` +
        `  Expected: ${expected.toFixed(6)}\n` +
        `  Actual:   ${actual.toFixed(6)}\n` +
        `  Diff:     ${diff.toExponential(2)} (tolerance: ${tolerance.toExponential(2)})`
    );
  }
}

/**
 * Check if two IRR values are approximately equal (boolean variant)
 *
 * Useful for conditional logic in tests without throwing errors.
 *
 * @example
 * ```ts
 * if (!isIRRClose(computed, expected)) {
 *   console.warn('IRR mismatch, falling back to alternative method');
 * }
 * ```
 */
export function isIRRClose(
  actual: number | null,
  expected: number,
  tolerance: number = EXCEL_IRR_TOLERANCE
): boolean {
  if (actual === null) return false;
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Check if two financial values are approximately equal (boolean variant)
 */
export function isFinancialClose(
  actual: number | null | undefined,
  expected: number,
  tolerance: number = FINANCIAL_TOLERANCE
): boolean {
  if (actual === null || actual === undefined) return false;
  return Math.abs(actual - expected) <= tolerance;
}
