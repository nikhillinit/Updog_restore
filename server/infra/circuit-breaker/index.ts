import { CircuitBreaker } from './CircuitBreaker';
import type { CircuitBreakerOptions } from './types';

export function createBreaker<T>(preset: 'cache' | 'http' | 'db', operation: () => Promise<T>, fallback: () => Promise<T>, overrides?: Partial<CircuitBreakerOptions>) {
  const base: Record<typeof preset, CircuitBreakerOptions> = {
    cache: {
      failureThreshold: 5,
      resetTimeout: 10_000,
      operationTimeout: 350,
      successesToClose: 2,
      maxHalfOpenRequests: 3,
    },
    http: {
      failureThreshold: 3,
      resetTimeout: 5_000,
      operationTimeout: 500,
      successesToClose: 2,
      maxHalfOpenRequests: 2,
    },
    db: {
      failureThreshold: 4,
      resetTimeout: 8_000,
      operationTimeout: 400,
      successesToClose: 2,
      maxHalfOpenRequests: 2,
      monitoringPeriod: 60_000, // optional rolling window
    },
  } as any;
  const opts = { ...base[preset], ...overrides };
  return new CircuitBreaker<T>(opts, operation, fallback);
}

export { CircuitBreaker };
