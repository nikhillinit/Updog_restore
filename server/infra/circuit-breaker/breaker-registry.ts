import { CircuitBreaker } from './CircuitBreaker';
import { CacheBreakerService } from './cache-breaker';
import { HttpBreakerService } from './http-breaker';

/**
 * Central registry for all circuit breakers in the application
 * Provides a single source of truth for monitoring and admin access
 */
export class BreakerRegistry {
  private static instance: BreakerRegistry;
  private breakers = new Map<string, CircuitBreaker<any> | CacheBreakerService | HttpBreakerService>();

  private constructor() {}

  static getInstance(): BreakerRegistry {
    if (!BreakerRegistry.instance) {
      BreakerRegistry.instance = new BreakerRegistry();
    }
    return BreakerRegistry.instance;
  }

  register(name: string, breaker: CircuitBreaker<any> | CacheBreakerService | HttpBreakerService): void {
    this.breakers.set(name, breaker);
    console.log(`[breaker-registry] Registered breaker: ${name}`);
  }

  get(name: string): CircuitBreaker<any> | CacheBreakerService | HttpBreakerService | undefined {
    return this.breakers.get(name);
  }

  getAll(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      result[name] = {
        state: breaker.getState(),
        stats: breaker.getStats?.() || {}
      };
    }
    return result;
  }

  // Get critical breakers for readiness checks
  getCritical(): Array<{ name: string; breaker: any }> {
    const critical: Array<{ name: string; breaker: any }> = [];
    
    // Add cache and database breakers as critical
    for (const [name, breaker] of this.breakers.entries()) {
      if (name.includes('cache') || name.includes('db') || name.includes('database')) {
        critical.push({ name, breaker });
      }
    }
    
    return critical;
  }

  // Health check: are any critical breakers open?
  isHealthy(): boolean {
    const critical = this.getCritical();
    return !critical.some(({ breaker }) => breaker.getState() === 'OPEN');
  }

  // Get degraded services (half-open or recently recovered)
  getDegraded(): string[] {
    const degraded: string[] = [];
    for (const [name, breaker] of this.breakers.entries()) {
      const state = breaker.getState();
      if (state === 'HALF_OPEN' || state === 'OPEN') {
        degraded.push(name);
      }
    }
    return degraded;
  }
}

// Singleton export
export const breakerRegistry = BreakerRegistry.getInstance();