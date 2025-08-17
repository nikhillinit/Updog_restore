import { CircuitBreaker } from './CircuitBreaker';
import { envCircuit } from '../../../shared/config/env.circuit';

/**
 * Circuit breaker wrapper for HTTP operations
 * Protects against partner API failures with stale fallback support
 */
export class HttpBreakerService {
  private breaker: CircuitBreaker<any>;
  private staleDataCache = new Map<string, { data: any; timestamp: number }>();
  private readonly STALE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(private serviceName: string) {
    this.breaker = new CircuitBreaker({
      failureThreshold: envCircuit.CB_HTTP_FAILURE_THRESHOLD,
      resetTimeout: envCircuit.CB_HTTP_RESET_TIMEOUT_MS,
      operationTimeout: envCircuit.CB_HTTP_OP_TIMEOUT_MS,
      successesToClose: envCircuit.CB_HTTP_SUCCESS_TO_CLOSE,
      maxHalfOpenRequests: envCircuit.CB_HTTP_HALF_OPEN_MAX_CONC,
      halfOpenRateLimit: { capacity: 3, refillPerSecond: 0.5 },
      onStateChange: (state) => {
        console.log(`[http-breaker:${this.serviceName}] State changed to: ${state}`);
      }
    });
  }

  async execute<T>(
    operation: () => Promise<T>,
    cacheKey?: string,
    staleTimeoutMs?: number
  ): Promise<{ data: T; degraded: boolean }> {
    try {
      const result = await this.breaker.execute(
        operation,
        // Fallback: try to get stale data
        cacheKey ? () => this.getStaleData(cacheKey) : undefined
      );

      // Cache fresh data for future fallback
      if (cacheKey && result !== null && result !== undefined) {
        this.storeStaleData(cacheKey, result);
      }

      return { 
        data: result, 
        degraded: this.breaker.getState() !== 'CLOSED' 
      };
    } catch (error) {
      // Last resort: try stale data even if circuit breaker fails
      if (cacheKey) {
        const staleData = this.getStaleData(cacheKey);
        if (staleData !== null) {
          console.warn(`[http-breaker:${this.serviceName}] Using stale data for ${cacheKey}`);
          return { data: staleData, degraded: true };
        }
      }
      throw error;
    }
  }

  private storeStaleData(key: string, data: any): void {
    this.staleDataCache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: Date.now()
    });
  }

  private getStaleData(key: string): any | null {
    const cached = this.staleDataCache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.STALE_TTL_MS) {
      this.staleDataCache.delete(key);
      return null;
    }

    return cached.data;
  }

  getState() {
    return this.breaker.getState();
  }

  getStats() {
    return this.breaker.getStats();
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