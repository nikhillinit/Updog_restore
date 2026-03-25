import { TypedCircuitBreaker, type BreakerLike } from './typed-breaker';
import { envCircuit } from '../../../shared/config/env.circuit';
import { logger } from '../../lib/logger';

/**
 * Circuit breaker wrapper for HTTP operations
 * Protects against partner API failures with stale fallback support
 */
export class HttpBreakerService implements BreakerLike {
  private readonly breaker: TypedCircuitBreaker<unknown>;
  private readonly staleDataCache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private serviceName: string) {
    this.breaker = new TypedCircuitBreaker({
      failureThreshold: envCircuit.CB_HTTP_FAILURE_THRESHOLD,
      resetTimeout: envCircuit.CB_HTTP_RESET_TIMEOUT_MS,
      operationTimeout: envCircuit.CB_HTTP_OP_TIMEOUT_MS,
      successesToClose: envCircuit.CB_HTTP_SUCCESS_TO_CLOSE,
      maxHalfOpenRequests: envCircuit.CB_HTTP_HALF_OPEN_MAX_CONC,
      halfOpenRateLimit: { capacity: 3, refillPerSecond: 0.5 },
    });
  }

  async run<T>(operation: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    return this.breaker.run(
      operation,
      fallback ||
        (async () => {
          throw new Error('No fallback provided');
        })
    );
  }

  async execute<T>(
    operation: () => Promise<T>,
    cacheKey?: string,
    staleTimeoutMs = this.STALE_TTL_MS
  ): Promise<{ data: T; degraded: boolean }> {
    try {
      const result = await this.breaker.run(
        operation,
        // Fallback: try to get stale data
        cacheKey
          ? async () => {
              const staleData = this.getStaleData<T>(cacheKey, staleTimeoutMs);
              if (staleData === null) {
                throw new Error(`No stale data available for ${cacheKey}`);
              }
              return staleData;
            }
          : async () => {
              throw new Error('No fallback provided');
            }
      );

      // Cache fresh data for future fallback
      if (cacheKey) {
        this.storeStaleData(cacheKey, result);
      }

      return {
        data: result,
        degraded: this.breaker.getState() !== 'CLOSED',
      };
    } catch (error) {
      // Last resort: try stale data even if circuit breaker fails
      if (cacheKey) {
        const staleData = this.getStaleData<T>(cacheKey, staleTimeoutMs);
        if (staleData !== null) {
          logger.warn(
            { serviceName: this.serviceName, cacheKey },
            `[http-breaker:${this.serviceName}] Using stale data for ${cacheKey}`
          );
          return { data: staleData, degraded: true };
        }
      }
      throw error;
    }
  }

  private cloneStaleData<T>(data: T): T {
    return JSON.parse(JSON.stringify(data)) as unknown as T;
  }

  private storeStaleData<T>(key: string, data: T): void {
    this.staleDataCache['set'](key, {
      data: this.cloneStaleData(data),
      timestamp: Date.now(),
    });
  }

  private getStaleData<T>(key: string, staleTimeoutMs = this.STALE_TTL_MS): T | null {
    const cached = this.staleDataCache['get'](key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > staleTimeoutMs) {
      this.staleDataCache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  getState() {
    return this.breaker.getState();
  }

  getMetrics() {
    return this.breaker.getMetrics();
  }

  // Clean up old stale data periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.staleDataCache.entries()) {
      if (now - value.timestamp > this.STALE_TTL_MS) {
        this.staleDataCache.delete(key);
      }
    }
  }
}
