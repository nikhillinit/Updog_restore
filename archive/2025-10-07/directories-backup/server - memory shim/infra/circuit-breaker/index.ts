import type { CircuitBreakerOptions } from './types';
import { CircuitBreaker } from './CircuitBreaker';

export type Preset = 'cache' | 'http' | 'db';

export function createBreaker<T>(
  preset: Preset,
  deps: { operation: () => Promise<T>; fallback: () => Promise<T> },
  overrides: Partial<CircuitBreakerOptions> = {}
) {
  const base: Record<Preset, CircuitBreakerOptions> = {
    cache: {
      failureThreshold: 5, resetTimeout: 10_000, operationTimeout: 350,
      successesToClose: 2, maxHalfOpenRequests: 3, halfOpenRateLimit: { capacity: 5, refillPerSecond: 1 },
      adaptiveThreshold: { enabled: false, min: 3, max: 10, rate: 0.1 }
    },
    http: {
      failureThreshold: 3, resetTimeout: 5_000, operationTimeout: 500,
      successesToClose: 2, maxHalfOpenRequests: 2, halfOpenRateLimit: { capacity: 3, refillPerSecond: 0.5 },
      adaptiveThreshold: { enabled: false, min: 2, max: 8, rate: 0.1 }
    },
    db: {
      failureThreshold: 4, resetTimeout: 8_000, operationTimeout: 400,
      successesToClose: 2, maxHalfOpenRequests: 2, halfOpenRateLimit: { capacity: 3, refillPerSecond: 1 },
      adaptiveThreshold: { enabled: false, min: 3, max: 10, rate: 0.1 }
    }
  };
  const opts = { ...base[preset], ...overrides };
  return new CircuitBreaker(opts, deps.operation, deps.fallback);
}
