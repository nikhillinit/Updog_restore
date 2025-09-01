/**
 * Type-safe wrapper for CircuitBreaker to avoid 'as any' casts
 */
import { CircuitBreaker } from './CircuitBreaker';
import type { CircuitBreakerOptions } from './types';

// Common interface for all breaker types
export interface BreakerLike {
  run<T>(op: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  getState(): string;                  
  getMetrics?(): unknown;          
}

export class TypedCircuitBreaker<T = any> implements BreakerLike {
  private breaker: CircuitBreaker<T>;

  constructor(options: CircuitBreakerOptions) {
    // Create with dummy operation and fallback since we'll use run() method
    this.breaker = new CircuitBreaker<T>(
      options,
      async () => { throw new Error('Use run method'); },
      async () => { throw new Error('Use run method'); }
    );
  }

  async run<R>(
    operation: () => Promise<R>,
    fallback?: () => Promise<R>
  ): Promise<R> {
    return this.breaker.run(operation, fallback || (async () => { throw new Error('No fallback provided'); }));
  }

  getState(): string {
    return this.breaker.getState();
  }

  getMetrics() {
    return this.breaker.getMetrics?.();
  }
}