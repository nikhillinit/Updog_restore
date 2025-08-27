/**
 * Reserves Engine Test Setup - Ensures deterministic and non-leaky tests
 */
import { vi, beforeEach, afterEach } from 'vitest';

// Import cache clearing function
let clearCacheFunction: (() => void) | null = null;

// Dynamically import and set cache clear function
async function setupCacheClearing() {
  try {
    // Try client-side cache first
    const cacheModule = await import('@/lib/cache-strategy');
    if ('clearCache' in cacheModule) {
      clearCacheFunction = cacheModule.clearCache as () => void;
    } else if ('CalculationCache' in cacheModule) {
      // If it's a class, we'll need to clear static instances or create our own clearing mechanism
      clearCacheFunction = () => {
        // This will be implemented based on your cache architecture
        console.warn('Cache clearing not implemented for class-based cache');
      };
    }
  } catch (error) {
    // Try server-side cache if client cache fails
    try {
      const serverCache = await import('@server/lib/cache');
      if ('clearCache' in serverCache) {
        clearCacheFunction = serverCache.clearCache as () => void;
      }
    } catch (serverError) {
      console.warn('No cache clearing function found');
    }
  }
}

// Initialize cache clearing
setupCacheClearing();

beforeEach(() => {
  // Clear all caches to prevent test contamination
  if (clearCacheFunction) {
    clearCacheFunction();
  }

  // Use fake timers for deterministic time-based behavior
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));

  // Stabilize randomness for any stochastic calculations
  vi.spyOn(Math, 'random').mockReturnValue(0.42);

  // Mock Date.now() to be stable
  vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-01-01T00:00:00Z').getTime());

  // Mock performance.now() for stable timing
  if (typeof performance !== 'undefined') {
    vi.spyOn(performance, 'now').mockReturnValue(0);
  }
});

afterEach(() => {
  // Restore all mocks and timers
  vi.restoreAllMocks();
  vi.useRealTimers();
  
  // Clear any remaining cache state
  if (clearCacheFunction) {
    clearCacheFunction();
  }
});

// Export for use in test files that need manual cache clearing
export const clearReservesCache = () => {
  if (clearCacheFunction) {
    clearCacheFunction();
  }
};

// Export stable test data factories
export const createStableTimestamp = (offsetHours = 0) => {
  return new Date(2024, 0, 1, offsetHours, 0, 0, 0);
};

export const createStableId = (suffix: string) => {
  // Generate deterministic UUIDs for tests
  const base = '12345678-1234-1234-1234-123456789';
  return `${base}${suffix.padStart(3, '0')}`;
};

// Tolerance helpers for floating-point comparisons
export const expectCloseTo = (actual: number, expected: number, precision = 8) => {
  return expect(actual).toBeCloseTo(expected, precision);
};

export const expectArrayCloseTo = (actual: number[], expected: number[], precision = 8) => {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((val, idx) => {
    expect(val).toBeCloseTo(expected[idx], precision);
  });
};